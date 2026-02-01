# SPDX-License-Identifier: Apache-2.0
# Mock T2V streaming server — replicates the WebSocket protocol of release_server.py
# using synthetic frames. Zero ML dependencies.

import base64
import io
import math
import asyncio
import colorsys
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont

# -----------------------------------------------------------------------------
# CONFIG (mirrors the defaults you'd see in a real config yaml)
# -----------------------------------------------------------------------------

FRAME_WIDTH = 832          # 104 * 8  (matches latent width * VAE upscale)
FRAME_HEIGHT = 480         # 60 * 8
NUM_OUTPUT_FRAMES = 120    # total frames in a full video
NUM_FRAME_PER_BLOCK = 6    # frames per denoising block
FPS = 16                   # playback fps (used only for reference / debug saves)

# Simulated per-block latency in seconds.
# Real inference spends most time here; tweak to taste.
SIMULATED_BLOCK_LATENCY_SEC = 0.15

# -----------------------------------------------------------------------------
# APP
# -----------------------------------------------------------------------------

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# FRAME GENERATION HELPERS
# -----------------------------------------------------------------------------

# A small palette of distinct hues, one per segment/prompt.
_SEGMENT_HUES = [0.0, 0.08, 0.33, 0.58, 0.75]


def _segment_for_frame(
    frame_idx: int, switch_frame_indices: List[int]
) -> int:
    """Return which segment (0-based) a frame belongs to."""
    for seg, boundary in enumerate(switch_frame_indices):
        if frame_idx < boundary:
            return seg
    return len(switch_frame_indices)  # last segment


def _make_frame(
    frame_idx: int,
    total_frames: int,
    prompt: str,
    segment_idx: int,
    num_segments: int,
) -> Image.Image:
    """
    Synthesize a single 'video' frame.

    Visual encoding:
      - Background colour cycles through the segment palette so prompt
        switches are immediately visible.
      - A diagonal sweep line moves left→right across the frame as time
        progresses, giving a clear sense of temporal progression.
      - Text overlay shows the current frame index, prompt (truncated),
        and segment info — handy when eyeballing the stream.
    """
    # Pick hue for this segment, cycle if we have more segments than palette entries
    hue = _SEGMENT_HUES[segment_idx % len(_SEGMENT_HUES)]
    # Vary saturation/value slightly with frame index for visual interest
    t = frame_idx / max(total_frames - 1, 1)
    sat = 0.45 + 0.15 * math.sin(t * math.pi * 2)
    val = 0.30 + 0.20 * math.cos(t * math.pi)
    r, g, b = colorsys.hsv_to_rgb(hue, sat, val)
    bg = (int(r * 255), int(g * 255), int(b * 255))

    img = Image.new("RGB", (FRAME_WIDTH, FRAME_HEIGHT), bg)
    draw = ImageDraw.Draw(img)

    # --- diagonal sweep line ---
    sweep_x = int(t * FRAME_WIDTH)
    draw.line(
        [(sweep_x, 0), (sweep_x, FRAME_HEIGHT)],
        fill=(255, 255, 255, 180),
        width=3,
    )
    # Small leading circle
    draw.ellipse(
        [sweep_x - 6, FRAME_HEIGHT // 2 - 6, sweep_x + 6, FRAME_HEIGHT // 2 + 6],
        fill=(255, 255, 255),
    )

    # --- progress bar at bottom ---
    bar_h = 8
    bar_y = FRAME_HEIGHT - bar_h
    draw.rectangle([0, bar_y, FRAME_WIDTH, FRAME_HEIGHT], fill=(0, 0, 0))
    draw.rectangle(
        [0, bar_y, int(t * FRAME_WIDTH), FRAME_HEIGHT],
        fill=(80, 200, 120),
    )

    # --- text overlay ---
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 18)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 14)
    except (IOError, OSError):
        font = ImageFont.load_default()
        font_small = font

    lines = [
        f"frame {frame_idx:03d} / {total_frames}",
        f"seg {segment_idx + 1}/{num_segments}",
        prompt[:52] + ("…" if len(prompt) > 52 else ""),
    ]
    y_off = 12
    for line in lines:
        # Shadow for readability
        draw.text((14, y_off + 2), line, fill=(0, 0, 0), font=font_small)
        draw.text((12, y_off), line, fill=(255, 255, 255), font=font_small)
        y_off += 22

    return img


