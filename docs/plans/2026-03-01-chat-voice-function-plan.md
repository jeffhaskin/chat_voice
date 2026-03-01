# chat_voice - Function Plan

## Vision / Objective

Mobile-first web app for text and voice chat with Claude. A single FastAPI server handles WebSocket connections, local STT/TTS, Claude Agent SDK calls, and serves the React frontend. Conversations persist in SQLite. The system supports seamless switching between text and voice modes within a single continuous conversation.

## Process Outline

```
1. WebSocket connection lifecycle - FastAPI
   1. accept connection
   2. initialize session state (mode, conversation)
   3. route incoming frames
      1. JSON text frames --> dispatch by type
      2. binary frames --> buffer audio
   4. handle disconnect / cleanup

2. Text message handling
   1. receive text_message frame
   2. store user message in DB
   3. send to Claude (streaming)
   4. stream response deltas to client
   5. store assistant message in DB

3. Voice input handling (STT)
   1. receive binary audio frames --> accumulate in buffer
   2. receive audio_complete signal
   3. transcribe audio buffer
   4. send transcription to client
   5. store user message (source=voice) in DB
   6. hand off transcribed text to Claude (same as text path from here)

4. Voice output handling (TTS)
   1. receive complete assistant response text
   2. generate speech audio chunks
   3. stream audio chunks as binary frames to client
   4. send audio_complete signal
   5. handle interrupt: stop generation, send audio_complete

5. Claude LLM interaction
   1. build message history from DB
   2. attach system prompt from settings
   3. call Claude Agent SDK (streaming)
   4. handle tool_use events mid-stream
   5. yield response deltas
   6. return complete response

6. Web search tool
   1. receive search query from Claude tool call
   2. execute web search
   3. format results
   4. return to Claude as tool result

7. Database operations
   1. conversations CRUD
      1. create conversation (auto-title from first message)
      2. list conversations
      3. get conversation
      4. update conversation (title)
      5. delete conversation
   2. messages CRUD
      1. create message
      2. list messages for conversation
   3. settings CRUD
      1. get setting
      2. set setting
   4. init schema on startup

8. Mode switching
   1. receive mode_switch frame
   2. update session state
   3. mode determines whether TTS runs on assistant responses

9. Interrupt handling
   1. receive interrupt frame
   2. cancel active TTS generation
   3. send audio_complete to client
```

---

## Processes

### Process 1: WebSocket Connection Lifecycle

#### Functions

**accept_connection**
Accept an incoming WebSocket connection and initialize session state.

| Input | Type | Format/Schema |
|-------|------|---------------|
| websocket | `WebSocket` | FastAPI WebSocket instance |

| Output | Type | Format/Schema |
|--------|------|---------------|
| session | `Session` | `{ id: str, websocket: WebSocket, mode: str ("text"), conversation_id: Optional[str], audio_buffer: bytearray, active_tts_task: Optional[asyncio.Task] }` |

**route_incoming_frame**
Read a single frame from the WebSocket, classify it (JSON text vs binary audio), and dispatch to the appropriate handler.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: dispatches to handler functions |

**disconnect_session**
Clean up session state on WebSocket close: cancel active tasks, flush buffers.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Session to clean up |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: resources released |

#### Pipeline

```
websocket --> accept_connection() --> session
loop:
  session --> route_incoming_frame() --> dispatches to Process 2/3/8/9 handlers
on disconnect:
  session --> disconnect_session()
```

---

### Process 2: Text Message Handling

#### Functions

**handle_text_message**
Orchestrate the full text message flow: store user message, get Claude response, stream to client, store assistant message. If session mode is voice, also triggers TTS.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |
| content | `str` | User's text message |
| conversation_id | `str` | UUID of current conversation |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: streams response to client via WebSocket, stores messages in DB |

**send_response_stream**
Send a streaming Claude response to the client as response_start, response_delta, and response_complete frames.

