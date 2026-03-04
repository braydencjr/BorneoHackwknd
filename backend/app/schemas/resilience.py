from pydantic import BaseModel
from typing import List, Literal


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    user_id: str = "demo_user"  # will be overridden by auth dependency
