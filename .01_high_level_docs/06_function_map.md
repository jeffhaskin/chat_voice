# Function Map

The complete function reference with signatures, inputs, outputs, and dependencies lives in the existing function plan document:

See `docs/plans/2026-03-01-chat-voice-function-plan.md`

That document covers all functions organized by process:

1. **WebSocket Connection Lifecycle** — accept_connection, route_incoming_frame, disconnect_session
2. **Text Message Handling** — handle_text_message, send_response_stream
3. **Voice Input (STT)** — buffer_audio, handle_audio_complete, transcribe_audio
4. **Voice Output (TTS)** — speak_text, generate_speech_chunks, handle_interrupt
5. **Claude LLM Interaction** — get_response, init_llm, cleanup_llm
6. **Web Search Tool** — search_web, init_search, cleanup_search
7. **Database Operations** — init_db, cleanup_db, create_conversation, list_conversations, get_conversation, update_conversation, delete_conversation, create_message, list_messages, get_setting, set_setting
8. **Mode Switching** — handle_mode_switch
9. **Server Lifecycle** — start_server, stop_server, init_stt, cleanup_stt, init_tts, cleanup_tts
