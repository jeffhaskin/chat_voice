# chat_voice Design

## Overview

Mobile-first web app for text and voice chat with Claude. Single continuous conversation that supports switching between text and voice modes at any time. Persistent conversations stored in SQLite.

## Architecture

```
Browser (React) <--WebSocket--> FastAPI Server
                                    |
                    +---------------+---------------+
                    |               |               |
              lightning-whisper  Claude Agent SDK  Kokoro 4-bit MLX
              (STT, local)      (LLM + tools)     (TTS, local)
                                    |
                              Brave Search API
                                    |
                              SQLite (conversations,
                               messages, settings)
```

- Single FastAPI server handles everything: WebSocket connections, STT, Claude calls, TTS, serves static React frontend
- SQLite for persistence (conversations, messages, global settings)
- Single WebSocket per session carries text, audio blobs, transcriptions, responses, and TTS audio
- React frontend with two views sharing the same conversation state
- Tailscale HTTPS for Safari iOS mic access and audio playback

## Server Module Structure

```
server/
  main.py              — FastAPI app, WebSocket endpoint, serves static files
  services/
    stt.py             — lightning-whisper-mlx wrapper, models at /Users/jeff/mlx_models
    tts.py             — Kokoro 4-bit MLX, generates audio chunks
    llm.py             — Claude Agent SDK, tool definitions, streaming responses
    search.py          — Brave Search API client (Claude tool)
    db.py              — SQLite CRUD for conversations, messages, settings
  models/
    schemas.py         — Pydantic models for messages, conversations, settings
```

- main.py imports services and orchestrates WebSocket flow
- Each service is self-contained with own init and cleanup
- All inputs/outputs/functions named by intent, not implementation
- All services log to single `everything.log` in project root

## WebSocket Protocol

Client → Server:
- `{ type: "text_message", content: "...", conversation_id: "..." }` — text chat
- Binary frame — raw audio from mic
- `{ type: "audio_complete", conversation_id: "..." }` — end of recording
- `{ type: "interrupt" }` — stop TTS
- `{ type: "mode_switch", mode: "text" | "voice" }` — current UI mode

Server → Client:
- `{ type: "transcription", content: "..." }` — what user said
- `{ type: "response_start", message_id: "..." }` — response beginning
- `{ type: "response_delta", content: "..." }` — streaming text chunk
- `{ type: "response_complete", content: "..." }` — full response
- Binary frame — TTS audio chunk (voice mode only)
- `{ type: "audio_complete" }` — TTS done
- `{ type: "tool_use", tool: "...", input: {...} }` — tool call in progress
- `{ type: "tool_result", tool: "...", result: "..." }` — tool finished
- `{ type: "error", message: "..." }` — error

Interrupt flow: client sends `interrupt` → server stops TTS, sends `audio_complete` with partial text, listens for next input.

## Frontend Views

### Mobile-first chat view
- Full screen message thread
- Bottom: text input bar, send button, voice mode toggle button
- Top bar: hamburger (conversation list modal), settings gear (settings modal)
- Conversation list: full-screen modal overlay
- Settings: full-screen modal overlay, system prompt textarea

### Desktop chat view (breakpoint enhancement)
- Conversation list becomes persistent left sidebar
- Hamburger hidden, settings remains modal
- Same input bar at bottom

### Voice view (same on both)
- Full screen takeover
- Large circle centered on screen
- States: idle (black) → recording (green, pulses with mic amplitude) → processing (black, subtle pulse) → speaking (black, pulses with TTS amplitude)
- Tap idle → start recording
- Tap recording → send
- Tap speaking → interrupt + immediately start recording
- Back button in corner to return to chat view
- Chat history updates in background

### Mobile considerations
- All touch targets minimum 44px
- No hover-dependent interactions
- Input bar above mobile keyboard
- Viewport meta for no pinch-zoom issues
- Safe area insets for notched phones

## Data Model

```sql
conversations
  id          TEXT PRIMARY KEY (uuid)
  title       TEXT (auto from first message, user-editable via inline edit in top bar)
  created_at  TIMESTAMP
  updated_at  TIMESTAMP

messages
  id              TEXT PRIMARY KEY (uuid)
  conversation_id TEXT FK → conversations.id
  role            TEXT (user | assistant)
  content         TEXT
  source          TEXT (text | voice)
  created_at      TIMESTAMP

settings
  key    TEXT PRIMARY KEY
  value  TEXT
```

## Error Handling

- STT fails: error message to client, toast notification, return to idle
- Claude API fails: error message, partial response saved to history
- TTS fails: text response still in chat, error toast, no audio
- WebSocket disconnects: reconnecting indicator, auto-reconnect with exponential backoff, resume from DB
- Brave Search fails: Claude receives error as tool result, tells user search failed
- Principle: text always works as fallback

## Constraints

- No Docker, all local
- Local .venv
- lightning-whisper-mlx models at /Users/jeff/mlx_models (no duplicates)
- No speech detection — manual tap to send/interrupt
- Tailscale HTTPS for Safari iOS
- Audio response playback must be initiated from user tap action (Safari iOS limitation)
- Kokoro 4-bit MLX for TTS
- Claude Agent SDK with OAuth for Max subscription auth
