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
```bash
pip install -r requirements.txt
```




Terminal 1:  python scene_agent.py              # scene decomposer
Terminal 2:  python audio_agent.py        # TTS generation
             # paste all three agent1q... addresses into .env
Terminal 3:  uvicorn app:app --reload
Terminal 4:  python mock_websocket.py

export SSL_CERT_FILE=$(python -m certifi)    