| Input | Type | Format/Schema |
|-------|------|---------------|
| websocket | `WebSocket` | Client WebSocket |
| response_stream | `AsyncIterator[ResponseEvent]` | `ResponseEvent = { type: "delta" | "tool_use" | "tool_result" | "complete", content: str, tool: Optional[str], input: Optional[dict], message_id: str }` |

| Output | Type | Format/Schema |
|--------|------|---------------|
| full_response | `str` | The complete assembled response text |

#### Pipeline

```
content, conversation_id --> create_message() --> stored user message
conversation_id --> list_messages() --> history --> get_response() --> response_stream
response_stream, websocket --> send_response_stream() --> full_response
full_response, conversation_id --> create_message() --> stored assistant message
if mode == "voice":
  full_response --> speak_text() --> audio chunks --> websocket
```

---

### Process 3: Voice Input Handling (STT)

#### Functions

**buffer_audio**
Append an incoming binary audio frame to the session's audio buffer.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state (has audio_buffer: bytearray) |
| audio_data | `bytes` | Raw audio frame from client mic |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: appends to session.audio_buffer |

**handle_audio_complete**
Orchestrate voice input: transcribe the buffered audio, send transcription to client, then hand off to the text message flow.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Session with filled audio_buffer |
| conversation_id | `str` | UUID of current conversation |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: sends transcription frame, triggers text message handling |

**transcribe_audio**
Convert a raw audio buffer to text using local STT.

| Input | Type | Format/Schema |
|-------|------|---------------|
| audio_data | `bytes` | Raw audio bytes |

| Output | Type | Format/Schema |
|--------|------|---------------|
| transcription | `str` | Transcribed text |

#### Pipeline

```
binary frames --> buffer_audio() --> session.audio_buffer (accumulated)
audio_complete signal --> handle_audio_complete():
  session.audio_buffer --> transcribe_audio() --> transcription
  transcription --> send JSON { type: "transcription", content } to client
  transcription --> handle_text_message() (reuses Process 2)
  clear session.audio_buffer
```

---

### Process 4: Voice Output Handling (TTS)

#### Functions

**speak_text**
Generate speech audio from text and stream audio chunks as binary frames to the client. Runs as a cancellable async task so interrupts can stop it.

| Input | Type | Format/Schema |
|-------|------|---------------|
| text | `str` | Full assistant response text to speak |
| websocket | `WebSocket` | Client WebSocket to send binary frames to |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: sends binary audio frames + audio_complete JSON frame |

**generate_speech_chunks**
Generate speech audio as an async iterator of audio chunks from text input using local TTS.

| Input | Type | Format/Schema |
|-------|------|---------------|
| text | `str` | Text to convert to speech |

| Output | Type | Format/Schema |
|--------|------|---------------|
| chunks | `AsyncIterator[bytes]` | Audio chunks as bytes |

**handle_interrupt**
Cancel active TTS generation and notify the client.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Session with active_tts_task |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: cancels TTS task, sends audio_complete frame |

#### Pipeline

```
full_response --> speak_text():
  text --> generate_speech_chunks() --> audio chunks --> binary frames to websocket
  --> send { type: "audio_complete" }

interrupt signal --> handle_interrupt():
  cancel session.active_tts_task
  send { type: "audio_complete" } to websocket
```

---

### Process 5: Claude LLM Interaction

#### Functions

**get_response**
Send conversation history to Claude and return a streaming async iterator of response events. Handles tool calls internally by dispatching to registered tools and feeding results back.

| Input | Type | Format/Schema |
|-------|------|---------------|
| messages | `list[Message]` | `Message = { role: str, content: str }` -- conversation history |
| system_prompt | `str` | System prompt from settings |

| Output | Type | Format/Schema |
|--------|------|---------------|
| response_stream | `AsyncIterator[ResponseEvent]` | `ResponseEvent = { type: "delta" | "tool_use" | "tool_result" | "complete", content: str, tool: Optional[str], input: Optional[dict], message_id: str }` |

