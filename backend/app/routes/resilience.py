from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.resilience import ChatRequest
from app.services.resilience_agent import stream_agent_response

router = APIRouter()


@router.post("/chat")
async def resilience_chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Stream the FinShield AI agent response as Server-Sent Events.
    Each event is a JSON payload on a `data:` line.
    """
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    user_id = str(current_user.id)

    return StreamingResponse(
        stream_agent_response(messages, user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/chat/demo")
async def resilience_chat_demo(req: ChatRequest):
    """
    Demo endpoint — no auth required. Uses 'demo_user' profile.
    Remove or secure before production deployment.
    """
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    return StreamingResponse(
        stream_agent_response(messages, "demo_user"),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )
