"""
voice_agent.py — Voice Selector uAgent
Fetches available ElevenLabs voices, then uses Gemini to pick the best
match for the incoming voiceover text.

Run this in its own process: python voice_agent.py
On startup it prints its agent1q... address. Copy that into your .env as VOICE_AGENT_ADDRESS.
"""

import os
import requests
from dotenv import load_dotenv
from uagents import Agent, Context, Model
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

# ---------- ElevenLabs voice fetching ----------

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")


def get_all_voices() -> dict:
    """
    Fetch all voices from ElevenLabs and return a dict keyed by voice name (lowercased).
    Each value contains at minimum: name, voice_id, gender, description.
    """
    response = requests.get(
        "https://api.elevenlabs.io/v1/voices",
        headers={"xi-api-key": ELEVENLABS_API_KEY},
    )
    response.raise_for_status()
    voices = response.json().get("voices", [])
    # Key by actual name only
    return {v["name"].lower(): v for v in voices}


# Fetch once at startup
VOICES = get_all_voices()

# Build the voice list text for Gemini prompt (include description for context)
VOICE_LIST_TEXT = "\n".join(
    f"- {v['name']}: {v.get('gender', '?')}, {v.get('description', 'no description')}"
    for v in VOICES.values()
)


# ---------- Gemini setup ----------

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a voice selection assistant. Choose the most suitable voice for the following voiceover text.

Available voices:
{voice_list}

Rules:
- Cheerful or casual text → prefer cheerful/friendly voices
- Serious, cinematic, or dramatic text → prefer deep, neutral, or serious voices
- Emotional or melancholic text → prefer warm, expressive voices
- ONLY return the exact voice name as listed above. Nothing else. No explanation.
- If you are unsure, pick the first matching voice that makes sense."""),
    ("human", "{voiceover}")
])

llm = ChatGoogleGenerativeAI(
    model="gemini-3-pro-preview",
    api_key=os.getenv("GEMINI_API_KEY"),
    temperature=0.0,  # deterministic
    max_retries=2,
)

chain = prompt | llm


# ---------- Message models ----------

class VoiceSelectRequest(Model):
    voiceover: str


class VoiceSelectResponse(Model):
    voiceover: str
    voice_id: str
    voice_name: str


# ---------- The uAgent ----------

voice_agent = Agent(
    name="voice_selector",
    seed=os.getenv("VOICE_AGENT_SEED", "voice_selector_secret_seed_change_me"),
    port=8003,
    endpoint=["http://localhost:8003/submit"],
)


@voice_agent.on_event("startup")
async def print_address(ctx: Context):
    ctx.logger.info(f"Voice Selector agent address: {voice_agent.address}")
    ctx.logger.info(f"Loaded {len(VOICES)} ElevenLabs voices")


@voice_agent.on_query(model=VoiceSelectRequest, replies=VoiceSelectResponse)
async def handle_voice_select(ctx: Context, sender: str, req: VoiceSelectRequest):
    """
    Uses Gemini to pick the best voice for the voiceover text,
    resolves it to a voice_id, and replies with both.
    """
    ctx.logger.info(f"Selecting voice for: {req.voiceover[:50]}...")

    # Ask Gemini to pick a voice name
    result = chain.invoke({
        "voice_list": VOICE_LIST_TEXT,
        "voiceover": req.voiceover,
    })

    # Safely extract voice name from Gemini response
    selected_name = ""
    if result.content and isinstance(result.content[0], dict):
        selected_name = result.content[0].get("text", "").strip()

    # Match Gemini output to VOICES by name (lowercased)
    voice_key = selected_name.lower()
    if voice_key not in VOICES:
        # If Gemini fails, just pick the first available voice
        voice_key = list(VOICES.keys())[0]

    voice = VOICES[voice_key]

    # Reply with only the info needed (voice_id + name)
    await ctx.send(sender, VoiceSelectResponse(
        voiceover=req.voiceover,
        voice_id=voice["voice_id"],
        voice_name=voice["name"],
    ))


if __name__ == "__main__":
    voice_agent.run()
