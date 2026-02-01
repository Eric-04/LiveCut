"""
main.py — FastAPI orchestrator.
Queries the scene_decomposer uAgent, then fans out N parallel calls
to the audio_generator uAgent for TTS.

Run: uvicorn main:app --reload --port 8000
"""

import os
import json
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, AsyncGenerator
import base64

from mock_video import generate_blue_video, combine_video_and_audio

# uAgents
from uagents import Model
from uagents.communication import send_sync_message
from uagents_core.envelope import Envelope

load_dotenv()

# ---------- App setup ----------
app = FastAPI(title="Cinematic Video + Audio Generator")

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve audio files written by the audio_agent
AUDIO_DIR = "generated_audio"
os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# ---------- Agent addresses ----------
DECOMPOSER_ADDRESS = os.getenv("AGENT_ADDRESS")
AUDIO_AGENT_ADDRESS = os.getenv("AUDIO_AGENT_ADDRESS")

if not DECOMPOSER_ADDRESS:
    raise RuntimeError(
        "AGENT_ADDRESS is not set. Run agent.py first, copy its printed address, "
        "and add it to your .env file."
    )
if not AUDIO_AGENT_ADDRESS:
    raise RuntimeError(
        "AUDIO_AGENT_ADDRESS is not set. Run audio_agent.py first, copy its printed "
        "address, and add it to your .env file."
    )


# ---------- uAgents Models ----------
# Field names and types must match the Models declared in each agent exactly.

class DecomposeRequest(Model):
    script: str
    num_scenes: int = 5


class AudioRequest(Model):
    voiceover: str


# ---------- Pydantic schemas for the HTTP API ----------

class SceneResponse(BaseModel):
    video_prompt: str
    voiceover: str
    audio_url: str


class DecomposeResponse(BaseModel):
    scenes: List[SceneResponse]


# ---------- Shared helper: parse agent responses ----------

def parse_response(response) -> dict:
    """
    send_sync_message may return a raw JSON string, an Envelope, or a dict.
    Normalise to a dict.
    """
    if isinstance(response, str):
        return json.loads(response)
    if isinstance(response, Envelope):
        return json.loads(response.decode_payload())
    return response


# ---------- Query helpers ----------

async def query_decomposer(script: str, num_scenes: int) -> dict:
    """Send a script to the decomposer agent and return the parsed response."""
    response = await send_sync_message(
        destination=DECOMPOSER_ADDRESS,
        message=DecomposeRequest(script=script, num_scenes=num_scenes),
        timeout=60,
    )
    return parse_response(response)


async def query_audio_agent(voiceover: str) -> str:
    """Send a voiceover to the audio agent and return the audio_url."""
    response = await send_sync_message(
        destination=AUDIO_AGENT_ADDRESS,
        message=AudioRequest(voiceover=voiceover),
        timeout=60,
    )
    data = parse_response(response)
    return data["audio_url"]

def video_file_to_base64(video_path: str) -> str:
    """Read a video file and convert it to base64 string."""
    with open(video_path, 'rb') as video_file:
        video_bytes = video_file.read()
        base64_string = base64.b64encode(video_bytes).decode('utf-8')
    return base64_string

# ---------- Endpoint ----------

class DecomposeHTTPRequest(BaseModel):
    script: str
    num_scenes: int = 5


@app.post("/generate")
async def generate_video_and_audio(req: DecomposeHTTPRequest):
    """
    POST  {"script": "...", "num_scenes": 5}

    num_scenes is optional — defaults to 5 if omitted.

    Streams back scenes one by one as Server-Sent Events (SSE):
    1. Decomposes the script into N scenes
    2. For each scene (in a loop):
       a. Generate audio asynchronously
       b. Generate video asynchronously  
       c. Gather both and combine them
       d. Stream the scene data back to frontend
    """
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="Script cannot be empty")
    if req.num_scenes < 1 or req.num_scenes > 20:
        raise HTTPException(status_code=400, detail="num_scenes must be between 1 and 20")

    async def generate_scenes() -> AsyncGenerator[str, None]:
        try:
            # 1. Decompose the script into N scenes
            result = await query_decomposer(req.script, req.num_scenes)
            scenes = result["scenes"]
            
            # 2. Process each scene sequentially
            for i, scene in enumerate(scenes):
                # a & b. Generate audio and video asynchronously (in parallel for this scene)
                audio_url, video_file = await asyncio.gather(
                    query_audio_agent(scene["voiceover"]),
                    asyncio.to_thread(generate_blue_video)  # Run in thread pool since it's blocking
                )
                
                # c. Combine the audio and video
                video_url = await combine_video_and_audio(i, audio_url, video_file)
                video_base64 = await asyncio.to_thread(video_file_to_base64, video_url)
                
                # d. Stream the scene data back to frontend
                scene_data = {
                    "scene_index": i,
                    "video_base64": video_base64,
                }
                
                # Send as Server-Sent Event
                yield f"data: {json.dumps(scene_data)}\n\n"
            
            # Send completion signal
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            error_data = {"error": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"

    return StreamingResponse(
        generate_scenes(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )