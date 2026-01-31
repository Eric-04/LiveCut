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
from pydantic import BaseModel
from typing import List

# uAgents
from uagents import Model
from uagents.communication import send_sync_message
from uagents_core.envelope import Envelope

load_dotenv()

# ---------- App setup ----------
app = FastAPI(title="Cinematic Video + Audio Generator")

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


# ---------- Endpoint ----------

class DecomposeHTTPRequest(BaseModel):
    script: str
    num_scenes: int = 5


@app.post("/generate", response_model=DecomposeResponse)
async def generate_video_and_audio(req: DecomposeHTTPRequest):
    """
    POST  {"script": "...", "num_scenes": 5}

    num_scenes is optional — defaults to 5 if omitted.

    1. Forwards the script + num_scenes to the scene_decomposer uAgent.
    2. Fans out all N voiceovers to the audio_generator uAgent in parallel.
    3. Zips the audio URLs back into the scenes and returns the full payload.
    """
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="Script cannot be empty")
    if req.num_scenes < 1 or req.num_scenes > 20:
        raise HTTPException(status_code=400, detail="num_scenes must be between 1 and 20")

    try:
        # 1. Decompose the script into N scenes
        result = await query_decomposer(req.script, req.num_scenes)
        scenes = result["scenes"]

        # 2. Fire all N TTS calls concurrently
        audio_urls = await asyncio.gather(
            *(query_audio_agent(scene["voiceover"]) for scene in scenes)
        )

        # 3. Merge and return
        return {
            "scenes": [
                {
                    "video_prompt": scene["video_prompt"],
                    "voiceover": scene["voiceover"],
                    "audio_url": url,
                }
                for scene, url in zip(scenes, audio_urls)
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))