**init_llm**
Initialize the Claude Agent SDK client with OAuth credentials and register available tools (web search).

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Reads config from environment |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: client ready for get_response calls |

**cleanup_llm**
Shut down the Claude Agent SDK client gracefully.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: client resources released |

#### Pipeline

```
messages, system_prompt --> get_response() --> response_stream
  internally: tool_use event --> dispatch to search_web() --> tool_result fed back to Claude
```

---

### Process 6: Web Search Tool

#### Functions

**search_web**
Execute a web search query and return formatted results. Registered as a Claude tool.

| Input | Type | Format/Schema |
|-------|------|---------------|
| query | `str` | Search query string |

| Output | Type | Format/Schema |
|--------|------|---------------|
| results | `str` | Formatted search results as text (title, URL, snippet per result) |

**init_search**
Initialize the search API client with API key from environment.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Reads BRAVE_API_KEY from environment |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: search client ready |

**cleanup_search**
Shut down the search client.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: client resources released |

#### Pipeline

```
query (from Claude tool call) --> search_web() --> results (returned to Claude as tool_result)
```

---

### Process 7: Database Operations

#### Functions

**init_db**
Initialize SQLite database: create tables if not exist, return connection pool.

| Input | Type | Format/Schema |
|-------|------|---------------|
| db_path | `str` | Path to SQLite database file |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: database ready, schema created |

**cleanup_db**
Close database connections.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: connections closed |

**create_conversation**
Create a new conversation record.

| Input | Type | Format/Schema |
|-------|------|---------------|
| title | `Optional[str]` | Initial title (None = auto-generate from first message later) |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversation | `Conversation` | `{ id: str (uuid), title: Optional[str], created_at: datetime, updated_at: datetime }` |

**list_conversations**
List all conversations ordered by most recently updated.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversations | `list[Conversation]` | List of `{ id: str, title: Optional[str], created_at: datetime, updated_at: datetime }` |

**get_conversation**
Retrieve a single conversation by ID.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversation | `Optional[Conversation]` | Conversation record or None |

**update_conversation**
Update a conversation's title and updated_at timestamp.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |
| title | `str` | New title |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversation | `Conversation` | Updated conversation record |

**delete_conversation**
Delete a conversation and all its messages.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: conversation and messages removed |

**create_message**
Store a new message in a conversation. If this is the first user message and the conversation has no title, auto-generate a title from the content.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID of parent conversation |
| role | `str` | "user" or "assistant" |
| content | `str` | Message text |
| source | `str` | "text" or "voice" |

| Output | Type | Format/Schema |
|--------|------|---------------|
| message | `Message` | `{ id: str (uuid), conversation_id: str, role: str, content: str, source: str, created_at: datetime }` |

**list_messages**
List all messages in a conversation ordered by creation time.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |

| Output | Type | Format/Schema |
|--------|------|---------------|
| messages | `list[Message]` | Ordered list of message records |

**get_setting**
Retrieve a setting value by key.

| Input | Type | Format/Schema |
|-------|------|---------------|
| key | `str` | Setting key (e.g., "system_prompt") |

| Output | Type | Format/Schema |
|--------|------|---------------|
| value | `Optional[str]` | Setting value or None if not set |

**set_setting**
Create or update a setting.

| Input | Type | Format/Schema |
|-------|------|---------------|
| key | `str` | Setting key |
| value | `str` | Setting value |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: setting stored |

#### Pipeline

```
Conversations:
  title --> create_conversation() --> conversation
  --> list_conversations() --> conversations
  conversation_id --> get_conversation() --> conversation
  conversation_id, title --> update_conversation() --> conversation
  conversation_id --> delete_conversation()

Messages:
  conversation_id, role, content, source --> create_message() --> message
  conversation_id --> list_messages() --> messages

Settings:
  key --> get_setting() --> value
  key, value --> set_setting()
```

---

### Process 8: Mode Switching

#### Functions

**handle_mode_switch**
Update the session's current mode (text or voice). Mode determines whether TTS runs on assistant responses.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |
| mode | `str` | "text" or "voice" |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: session.mode updated |

