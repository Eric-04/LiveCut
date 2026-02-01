import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

# LangChain + Gemini
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

# ElevenLabs
from elevenlabs import ElevenLabs

# ------------------------------------------------------------------
# Environment
# ------------------------------------------------------------------

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")
if not ELEVENLABS_API_KEY:
    raise RuntimeError("ELEVENLABS_API_KEY is not set")

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

TOTAL_SCENES = 5

# ------------------------------------------------------------------
# App setup
# ------------------------------------------------------------------

app = FastAPI(title="Cinematic Scene + Audio Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Audio setup
# ------------------------------------------------------------------

eleven = ElevenLabs(api_key=ELEVENLABS_API_KEY)

AUDIO_DIR = "generated_audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# ------------------------------------------------------------------
# Request / Response Models (API-facing)
# ------------------------------------------------------------------

class DecomposeRequest(BaseModel):
    script: str
    num_scenes: int = 5


class Scene(BaseModel):
    video_prompt: str
    voiceover: str


class SceneResponse(Scene):
    audio_url: str


class DecomposeResponse(BaseModel):
    scenes: List[SceneResponse]


# New request model for the regenerate endpoint
class RegenerateRequest(BaseModel):
    cutoff_index: int                      # 0-based; this index and everything after is removed
    kept_scenes: List[SceneResponse]       # scenes before cutoff_index, including their audio_url
    new_direction: str                     # the user's new creative prompt/direction

# ------------------------------------------------------------------
# Pydantic models for Gemini structured output
# ------------------------------------------------------------------

class SceneLLM(BaseModel):
    video_prompt: str
    voiceover: str

    class Config:
        extra = "ignore"


class DecomposeLLM(BaseModel):
    scenes: List[SceneLLM]

    class Config:
        extra = "ignore"

# ------------------------------------------------------------------
# LangChain Prompts + Gemini
# ------------------------------------------------------------------

# --- Original decompose prompt ---
decompose_prompt = ChatPromptTemplate.from_messages([
    ("system", """
You are an expert cinematic director and voiceover writer.

Decompose the user's cinematic script into exactly {num_scenes} sequential scenes.

For each scene, generate:
1. A highly detailed cinematic video prompt usable by a text-to-video model
2. A natural voiceover script spoken in ~5 seconds (12–15 words)

Rules:
- Single coherent shot
- Include environment, lighting, camera framing, camera motion, and mood
- No narration, dialogue, text, questions, or numbering
- Voiceover must match visuals
"""),
    ("human", "{script}")
])

# --- New regenerate prompt ---
regenerate_prompt = ChatPromptTemplate.from_messages([
    ("system", """
You are an expert cinematic director and voiceover writer.

The user is editing an existing {total_scenes}-scene cinematic sequence.
The first {kept_count} scene(s) are already finalized and shown below for context.
You must generate exactly {num_new_scenes} NEW scenes that continue naturally after them,
following the user's new creative direction.

For each new scene, generate:
1. A highly detailed cinematic video prompt usable by a text-to-video model
2. A natural voiceover script spoken in ~5 seconds (12–15 words)

Rules:
- Single coherent shot per scene
- Include environment, lighting, camera framing, camera motion, and mood
- No narration, dialogue, text, questions, or numbering in the video prompt
- Voiceover must match visuals
- The new scenes must feel like a seamless continuation of the kept scenes
- Respect the tone, style, and narrative established in the kept scenes
"""),
    ("human", """Already finalized scenes (for context only — do NOT reproduce these):
{kept_scenes_text}

New creative direction for the remaining scenes:
{new_direction}""")
])

# ------------------------------------------------------------------
# LLM + Chains
# ------------------------------------------------------------------

llm = ChatGoogleGenerativeAI(
    model="gemini-3-pro-preview",
    api_key=GEMINI_API_KEY,
    temperature=1.0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)

structured_llm = llm.with_structured_output(DecomposeLLM)

decompose_chain = decompose_prompt | structured_llm
regenerate_chain = regenerate_prompt | structured_llm

# ------------------------------------------------------------------
# ElevenLabs helper
# ------------------------------------------------------------------

def generate_audio(text: str) -> str:
    filename = f"{uuid.uuid4()}.mp3"
    path = os.path.join(AUDIO_DIR, filename)

    audio_stream = eleven.text_to_speech.convert(
        voice_id="Gfpl8Yo74Is0W6cPUWWT",
        text=text,
        model_id="eleven_monolingual_v1",
    )

    with open(path, "wb") as f:
        for chunk in audio_stream:
            f.write(chunk)

    return f"/audio/{filename}"


def scenes_to_audio_responses(scenes: List[SceneLLM]) -> List[SceneResponse]:
    """Convert LLM scene output into SceneResponse objects with generated audio."""
    result = []
    for scene in scenes:
        audio_url = generate_audio(scene.voiceover)
        result.append(
            SceneResponse(
                video_prompt=scene.video_prompt,
                voiceover=scene.voiceover,
                audio_url=audio_url,
            )
        )
    return result


def format_kept_scenes(scenes: List[Scene]) -> str:
    """Serialize kept scenes into a readable text block for the LLM prompt."""
    lines = []
    for i, scene in enumerate(scenes):
        lines.append(
            f"Scene {i + 1}:\n"
            f"  Video prompt: {scene.video_prompt}\n"
            f"  Voiceover: {scene.voiceover}"
        )
    return "\n\n".join(lines)

# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@app.post("/generate", response_model=DecomposeResponse)
def generate_video_and_audio(req: DecomposeRequest):
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="Script cannot be empty")

    if req.num_scenes < 1 or req.num_scenes > 12:
        raise HTTPException(
            status_code=400,
            detail="num_scenes must be between 1 and 12",
        )

    try:
        result: DecomposeLLM = decompose_chain.invoke({
            "script": req.script,
            "num_scenes": req.num_scenes,
        })

        scenes = result.scenes[:req.num_scenes]
        return DecomposeResponse(scenes=scenes_to_audio_responses(scenes))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/regenerate", response_model=DecomposeResponse)
