# chat_voice Implementation Plan

## Overview

Build the chat_voice app in 4 phases. Phase 1 builds all backend services in parallel. Phase 2 wires them together in main.py. Phase 3 builds the React frontend. Phase 4 does project setup and configuration.

**Important**: Start with Phase 4 (project setup) so the venv exists, then Phase 1 in parallel, then Phase 2, then Phase 3.

---

## Phase 0: Project Setup

### Task 0.1: Create project structure and dependencies

Create the directory structure and install dependencies.

```
chat_voice/
  server/
    __init__.py
    main.py
    services/
      __init__.py
      stt.py
      tts.py
      llm.py
      search.py
      db.py
    models/
      __init__.py
      schemas.py
  frontend/
    package.json
    src/
      ...
  .env
  requirements.txt
  everything.log
```

**requirements.txt:**
```
fastapi
uvicorn[standard]
websockets
aiofiles
aiosqlite
pydantic
python-dotenv
httpx
anthropic
lightning-whisper-mlx
mlx-audio
numpy
```

**Commands:**
```bash
cd /Users/jeff/Programs/chat_voice
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Phase 1: Backend Services (parallel)

### Task 1.1: Database service — `server/models/schemas.py` + `server/services/db.py`

**schemas.py** — Pydantic models:
- `Conversation(id: str, title: Optional[str], created_at: datetime, updated_at: datetime)`
- `Message(id: str, conversation_id: str, role: str, content: str, source: str, created_at: datetime)`
- `Setting(key: str, value: str)`

**db.py** — All functions use `aiosqlite`:
- `init_db(db_path: str)` — create tables if not exist, store db_path in module-level var
- `cleanup_db()` — close connection
- `create_conversation(title: Optional[str] = None) -> Conversation`
- `list_conversations() -> list[Conversation]` — order by updated_at DESC
- `get_conversation(conversation_id: str) -> Optional[Conversation]`
- `update_conversation(conversation_id: str, title: str) -> Conversation`
- `delete_conversation(conversation_id: str)` — cascade delete messages
- `create_message(conversation_id: str, role: str, content: str, source: str) -> Message` — auto-title conversation from first user message (truncate to 50 chars)
- `list_messages(conversation_id: str) -> list[Message]` — order by created_at ASC
- `get_setting(key: str) -> Optional[str]`
- `set_setting(key: str, value: str)`

SQL schema from design doc. Use uuid4 for IDs. All datetimes as ISO strings.

### Task 1.2: STT service — `server/services/stt.py`

```python
import logging
import tempfile
import numpy as np

logger = logging.getLogger(__name__)

_model_path = None

def init_stt(model_path: str = "/Users/jeff/mlx_models/distil-large-v3"):
    global _model_path
    _model_path = model_path
    logger.info(f"STT initialized with model: {model_path}")

def cleanup_stt():
    global _model_path
    _model_path = None
    logger.info("STT cleaned up")

async def transcribe_audio(audio_data: bytes) -> str:
    """Transcribe raw audio bytes (16-bit PCM, 16kHz, mono) to text."""
    import asyncio
    from lightning_whisper_mlx import LightningWhisperMLX

    # Write audio bytes to temp file as WAV
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name
        # Write WAV header + PCM data
        import wave
        with wave.open(f, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)  # 16-bit
            wav.setframerate(16000)
            wav.writeframes(audio_data)

    try:
        # Run in thread pool since whisper is blocking
        def _transcribe():
            whisper = LightningWhisperMLX(model=_model_path, batch_size=12, quant=None)
            result = whisper.transcribe(tmp_path)
            return result["text"].strip()

        text = await asyncio.get_event_loop().run_in_executor(None, _transcribe)
        logger.info(f"Transcribed: {text[:100]}...")
        return text
    finally:
        import os
        os.unlink(tmp_path)
```

Note: Client sends 16-bit PCM 16kHz mono. Server writes WAV temp file, transcribes, deletes.

### Task 1.3: TTS service — `server/services/tts.py`

```python
import logging
import numpy as np
import asyncio
from typing import AsyncIterator