#### Pipeline

```
mode_switch frame --> handle_mode_switch() --> session.mode updated
```

---

### Process 9: Server Lifecycle

#### Functions

**start_server**
Initialize all services (DB, LLM, search, STT, TTS) and start the FastAPI app.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Reads config from environment |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: all services initialized, server running |

**stop_server**
Gracefully shut down all services.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: all services cleaned up |

**init_stt**
Initialize the local STT model.

| Input | Type | Format/Schema |
|-------|------|---------------|
| model_path | `str` | Path to whisper model directory (/Users/jeff/mlx_models) |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: STT model loaded and ready |

**cleanup_stt**
Unload STT model resources.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: model resources released |

**init_tts**
Initialize the local TTS model.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Loads Kokoro 4-bit MLX model |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: TTS model loaded and ready |

**cleanup_tts**
Unload TTS model resources.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: model resources released |

#### Pipeline

```
startup:
  start_server() --> init_db() + init_stt() + init_tts() + init_llm() + init_search()

shutdown:
  stop_server() --> cleanup_db() + cleanup_stt() + cleanup_tts() + cleanup_llm() + cleanup_search()
```

---

## Full Function Reference

**accept_connection**
Accept an incoming WebSocket connection and initialize session state.

| Input | Type | Format/Schema |
|-------|------|---------------|
| websocket | `WebSocket` | FastAPI WebSocket instance |

| Output | Type | Format/Schema |
|--------|------|---------------|
| session | `Session` | `{ id: str, websocket: WebSocket, mode: str ("text"), conversation_id: Optional[str], audio_buffer: bytearray, active_tts_task: Optional[asyncio.Task] }` |

Dependencies: none

---

**route_incoming_frame**
Read a single frame from the WebSocket, classify it, and dispatch to the appropriate handler.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: dispatches to handler functions |

Dependencies: handle_text_message, buffer_audio, handle_audio_complete, handle_mode_switch, handle_interrupt

---

**disconnect_session**
Clean up session state on WebSocket close.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Session to clean up |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: resources released |

Dependencies: handle_interrupt (if TTS active)

---

**handle_text_message**
Orchestrate the full text message flow: store user message, get Claude response, stream to client, store assistant message, optionally trigger TTS.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |
| content | `str` | User's text message |
| conversation_id | `str` | UUID of current conversation |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: streams response to client, stores messages in DB |

Dependencies: create_message, list_messages, get_setting, get_response, send_response_stream, speak_text

---

**send_response_stream**
Send a streaming Claude response to the client as response_start, response_delta, and response_complete frames.

| Input | Type | Format/Schema |
|-------|------|---------------|
| websocket | `WebSocket` | Client WebSocket |
| response_stream | `AsyncIterator[ResponseEvent]` | Stream of response events |

| Output | Type | Format/Schema |
|--------|------|---------------|
| full_response | `str` | The complete assembled response text |

Dependencies: none

---

**buffer_audio**
Append an incoming binary audio frame to the session's audio buffer.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |
| audio_data | `bytes` | Raw audio frame from client mic |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: appends to session.audio_buffer |

Dependencies: none

---

**handle_audio_complete**
Orchestrate voice input: transcribe buffered audio, send transcription to client, hand off to text message flow.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Session with filled audio_buffer |
| conversation_id | `str` | UUID of current conversation |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: sends transcription, triggers text message handling |

Dependencies: transcribe_audio, handle_text_message

---

**transcribe_audio**
Convert a raw audio buffer to text using local STT.

| Input | Type | Format/Schema |
|-------|------|---------------|
| audio_data | `bytes` | Raw audio bytes |

| Output | Type | Format/Schema |
|--------|------|---------------|
| transcription | `str` | Transcribed text |

Dependencies: none (uses initialized STT model)

---

**speak_text**
Generate speech audio from text and stream binary audio chunks to the client. Runs as a cancellable async task.

