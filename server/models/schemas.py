from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class Conversation(BaseModel):
    id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class Message(BaseModel):
    id: str
    conversation_id: str
    role: str  # "user" or "assistant"
    content: str
    source: str  # "text" or "voice"
    sources: Optional[str] = None
    created_at: datetime


class Setting(BaseModel):
    key: str
    value: str
