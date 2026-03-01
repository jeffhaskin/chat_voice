# Constraints

- No Docker — all services run locally on macOS
- Local .venv for Python dependencies
- lightning-whisper-mlx models stored at /Users/jeff/mlx_models (no duplicates)
- No voice activity detection — manual tap to record and send
- Tailscale HTTPS required for Safari iOS mic access and audio playback
- Safari iOS requires audio playback to be initiated from a user tap gesture
- Kokoro 4-bit MLX for TTS (runs in thread pool since it's blocking)
- Claude Agent SDK with permission_mode="bypassPermissions" for tool execution
- STT runs in thread pool via run_in_executor (blocking whisper model)
- TTS generates all chunks in thread pool then yields them (not true streaming)
- Single WebSocket per session — all data types multiplexed on one connection
- Frontend served as static files from `frontend/dist/` by FastAPI
- Audio format: 16kHz 16-bit PCM mono (recording), 24kHz 16-bit PCM mono (playback)
- Single aiosqlite connection (no connection pool)