| Input | Type | Format/Schema |
|-------|------|---------------|
| text | `str` | Full assistant response text |
| websocket | `WebSocket` | Client WebSocket |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: sends binary audio frames + audio_complete JSON frame |

Dependencies: generate_speech_chunks

---

**generate_speech_chunks**
Generate speech audio as an async iterator of chunks from text using local TTS.

| Input | Type | Format/Schema |
|-------|------|---------------|
| text | `str` | Text to convert to speech |

| Output | Type | Format/Schema |
|--------|------|---------------|
| chunks | `AsyncIterator[bytes]` | Audio chunks as bytes |

Dependencies: none (uses initialized TTS model)

---

**handle_interrupt**
Cancel active TTS generation and notify the client.

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Session with active_tts_task |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: cancels TTS task, sends audio_complete frame |

Dependencies: none

---

**get_response**
Send conversation history to Claude and return a streaming async iterator of response events. Handles tool calls internally.

| Input | Type | Format/Schema |
|-------|------|---------------|
| messages | `list[Message]` | Conversation history as `{ role: str, content: str }` dicts |
| system_prompt | `str` | System prompt from settings |

| Output | Type | Format/Schema |
|--------|------|---------------|
| response_stream | `AsyncIterator[ResponseEvent]` | `ResponseEvent = { type: "delta" | "tool_use" | "tool_result" | "complete", content: str, tool: Optional[str], input: Optional[dict], message_id: str }` |

Dependencies: search_web (as registered tool)

---

**init_llm**
Initialize the Claude Agent SDK client with OAuth credentials and register available tools.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Reads config from environment |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: client ready |

Dependencies: none

---

**cleanup_llm**
Shut down the Claude Agent SDK client.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: client resources released |

Dependencies: none

---

**search_web**
Execute a web search query and return formatted results.

| Input | Type | Format/Schema |
|-------|------|---------------|
| query | `str` | Search query string |

| Output | Type | Format/Schema |
|--------|------|---------------|
| results | `str` | Formatted results text (title, URL, snippet per result) |

Dependencies: none (uses initialized search client)

---

**init_search**
Initialize the search API client with API key from environment.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Reads BRAVE_API_KEY from environment |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: search client ready |

Dependencies: none

---

**cleanup_search**
Shut down the search client.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: client resources released |

Dependencies: none

---

**init_db**
Initialize SQLite database: create tables if not exist.

| Input | Type | Format/Schema |
|-------|------|---------------|
| db_path | `str` | Path to SQLite database file |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: database ready, schema created |

Dependencies: none

---

**cleanup_db**
Close database connections.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: connections closed |

Dependencies: none

---

**create_conversation**
Create a new conversation record.

| Input | Type | Format/Schema |
|-------|------|---------------|
| title | `Optional[str]` | Initial title (None = auto-generate later) |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversation | `Conversation` | `{ id: str (uuid), title: Optional[str], created_at: datetime, updated_at: datetime }` |

Dependencies: none

---

**list_conversations**
List all conversations ordered by most recently updated.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversations | `list[Conversation]` | List of conversation records |

Dependencies: none

---

**get_conversation**
Retrieve a single conversation by ID.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversation | `Optional[Conversation]` | Conversation record or None |

Dependencies: none

---

**update_conversation**
Update a conversation's title and updated_at timestamp.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |
| title | `str` | New title |

| Output | Type | Format/Schema |
|--------|------|---------------|
| conversation | `Conversation` | Updated conversation record |

Dependencies: none

---

**delete_conversation**
Delete a conversation and all its messages.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: conversation and messages removed |

Dependencies: none

---

**create_message**
Store a new message in a conversation. Auto-generates conversation title from first user message if title is None.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID of parent conversation |
| role | `str` | "user" or "assistant" |
| content | `str` | Message text |
| source | `str` | "text" or "voice" |

| Output | Type | Format/Schema |
|--------|------|---------------|
| message | `Message` | `{ id: str (uuid), conversation_id: str, role: str, content: str, source: str, created_at: datetime }` |

