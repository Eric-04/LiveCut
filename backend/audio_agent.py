"""
audio_agent.py — Audio Generation uAgent
Run this in its own process: python audio_agent.py
On startup it prints its agent1q... address. Copy that into your .env as AUDIO_AGENT_ADDRESS.
"""

import os
import uuid
from dotenv import load_dotenv
from uagents import Agent, Context, Model
from elevenlabs import ElevenLabs

load_dotenv()

# ---------- ElevenLabs ----------
eleven = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

AUDIO_DIR = "generated_audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

# ---------- Message models ----------

class AudioRequest(Model):
    voiceover: str
    voice_id: str


class AudioResponse(Model):
    audio_url: str


# ---------- The uAgent ----------

audio_agent = Agent(
    name="audio_generator",
    seed=os.getenv("AUDIO_AGENT_SEED", "audio_generator_secret_seed_change_me"),
    port=8002,
    endpoint=["http://localhost:8002/submit"],
)


@audio_agent.on_event("startup")
async def print_address(ctx: Context):
    ctx.logger.info(f"Audio Generator agent address: {audio_agent.address}")


@audio_agent.on_query(model=AudioRequest, replies=AudioResponse)
async def handle_audio(ctx: Context, sender: str, req: AudioRequest):
    """
    Receives a voiceover string, generates an MP3 via ElevenLabs,
    writes it to disk, and replies with the relative URL.
    """
    ctx.logger.info(f"Generating audio for: {req.voiceover[:50]}...")

    filename = f"{uuid.uuid4()}.mp3"
    path = os.path.join(AUDIO_DIR, filename)

    audio = eleven.text_to_speech.convert(
        voice_id=req.voice_id,
        text=req.voiceover,
        model_id="eleven_monolingual_v1",
    )

    with open(path, "wb") as f:
        for chunk in audio:
            f.write(chunk)

    audio_url = f"/audio/{filename}"
    ctx.logger.info(f"Audio ready: {audio_url}")
    await ctx.send(sender, AudioResponse(audio_url=audio_url))


if __name__ == "__main__":
    audio_agent.run()