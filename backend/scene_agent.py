"""
agent.py — Scene Decomposer uAgent
Run this in its own process: python agent.py
On startup it prints its agent1q... address. Copy that into your .env as AGENT_ADDRESS.
"""

import os
from dotenv import load_dotenv
from uagents import Agent, Context, Model
from pydantic import BaseModel
from typing import List

# LangChain + Gemini
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

# ---------- uAgents message models ----------
# These are used for on_query input/output type registration.

class DecomposeRequest(Model):
    script: str
    num_scenes: int = 5


class SceneOut(Model):
    video_prompt: str
    voiceover: str


class DecomposeResponse(Model):
    scenes: List[SceneOut]


# ---------- Plain Pydantic models for LangChain ----------
# Gemini's with_structured_output() requires a plain Pydantic class, not a
# JSON schema dict or a uAgents Model. These mirror the uAgents models above
# so we can map between them after the LLM call.

class SceneLLM(BaseModel):
    video_prompt: str
    voiceover: str


class DecomposeLLM(BaseModel):
    scenes: List[SceneLLM]


# ---------- LangChain chain ----------

prompt = ChatPromptTemplate.from_messages([
    ("system", """
You are an expert cinematic director and voiceover writer.
Decompose the user's cinematic script into exactly {num_scenes} sequential scenes.
For each scene, generate:
1. A highly detailed cinematic video prompt usable by a text-to-video model
2. A natural voiceover script spoken in <5 seconds (~10–12 words)
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
    api_key=os.getenv("GEMINI_API_KEY"),
    temperature=1.0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)

# Pass the Pydantic *class* directly — not .model_json_schema()
structured_llm = llm.with_structured_output(DecomposeLLM)
chain = prompt | structured_llm


# ---------- The uAgent ----------

decomposer = Agent(
    name="scene_decomposer",
    seed=os.getenv("AGENT_SEED", "scene_decomposer_secret_seed_change_me"),
    port=8001,
    endpoint=["http://localhost:8001/submit"],
)


@decomposer.on_event("startup")
async def print_address(ctx: Context):
    """Log the address so you can paste it into .env as AGENT_ADDRESS."""
    ctx.logger.info(f"Scene Decomposer agent address: {decomposer.address}")


@decomposer.on_query(model=DecomposeRequest, replies=DecomposeResponse)
async def handle_decompose(ctx: Context, sender: str, req: DecomposeRequest):
    """
    Receives a script string, runs the LangChain chain, maps the plain
    Pydantic output into uAgents Models, and replies.
    """
    ctx.logger.info(f"Received decompose request from {sender} (num_scenes={req.num_scenes})")

    # result is a DecomposeLLM instance (plain Pydantic)
    result: DecomposeLLM = chain.invoke({"script": req.script, "num_scenes": req.num_scenes})

    # Map each SceneLLM → SceneOut (uAgents Model) for the reply
    scenes = [
        SceneOut(video_prompt=s.video_prompt, voiceover=s.voiceover)
        for s in result.scenes
    ]
    response = DecomposeResponse(scenes=scenes)

    ctx.logger.info(f"Sending back {len(scenes)} scenes to {sender}")
    await ctx.send(sender, response)


if __name__ == "__main__":
    decomposer.run()