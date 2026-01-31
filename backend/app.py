import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List

# LangChain Google Gemini
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

# ElevenLabs TTS
from elevenlabs import ElevenLabs

# Load environment variables
load_dotenv()

# ---------- App setup ----------
app = FastAPI(title="Cinematic Video + Audio Generator")

# ---------- ElevenLabs ----------
eleven = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

# Directory for generated audio
AUDIO_DIR = "generated_audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

# Serve audio files
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# ---------- Pydantic Schemas ----------
class DecomposeRequest(BaseModel):
    script: str

class Scene(BaseModel):
    video_prompt: str
    voiceover: str

class SceneResponse(Scene):
    audio_url: str

class DecomposeResponse(BaseModel):
    scenes: List[SceneResponse]

# ---------- LangChain setup with Gemini ----------
prompt = ChatPromptTemplate.from_messages([
    ("system", """
You are an expert cinematic director and voiceover writer.

Decompose the user’s cinematic script into exactly 5 sequential scenes.

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

# Gemini model
llm = ChatGoogleGenerativeAI(
    model="gemini-3-pro-preview",
    api_key=os.getenv("GEMINI_API_KEY"),
    temperature=1.0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)

# Structured output
structured_llm = llm.with_structured_output(DecomposeResponse.model_json_schema())

chain = prompt | structured_llm

# ---------- ElevenLabs TTS helper ----------
def generate_audio(text: str) -> str:
    """Generate an MP3 file from text and return the relative URL"""
    filename = f"{uuid.uuid4()}.mp3"
    path = os.path.join(AUDIO_DIR, filename)

    audio = eleven.text_to_speech.convert(
        voice_id="Gfpl8Yo74Is0W6cPUWWT",
        text=text,
        model_id="eleven_monolingual_v1"
    )

    with open(path, "wb") as f:
        for chunk in audio:
            f.write(chunk)

    return f"/audio/{filename}"

# ---------- Endpoint ----------
@app.post("/generate", response_model=DecomposeResponse)
def generate_video_and_audio(req: DecomposeRequest):
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="Script cannot be empty")

    try:
        result = chain.invoke({"script": req.script})
        scenes_with_audio = []

        for scene in result["scenes"]:
            audio_url = generate_audio(scene["voiceover"])
            scenes_with_audio.append({
                **scene,
                "audio_url": audio_url
            })

        return {"scenes": scenes_with_audio}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
