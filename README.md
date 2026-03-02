# chat_voice

Claude app's voice mode is hot garbage and doesn't work, so I made my own.

A mobile-first web app for text and voice chat with Claude. Runs locally on macOS with a FastAPI backend, React frontend, local speech-to-text (lightning-whisper-mlx), local text-to-speech (Kokoro MLX / Edge TTS / Browser TTS), and Claude Agent SDK with Brave Search as a tool.

## AI Agents

For codebase exploration and architectural understanding, start with the high-level docs in `.01_high_level_docs/`. Begin with `01_project_summary.md` and follow the references from there.

## Icons

UI icons are from [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT licensed). Source SVGs are in `icons/` and React components are in `frontend/src/icons/`.
