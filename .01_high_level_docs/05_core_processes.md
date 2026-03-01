# Core Processes

## Text Message (Golden Path)

```
user types message → frontend sends text_message JSON
  → server: create_message(user) → list_messages → get_setting(system_prompt)
  → llm.get_response(history, system_prompt)
    → [if tool_use: search.search_web(query) → tool_result back to Claude]
  → stream response_start → response_delta(s) → response_complete to client
  → create_message(assistant)
  → if voice mode: speak_text → binary audio chunks → audio_complete
```

See @.01_high_level_docs/functions/handle_text_message.md, @.01_high_level_docs/functions/get_response.md

## Voice Message (Golden Path)

```
user taps circle (idle → recording)
  → browser getUserMedia → ScriptProcessorNode → 16kHz PCM → binary frames → server audio_buffer
user taps circle (recording → processing)
  → frontend sends audio_complete JSON
  → server: transcribe_audio(buffer) → transcription to client
  → hand off to text message flow above (with TTS at the end)
  → TTS audio chunks → binary frames → client AudioContext playback
  → circle state: processing → speaking (pulses with playback amplitude)
```

See @.01_high_level_docs/functions/handle_audio_complete.md, @.01_high_level_docs/functions/transcribe_audio.md, @.01_high_level_docs/functions/speak_text.md

## Interrupt Flow

```
user taps circle during speaking
  → frontend sends interrupt JSON + stops playback
  → server: cancel active_tts_task → send audio_complete
  → frontend immediately starts new recording
```

See @.01_high_level_docs/functions/handle_interrupt.md

## WebSocket Connection Lifecycle

```
browser connects → server accepts → create Session(mode=text, audio_buffer=empty)
  → loop: receive frame → route by type (text_message, audio_complete, interrupt, mode_switch, binary)
  → on disconnect: cancel active TTS task, log
```

## Server Startup/Shutdown

```
startup: init_db → init_stt → init_tts → init_llm → init_search → ready
shutdown: cleanup_db → cleanup_stt → cleanup_tts → cleanup_llm → cleanup_search
```

## Conversation Management

```
REST API:
  GET /api/conversations → list (ordered by updated_at DESC)
  POST /api/conversations → create new
  GET /api/conversations/{id} → get one
  PUT /api/conversations/{id} → update title
  DELETE /api/conversations/{id} → delete with cascade messages
  GET /api/conversations/{id}/messages → list messages (ordered by created_at ASC)
  GET /api/settings/{key} → get setting
  PUT /api/settings/{key} → set setting
```
