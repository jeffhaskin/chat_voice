# How It Works

## Connection

The browser opens a single WebSocket to the FastAPI server. All communication flows over this connection — text messages, audio frames, transcriptions, streamed responses, and TTS audio chunks. The server maintains per-connection session state tracking the current mode (text/voice), conversation ID, audio buffer, and active TTS task.

## Text Flow

When the user sends a text message, the server stores it in SQLite, builds the conversation history, fetches the system prompt from settings, and streams a response from Claude via the Agent SDK. Response deltas are forwarded to the client in real-time. If Claude invokes the web search tool, the server executes a Brave Search API call and feeds the result back. The complete response is stored in the database. If the session is in voice mode, the response is also sent through TTS.

## Voice Flow

In voice mode, the browser captures 16kHz 16-bit PCM audio via getUserMedia and streams raw audio frames over the WebSocket as binary data. When the user taps to send, an `audio_complete` signal triggers server-side transcription using lightning-whisper-mlx. The transcription is sent back to the client, then the text enters the same Claude response pipeline as text messages. The assistant's response is converted to speech using Kokoro TTS and streamed back as binary audio chunks, which the frontend plays through AudioContext with amplitude-driven circle animations.

## Interrupt

During TTS playback, tapping the circle sends an `interrupt` signal. The server cancels the active TTS asyncio task and sends `audio_complete`, then the client immediately starts a new recording.

## Frontend

The React frontend has two views sharing the same conversation state. The chat view is a standard message thread with an input bar, conversation list modal, and settings modal. The voice view is a full-screen circle that changes color and pulses based on state (idle, recording, processing, speaking). Both views support dark/light themes matched to claude.ai's color palette.