logger = logging.getLogger(__name__)

_model = None

def init_tts():
    global _model
    from mlx_audio.tts.utils import load_model
    _model = load_model("mlx-community/Kokoro-82M-4bit")
    logger.info("TTS initialized with Kokoro 4-bit MLX")

def cleanup_tts():
    global _model
    _model = None
    logger.info("TTS cleaned up")

async def generate_speech_chunks(text: str) -> AsyncIterator[bytes]:
    """Generate speech audio chunks from text. Yields 24kHz mono float32 as int16 PCM bytes."""
    def _generate():
        chunks = []
        for result in _model.generate(text=text, voice="af_heart", speed=1.0, lang_code="a"):
            audio = np.array(result.audio)
            # Convert float32 to int16 PCM
            audio_int16 = (audio * 32767).astype(np.int16)
            chunks.append(audio_int16.tobytes())
        return chunks

    chunks = await asyncio.get_event_loop().run_in_executor(None, _generate)
    for chunk in chunks:
        yield chunk
```

Output: 24kHz mono int16 PCM bytes. Client handles playback via AudioContext.

### Task 1.4: Search service — `server/services/search.py`

```python
import logging
import httpx
import os

logger = logging.getLogger(__name__)

_api_key = None
_client = None

def init_search():
    global _api_key, _client
    _api_key = os.getenv("BRAVE_SEARCH_API_KEY")
    _client = httpx.AsyncClient()
    logger.info("Search initialized")

async def cleanup_search():
    global _client
    if _client:
        await _client.aclose()
    _client = None
    logger.info("Search cleaned up")

async def search_web(query: str, count: int = 5) -> str:
    """Execute a Brave web search and return formatted results."""
    resp = await _client.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={"X-Subscription-Token": _api_key, "Accept": "application/json"},
        params={"q": query, "count": count},
    )
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data.get("web", {}).get("results", []):
        results.append(f"**{item['title']}**\n{item['url']}\n{item.get('description', '')}")

    formatted = "\n\n".join(results) if results else "No results found."
    logger.info(f"Search '{query}': {len(results)} results")
    return formatted
```

### Task 1.5: LLM service — `server/services/llm.py`

Uses `anthropic` AsyncAnthropic SDK with streaming and tool use.

```python
import logging
import os
import anthropic
from typing import AsyncIterator

logger = logging.getLogger(__name__)

_client = None
_tools = [
    {
        "name": "search_web",
        "description": "Search the web for current information. Use when the user asks about recent events, needs up-to-date data, or asks you to search/look up something.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"}
            },
            "required": ["query"]
        }
    }
]

def init_llm():
    global _client
    _client = anthropic.AsyncAnthropic()  # uses ANTHROPIC_API_KEY env var
    logger.info("LLM initialized")

def cleanup_llm():
    global _client
    _client = None
    logger.info("LLM cleaned up")

async def get_response(messages: list[dict], system_prompt: str, tool_handler=None) -> AsyncIterator[dict]:
    """Stream a response from Claude. Yields event dicts:
    {"type": "delta", "content": str}
    {"type": "tool_use", "tool": str, "input": dict, "tool_use_id": str}
    {"type": "tool_result", "content": str}
    {"type": "complete", "content": str}
    """
    api_messages = messages.copy()

    while True:
        collected_text = ""
        tool_uses = []

        async with _client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=system_prompt or "You are a helpful assistant.",
            tools=_tools,
            messages=api_messages,
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta":
                    if hasattr(event.delta, "text"):
                        collected_text += event.delta.text
                        yield {"type": "delta", "content": event.delta.text}

            response = await stream.get_final_message()

        # Check for tool use
        for block in response.content:
            if block.type == "tool_use":
                tool_uses.append(block)

        if not tool_uses:
            yield {"type": "complete", "content": collected_text}
            break

        # Handle tool calls
        api_messages.append({"role": "assistant", "content": response.content})
        tool_results = []

        for tool_use in tool_uses:
            yield {"type": "tool_use", "tool": tool_use.name, "input": tool_use.input, "tool_use_id": tool_use.id}

            if tool_handler:
                result = await tool_handler(tool_use.name, tool_use.input)
            else:
                result = f"Tool {tool_use.name} not available"

            yield {"type": "tool_result", "content": result}
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result
            })

        api_messages.append({"role": "user", "content": tool_results})
