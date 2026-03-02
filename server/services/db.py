import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from server.models.schemas import Conversation, Message

logger = logging.getLogger(__name__)

_db_path: str = "chat_voice.db"
_connection: Optional[aiosqlite.Connection] = None


async def _get_db() -> aiosqlite.Connection:
    global _connection
    if _connection is None:
        logger.info("Opening database connection to %s", _db_path)
        _connection = await aiosqlite.connect(_db_path)
        _connection.row_factory = aiosqlite.Row
    return _connection


async def init_db(db_path: str = "chat_voice.db") -> None:
    global _db_path
    _db_path = db_path
    db = await _get_db()
    await db.executescript(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'text',
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )
    await db.commit()

    # Migration: add sources column if it doesn't exist
    try:
        await db.execute("ALTER TABLE messages ADD COLUMN sources TEXT DEFAULT NULL")
        await db.commit()
    except Exception:
        pass  # Column already exists

    logger.info("Database initialized at %s", _db_path)


async def cleanup_db() -> None:
    global _connection
    if _connection is not None:
        await _connection.close()
        _connection = None
        logger.info("Database connection closed")


async def create_conversation(title: Optional[str] = None) -> Conversation:
    db = await _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conversation_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (conversation_id, title, now, now),
    )
    await db.commit()
    logger.info("Created conversation %s", conversation_id)
    return Conversation(id=conversation_id, title=title, created_at=now, updated_at=now)


async def list_conversations() -> list[Conversation]:
    db = await _get_db()
    cursor = await db.execute(
        "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
    )
    rows = await cursor.fetchall()
    return [Conversation(id=r["id"], title=r["title"], created_at=r["created_at"], updated_at=r["updated_at"]) for r in rows]


async def get_conversation(conversation_id: str) -> Optional[Conversation]:
    db = await _get_db()
    cursor = await db.execute(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return Conversation(id=row["id"], title=row["title"], created_at=row["created_at"], updated_at=row["updated_at"])


async def update_conversation(conversation_id: str, title: str) -> Conversation:
    db = await _get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (title, now, conversation_id),
    )
    await db.commit()
    logger.info("Updated conversation %s", conversation_id)
    conv = await get_conversation(conversation_id)
    return conv


async def delete_conversation(conversation_id: str) -> None:
    db = await _get_db()
    await db.execute(
        "DELETE FROM messages WHERE conversation_id = ?", (conversation_id,)
    )
    await db.execute(
        "DELETE FROM conversations WHERE id = ?", (conversation_id,)
    )
    await db.commit()
    logger.info("Deleted conversation %s and its messages", conversation_id)


async def create_message(
    conversation_id: str, role: str, content: str, source: str, sources: str | None = None
) -> Message:
    db = await _get_db()
    now = datetime.now(timezone.utc).isoformat()
    message_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, source, sources, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (message_id, conversation_id, role, content, source, sources, now),
    )

    # Auto-title conversation from first user message if no title exists
    if role == "user":
        cursor = await db.execute(
            "SELECT title FROM conversations WHERE id = ?", (conversation_id,)
        )
        row = await cursor.fetchone()
        if row and row["title"] is None:
            auto_title = content[:50]
            await db.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (auto_title, now, conversation_id),
            )
            logger.info("Auto-titled conversation %s: %s", conversation_id, auto_title)

    await db.commit()
    logger.info("Created message %s in conversation %s", message_id, conversation_id)
    return Message(
        id=message_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        source=source,
        sources=sources,
        created_at=now,
    )


async def list_messages(conversation_id: str) -> list[Message]:
    db = await _get_db()
    cursor = await db.execute(
        "SELECT id, conversation_id, role, content, source, sources, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    )
    rows = await cursor.fetchall()
    return [
        Message(
            id=r["id"],
            conversation_id=r["conversation_id"],
            role=r["role"],
            content=r["content"],
            source=r["source"],
            sources=r["sources"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


async def get_setting(key: str) -> Optional[str]:
    db = await _get_db()
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = ?", (key,)
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return row["value"]


async def set_setting(key: str, value: str) -> None:
    db = await _get_db()
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, value),
    )
    await db.commit()
    logger.info("Set setting %s", key)


async def delete_messages_after(conversation_id: str, message_id: str) -> None:
    """Delete all messages in a conversation created after the given message."""
    conn = await _get_db()
    cursor = await conn.execute(
        "SELECT created_at FROM messages WHERE id = ?", (message_id,)
    )
    row = await cursor.fetchone()
    if row is None:
        return
    await conn.execute(
        "DELETE FROM messages WHERE conversation_id = ? AND created_at > ?",
        (conversation_id, row["created_at"]),
    )
    await conn.commit()
    logger.info("Deleted messages after %s in conversation %s", message_id, conversation_id)


async def update_message_content(message_id: str, content: str) -> None:
    """Update the content of a message."""
    conn = await _get_db()
    await conn.execute(
        "UPDATE messages SET content = ? WHERE id = ?",
        (content, message_id),
    )
    await conn.commit()
    logger.info("Updated message content for %s", message_id)


async def delete_message(message_id: str) -> None:
    """Delete a single message."""
    conn = await _get_db()
    await conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
    await conn.commit()
    logger.info("Deleted message %s", message_id)