def _encode_frame(img: Image.Image) -> dict:
    """Encode a PIL image to the same JSON payload shape as release_server.py."""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return {
        "data": base64.b64encode(buf.getvalue()).decode("ascii"),
        "format": "jpeg",
    }


# -----------------------------------------------------------------------------
# MOCK CHUNK INFERENCE  (mirrors run_chunk_inference generator signature)
# -----------------------------------------------------------------------------

async def mock_chunk_inference(
    prompts: List[str],
    switch_frame_indices: List[int],
    blocks_per_chunk: int = 5,
    reprompts: Optional[List[str]] = None,
):
    """
    Async generator that yields chunks of synthetic frames, mimicking the
    timing and grouping behaviour of the real run_chunk_inference().

    Yields:
        (frames: list[Image], is_final: bool)
            - frames: PIL images for this chunk
            - is_final: True on the last chunk
    """
    num_segments = len(prompts)

    # Apply reprompt logic (identical semantics to release_server.py)
    if reprompts and len(reprompts) > 0:
        final_prompts = prompts[: -len(reprompts)] + reprompts
        print(f"[Mock] Replacing last {len(reprompts)} prompts with reprompts")
    else:
        final_prompts = prompts

    num_blocks = NUM_OUTPUT_FRAMES // NUM_FRAME_PER_BLOCK
    frames_generated = 0
    chunk_buffer: List[Image.Image] = []

    for block_idx in range(num_blocks):
        current_start = block_idx * NUM_FRAME_PER_BLOCK

        # Simulate per-block compute time
        await asyncio.sleep(SIMULATED_BLOCK_LATENCY_SEC)

        # Determine active segment for this block
        seg_idx = _segment_for_frame(current_start, switch_frame_indices)
        prompt = final_prompts[min(seg_idx, len(final_prompts) - 1)]

        # Generate frames for this block
        for f in range(NUM_FRAME_PER_BLOCK):
            frame_idx = current_start + f
            if frame_idx >= NUM_OUTPUT_FRAMES:
                break
            img = _make_frame(frame_idx, NUM_OUTPUT_FRAMES, prompt, seg_idx, num_segments)
            chunk_buffer.append(img)
            frames_generated += 1

        # Yield when chunk is full or we're at the last block
        is_final = block_idx == num_blocks - 1
        if len(chunk_buffer) >= blocks_per_chunk * NUM_FRAME_PER_BLOCK or is_final:
            yield chunk_buffer, is_final
            chunk_buffer = []


# -----------------------------------------------------------------------------
# WEBSOCKET ENDPOINT  (same path & message schema as release_server.py)
# -----------------------------------------------------------------------------

@app.websocket("/ws/generate")
async def ws_generate(ws: WebSocket):
    await ws.accept()
    print("[WS] Connected")

    try:
        # Receive the same init payload the real server expects
        init = await ws.receive_json()
        prompts_list: List[str] = init["prompts"]
        blocks_per_chunk: int = init.get("blocks_per_chunk", 5)
        switch_frame_indices: List[int] = init.get(
            "switch_frame_indices", [24, 48, 72, 96]
        )
        reprompts: Optional[List[str]] = init.get("reprompts", None)

        print(f"[WS] Prompts: {len(prompts_list)}, switches: {switch_frame_indices}")
        if reprompts:
            print(f"[WS] Reprompts: {len(reprompts)}")

        total_frames_sent = 0
        chunk_idx = 0

        async for frames, is_final in mock_chunk_inference(
            prompts=prompts_list,
            switch_frame_indices=switch_frame_indices,
            blocks_per_chunk=blocks_per_chunk,
            reprompts=reprompts,
        ):
            for img in frames:
                payload = _encode_frame(img)
                await ws.send_json(
                    {
                        "type": "frame",
                        "frame_index": total_frames_sent,
                        **payload,
                    }
                )
                total_frames_sent += 1

            print(
                f"[WS] Chunk {chunk_idx}: sent {len(frames)} frames, "
                f"total: {total_frames_sent}"
            )
            chunk_idx += 1

            if is_final:
                await ws.send_json(
                    {
                        "type": "done",
                        "total_frames": total_frames_sent,
                    }
                )
                break

        print("[WS] Generation complete")

    except WebSocketDisconnect:
        print("[WS] Disconnected")
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
        await ws.close()


# -----------------------------------------------------------------------------
# HEALTH
# -----------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


# -----------------------------------------------------------------------------
# ENTRY POINT
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "mock_websocket:app",
        host="0.0.0.0",
        port=8010,
        reload=True,  # safe here — no GPU state to lose
    )