#!/bin/bash
cd "$(dirname "$0")"

# Backend in a new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PWD' && source .venv/bin/activate && uvicorn server.main:app --reload --host 0.0.0.0 --port 8000 --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem\""

# Frontend in a new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PWD/frontend' && npm run dev\""
