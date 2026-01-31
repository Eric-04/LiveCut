# Backend

## Setup

1. Create venv
```bash
python3 -m venv .venv
```

2. Activate
```bash
source .venv/bin/activate
```

3. Install requirements





Terminal 1:  python scene_agent.py              # scene decomposer
Terminal 2:  python voice_selector_agent.py        # voice selector  ← new
Terminal 3:  python audio_agent.py        # TTS generation
             # paste all three agent1q... addresses into .env
Terminal 4:  uvicorn app:app --reload