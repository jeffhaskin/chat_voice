#!/bin/bash
cd "$(dirname "$0")"

# Backend in a new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PWD' && source .venv/bin/activate && uvicorn server.main:app --reload --port 8000\""

# Frontend in a new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PWD/frontend' && npm run dev\""
