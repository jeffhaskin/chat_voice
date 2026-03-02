import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from server.services import db, llm, search, stt, tts

load_dotenv()

# Logging — everything to one file + stdout
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler("everything.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


# --- Session state ---

@dataclass
class Session:
    id: str
    websocket: WebSocket
    mode: str = "text"
    conversation_id: Optional[str] = None
    audio_buffer: bytearray = field(default_factory=bytearray)
    active_tts_task: Optional[asyncio.Task] = None


# --- Lifespan ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting server — initializing services...")
    await db.init_db()
    stt.init_stt()
    tts.init_tts()
    llm.init_llm()
    search.init_search()
    logger.info("All services initialized")
    yield
    logger.info("Shutting down services...")
    await db.cleanup_db()
    stt.cleanup_stt()
    tts.cleanup_tts()
    llm.cleanup_llm()
    await search.cleanup_search()
    logger.info("All services cleaned up")


app = FastAPI(lifespan=lifespan)


# --- Tool handler for Claude ---

async def handle_tool_call(tool_name: str, tool_input: dict) -> str:
    if tool_name == "search_web":
        return await search.search_web(tool_input["query"])
    return f"Unknown tool: {tool_name}"


# --- WebSocket helpers ---

async def send_json(ws: WebSocket, data: dict):
    await ws.send_text(json.dumps(data))


async def handle_text_message(session: Session, content: str, conversation_id: str):
    """Full text message flow: store, get response, stream, store, optionally TTS."""
    source = "text" if session.mode == "text" else "voice"

    # Store user message
    await db.create_message(conversation_id, "user", content, source)

    # Build history
    messages = await db.list_messages(conversation_id)
    history = [{"role": m.role, "content": m.content} for m in messages]

    # Get system prompt
    system_prompt = await db.get_setting("system_prompt") or "You are a helpful assistant."

    # Stream response
    full_response = ""
    message_id = str(uuid.uuid4())
    await send_json(session.websocket, {"type": "response_start", "message_id": message_id})

    async for event in llm.get_response(history, system_prompt, handle_tool_call):
        if event["type"] == "delta":
            full_response += event["content"]
            await send_json(session.websocket, {"type": "response_delta", "content": event["content"]})
        elif event["type"] == "tool_use":
            await send_json(session.websocket, {
                "type": "tool_use",
                "tool": event["tool"],
                "input": event["input"],
            })
        elif event["type"] == "tool_result":
            await send_json(session.websocket, {
                "type": "tool_result",
                "content": event["content"],
            })
        elif event["type"] == "complete":
            full_response = event["content"]

    await send_json(session.websocket, {"type": "response_complete", "content": full_response})

    # Store assistant message
    await db.create_message(conversation_id, "assistant", full_response, "text")

    # Update conversation timestamp
    conv = await db.get_conversation(conversation_id)
    if conv:
        await db.update_conversation(conversation_id, conv.title or "Untitled")

    # TTS in voice mode
    if session.mode == "voice" and full_response.strip():
        session.active_tts_task = asyncio.create_task(
            speak_text(session, full_response)
        )


async def speak_text(session: Session, text: str):
    """Generate TTS and stream audio chunks to client."""
    try:
        async for chunk in tts.generate_speech_chunks(text):
            await session.websocket.send_bytes(chunk)
        await send_json(session.websocket, {"type": "audio_complete"})
    except asyncio.CancelledError:
        logger.info("TTS cancelled (interrupt)")
        try:
            await send_json(session.websocket, {"type": "audio_complete"})
        except Exception:
            pass
    except Exception as e:
        logger.error("TTS error: %s", e)
        try:
            await send_json(session.websocket, {"type": "error", "message": f"TTS failed: {e}"})
            await send_json(session.websocket, {"type": "audio_complete"})
        except Exception:
            pass
    finally:
        session.active_tts_task = None


async def handle_audio_complete(session: Session, conversation_id: str):
    """Transcribe buffered audio, send transcription, hand off to text flow."""
    audio_data = bytes(session.audio_buffer)
    session.audio_buffer.clear()

    if not audio_data:
        await send_json(session.websocket, {"type": "error", "message": "No audio data received"})
        return

    try:
        transcription = await stt.transcribe_audio(audio_data)
        await send_json(session.websocket, {"type": "transcription", "content": transcription})
        await handle_text_message(session, transcription, conversation_id)
    except Exception as e:
        logger.error("STT error: %s", e)
        await send_json(session.websocket, {"type": "error", "message": f"Transcription failed: {e}"})


async def handle_interrupt(session: Session):
    """Cancel active TTS task."""
    if session.active_tts_task and not session.active_tts_task.done():
        session.active_tts_task.cancel()
        logger.info("Interrupted TTS for session %s", session.id)


# --- WebSocket endpoint ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = Session(id=str(uuid.uuid4()), websocket=websocket)
    logger.info("WebSocket connected: %s", session.id)

    try:
        while True:
            message = await websocket.receive()

            if "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "text_message":
                    conv_id = data.get("conversation_id")
                    if not conv_id:
                        conv = await db.create_conversation()
                        conv_id = conv.id
                        await send_json(websocket, {"type": "conversation_created", "conversation": conv.model_dump(mode="json")})
                    session.conversation_id = conv_id
                    await handle_text_message(session, data["content"], conv_id)

                elif msg_type == "audio_complete":
                    conv_id = data.get("conversation_id")
                    if not conv_id:
                        conv = await db.create_conversation()
                        conv_id = conv.id
                        await send_json(websocket, {"type": "conversation_created", "conversation": conv.model_dump(mode="json")})
                    session.conversation_id = conv_id
                    await handle_audio_complete(session, conv_id)

                elif msg_type == "interrupt":
                    await handle_interrupt(session)

                elif msg_type == "mode_switch":
                    session.mode = data.get("mode", "text")
                    logger.info("Mode switched to %s for session %s", session.mode, session.id)

                else:
                    logger.warning("Unknown message type: %s", msg_type)

            elif "bytes" in message:
                session.audio_buffer.extend(message["bytes"])

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session.id)
    except Exception as e:
        logger.error("WebSocket error for session %s: %s", session.id, e)
    finally:
        if session.active_tts_task and not session.active_tts_task.done():
            session.active_tts_task.cancel()


