# File Tree

```
chat_voice/
├── .env
├── requirements.txt
├── run.sh
├── run-dev.sh
├── chat_voice.db
├── everything.log
├── docs/
│   └── plans/
│       ├── 2026-03-01-chat-voice-design.md
│       ├── 2026-03-01-chat-voice-function-plan.md
│       └── 2026-03-01-chat-voice-implementation-plan.md
├── server/
│   ├── __init__.py
│   ├── main.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   └── services/
│       ├── __init__.py
│       ├── db.py
│       ├── llm.py
│       ├── search.py
│       ├── stt.py
│       └── tts.py
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── eslint.config.js
│   ├── public/
│   │   └── vite.svg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── components/
│       │   ├── ChatView.jsx
│       │   ├── ConversationListModal.jsx
│       │   ├── InputBar.jsx
│       │   ├── MessageBubble.jsx
│       │   ├── MessageList.jsx
│       │   ├── SettingsModal.jsx
│       │   ├── VoiceCircle.jsx
│       │   └── VoiceView.jsx
│       └── hooks/
│           └── useWebSocket.js
├── testing_resources/
│   ├── control_audio.txt
│   └── control_audio.wav
└── .01_high_level_docs/
    ├── 01_project_summary.md
    ├── 02_how_it_works.md
    ├── 03_requirements.md
    ├── 04_constraints.md
    ├── 05_core_processes.md
    ├── 06_function_map.md
    ├── 07_file_tree.md
    ├── 08_reference_index.md
    └── functions/
        └── ...
```
