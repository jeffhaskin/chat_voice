# Requirements

- Support text chat with Claude via streaming responses
- Support voice chat: record audio, transcribe locally, get Claude response, speak response locally
- Seamless switching between text and voice modes within a single conversation
- Persist conversations, messages, and settings in SQLite
- Stream response deltas to the client in real-time
- Provide web search capability as a Claude tool via Brave Search API
- Mobile-first UI with 44px minimum touch targets and safe area insets
- Chat view with message thread, input bar, conversation list, and settings — see @.01_high_level_docs/05_core_processes.md
- Voice view with animated circle reflecting mic/playback amplitude — see @.01_high_level_docs/05_core_processes.md
- Dark/light theme support matching claude.ai color palette
- Auto-reconnect WebSocket with exponential backoff
- Interrupt TTS playback by tapping during speech
- Auto-title conversations from the first user message (truncated to 50 chars)
- Conversation CRUD via REST API
- Settings management (system prompt) via REST API