def regenerate_from_cutoff(req: RegenerateRequest):
    # --- Validation ---
    if req.cutoff_index < 0 or req.cutoff_index >= TOTAL_SCENES:
        raise HTTPException(
            status_code=400,
            detail=f"cutoff_index must be between 0 and {TOTAL_SCENES - 1} (0-based).",
        )

    if len(req.kept_scenes) != req.cutoff_index:
        raise HTTPException(
            status_code=400,
            detail=(
                f"kept_scenes length ({len(req.kept_scenes)}) must equal "
                f"cutoff_index ({req.cutoff_index})."
            ),
        )

    if not req.new_direction.strip():
        raise HTTPException(status_code=400, detail="new_direction cannot be empty")

    num_new_scenes = TOTAL_SCENES - req.cutoff_index

    try:
        result: DecomposeLLM = regenerate_chain.invoke({
            "total_scenes": TOTAL_SCENES,
            "kept_count": req.cutoff_index,
            "num_new_scenes": num_new_scenes,
            "kept_scenes_text": format_kept_scenes(req.kept_scenes),
            "new_direction": req.new_direction,
        })

        # Guarantee exact count of new scenes
        new_scenes = result.scenes[:num_new_scenes]

        # Rebuild kept scenes as SceneResponse, preserving their original audio_url
        kept_responses = [
            SceneResponse(
                video_prompt=scene.video_prompt,
                voiceover=scene.voiceover,
                audio_url=scene.audio_url,
            )
            for scene in req.kept_scenes
        ]

        # Full sequence: kept scenes + freshly generated scenes
        return DecomposeResponse(scenes=kept_responses + scenes_to_audio_responses(new_scenes))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))