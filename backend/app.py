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
# App setup
# ------------------------------------------------------------------

app = FastAPI(title="Cinematic Scene + Audio Generator")

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # React dev servers
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

# ------------------------------------------------------------------
# Pydantic models for Gemini structured output (IMPORTANT)
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
# LangChain Prompt + Gemini
# ------------------------------------------------------------------

prompt = ChatPromptTemplate.from_messages([
    ("system", """
You are an expert cinematic director and voiceover writer.

Decompose the user’s cinematic script into exactly {num_scenes} sequential scenes.

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

llm = ChatGoogleGenerativeAI(
    model="gemini-3-pro-preview",
    api_key=GEMINI_API_KEY,
    temperature=1.0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)

structured_llm = llm.with_structured_output(DecomposeLLM)
chain = prompt | structured_llm

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

# ------------------------------------------------------------------
# Endpoint
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
        result: DecomposeLLM = chain.invoke({
            "script": req.script,
            "num_scenes": req.num_scenes,
        })

        # Hard guarantee exact count
        scenes = result.scenes[:req.num_scenes]

        scenes_with_audio: List[SceneResponse] = []

        for scene in scenes:
            audio_url = generate_audio(scene.voiceover)
            scenes_with_audio.append(
                SceneResponse(
                    video_prompt=scene.video_prompt,
                    voiceover=scene.voiceover,
                    audio_url=audio_url,
                )
            )

        return DecomposeResponse(scenes=scenes_with_audio)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