Dependencies: get_conversation, update_conversation (for auto-title)

---

**list_messages**
List all messages in a conversation ordered by creation time.

| Input | Type | Format/Schema |
|-------|------|---------------|
| conversation_id | `str` | UUID |

| Output | Type | Format/Schema |
|--------|------|---------------|
| messages | `list[Message]` | Ordered list of message records |

Dependencies: none

---

**get_setting**
Retrieve a setting value by key.

| Input | Type | Format/Schema |
|-------|------|---------------|
| key | `str` | Setting key (e.g., "system_prompt") |

| Output | Type | Format/Schema |
|--------|------|---------------|
| value | `Optional[str]` | Setting value or None if not set |

Dependencies: none

---

**set_setting**
Create or update a setting.

| Input | Type | Format/Schema |
|-------|------|---------------|
| key | `str` | Setting key |
| value | `str` | Setting value |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: setting stored |

Dependencies: none

---

**handle_mode_switch**
Update the session's current mode (text or voice).

| Input | Type | Format/Schema |
|-------|------|---------------|
| session | `Session` | Current session state |
| mode | `str` | "text" or "voice" |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: session.mode updated |

Dependencies: none

---

**start_server**
Initialize all services and start the FastAPI app.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Reads config from environment |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: all services initialized, server running |

Dependencies: init_db, init_stt, init_tts, init_llm, init_search

---

**stop_server**
Gracefully shut down all services.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: all services cleaned up |

Dependencies: cleanup_db, cleanup_stt, cleanup_tts, cleanup_llm, cleanup_search

---

**init_stt**
Initialize the local STT model.

| Input | Type | Format/Schema |
|-------|------|---------------|
| model_path | `str` | Path to whisper model directory (/Users/jeff/mlx_models) |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: STT model loaded and ready |

Dependencies: none

---

**cleanup_stt**
Unload STT model resources.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: model resources released |

Dependencies: none

---

**init_tts**
Initialize the local TTS model.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | Loads Kokoro 4-bit MLX model |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: TTS model loaded and ready |

Dependencies: none

---

**cleanup_tts**
Unload TTS model resources.

| Input | Type | Format/Schema |
|-------|------|---------------|
| None | — | — |

| Output | Type | Format/Schema |
|--------|------|---------------|
| None | — | Side effect: model resources released |

Dependencies: none

---

## Global Pipeline

### Text mode (golden path)

```
user types message
  --> route_incoming_frame()
  --> handle_text_message()
    --> create_message(role="user", source="text")
    --> list_messages() --> history
    --> get_setting("system_prompt") --> system_prompt
    --> get_response(history, system_prompt) --> response_stream
      --> [if tool_use: search_web(query) --> tool_result fed back to Claude]
    --> send_response_stream(websocket, response_stream) --> full_response
    --> create_message(role="assistant", source="text")
```

### Voice mode (golden path)

```
user taps record, speaks, taps send
  --> binary frames --> buffer_audio() (accumulates)
  --> audio_complete --> handle_audio_complete()
    --> transcribe_audio(audio_buffer) --> transcription
    --> send { type: "transcription" } to client
    --> handle_text_message(transcription, conversation_id)
      --> [same as text mode golden path above]
      --> full_response --> speak_text(full_response, websocket)
        --> generate_speech_chunks(text) --> audio chunks --> binary frames to client
        --> send { type: "audio_complete" }
```

### Interrupt flow

```
user taps during TTS playback
  --> route_incoming_frame()
  --> handle_interrupt()
    --> cancel session.active_tts_task
    --> send { type: "audio_complete" } to client
```

### Server lifecycle

```
startup:
  start_server() --> init_db() + init_stt() + init_tts() + init_llm() + init_search()
  --> accept WebSocket connections

shutdown:
  stop_server() --> cleanup_db() + cleanup_stt() + cleanup_tts() + cleanup_llm() + cleanup_search()
```
