from pydantic import BaseModel
from typing import List, Literal


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    user_id: str = "demo_user"  # will be overridden by auth dependency


class ResumeRequest(BaseModel):
    """Sent by the frontend to resume a HITL-interrupted agent run."""
    approved: bool
    reason: str = ""  # optional human note (e.g. "I'd rather read it later")