# --- REST API ---

class TitleUpdate(BaseModel):
    title: str

class SettingUpdate(BaseModel):
    value: str


@app.get("/api/conversations")
async def api_list_conversations():
    convs = await db.list_conversations()
    return [c.model_dump(mode="json") for c in convs]


@app.post("/api/conversations")
async def api_create_conversation():
    conv = await db.create_conversation()
    return conv.model_dump(mode="json")


@app.get("/api/conversations/{conversation_id}")
async def api_get_conversation(conversation_id: str):
    conv = await db.get_conversation(conversation_id)
    if not conv:
        return JSONResponse(status_code=404, content={"error": "Not found"})
    return conv.model_dump(mode="json")


@app.put("/api/conversations/{conversation_id}")
async def api_update_conversation(conversation_id: str, body: TitleUpdate):
    conv = await db.update_conversation(conversation_id, body.title)
    return conv.model_dump(mode="json")


@app.delete("/api/conversations/{conversation_id}")
async def api_delete_conversation(conversation_id: str):
    await db.delete_conversation(conversation_id)
    return {"ok": True}


@app.get("/api/conversations/{conversation_id}/messages")
async def api_list_messages(conversation_id: str):
    msgs = await db.list_messages(conversation_id)
    return [m.model_dump(mode="json") for m in msgs]


@app.get("/api/settings/{key}")
async def api_get_setting(key: str):
    value = await db.get_setting(key)
    return {"key": key, "value": value}


@app.put("/api/settings/{key}")
async def api_set_setting(key: str, body: SettingUpdate):
    await db.set_setting(key, body.value)
    return {"key": key, "value": body.value}


# --- Static files (serve React build) ---

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