```

Note: Uses ANTHROPIC_API_KEY. User needs to set this in .env. We can discuss OAuth/Max subscription auth separately — the SDK architecture is the same either way.

---

## Phase 2: Server Integration

### Task 2.1: Main server — `server/main.py`

The WebSocket endpoint that ties everything together. Key responsibilities:
- FastAPI app with lifespan for init/cleanup of all services
- WebSocket endpoint at `/ws`
- Route incoming frames by type
- Orchestrate text/voice message flows
- Handle TTS as cancellable asyncio.Task
- Serve static React files from `frontend/build/`
- REST endpoints for conversation CRUD: `GET /api/conversations`, `POST /api/conversations`, `PUT /api/conversations/{id}`, `DELETE /api/conversations/{id}`, `GET /api/conversations/{id}/messages`
- REST endpoints for settings: `GET /api/settings/{key}`, `PUT /api/settings/{key}`

Session state per WebSocket:
```python
class Session:
    id: str
    websocket: WebSocket
    mode: str  # "text" or "voice"
    conversation_id: Optional[str]
    audio_buffer: bytearray
    active_tts_task: Optional[asyncio.Task]
```

WebSocket message routing (from design doc protocol).

Logging config: all loggers write to `everything.log` + stdout.

---

## Phase 3: Frontend

### Task 3.1: React app setup + chat view

```bash
cd /Users/jeff/Programs/chat_voice
npx create-react-app frontend --template minimal
# or just manually create minimal React app with vite
```

Use Vite + React. Minimal dependencies: just React.

**Components:**
- `App.jsx` — root, holds WebSocket connection, conversation state, mode state
- `ChatView.jsx` — message thread + input bar
- `MessageList.jsx` — scrollable message list
- `MessageBubble.jsx` — single message (user right-aligned blue, assistant left-aligned gray)
- `InputBar.jsx` — text input, send button, voice toggle button
- `ConversationListModal.jsx` — full-screen modal (mobile), sidebar (desktop)
- `SettingsModal.jsx` — system prompt textarea, save button
- `VoiceView.jsx` — full-screen circle UI
- `VoiceCircle.jsx` — animated circle component

**Styling:** CSS modules or plain CSS. Mobile-first. Breakpoint at 768px for desktop sidebar.

**WebSocket hook:** `useWebSocket.js` — connect, reconnect with backoff, send/receive typed messages.

**Audio handling:**
- Recording: `navigator.mediaDevices.getUserMedia()`, MediaRecorder or ScriptProcessorNode to get 16kHz 16-bit PCM
- Playback: AudioContext, queue PCM chunks, play on user tap (Safari iOS requirement)
- Amplitude: AnalyserNode for mic input amplitude, audio buffer amplitude for TTS playback

### Task 3.2: Voice view

The circle UI:
- States: idle (black), recording (green pulsing), processing (black subtle pulse), speaking (black pulsing)
- Circle diameter varies with audio amplitude
- Tap handlers per state
- CSS transitions for smooth state changes
- Back button to return to chat

---

## Phase 4: Testing

### Task 4.1: Backend pipeline test

Test with `control_audio.wav`:
1. Start server
2. Send audio file through STT → verify transcription
3. Send text to Claude → verify streaming response
4. Send response through TTS → verify audio output
5. Test Brave Search tool call
6. Test DB CRUD

### Task 4.2: Integration test

Human-in-the-loop: user tests the full app in browser.

---

## Execution Order

```
Task 0.1 (setup) → Tasks 1.1-1.5 (parallel) → Task 2.1 (main.py) → Tasks 3.1-3.2 (frontend) → Task 4.1 (test)
```
