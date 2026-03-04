from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.resilience import ChatRequest, ResumeRequest
from app.services.resilience_agent import stream_agent_response, resume_agent_response

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
}


@router.post("/chat")
async def resilience_chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(
        stream_agent_response(messages, str(current_user.id)),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/chat/resume")
async def resilience_resume(
    req: ResumeRequest,
    current_user: User = Depends(get_current_user),
):
    """Resume a HITL-interrupted agent run (authenticated)."""
    return StreamingResponse(
        resume_agent_response(req.approved, req.reason, str(current_user.id)),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/chat/demo")
async def resilience_chat_demo(req: ChatRequest):
    """Demo endpoint — no auth required. Uses 'demo_user' profile."""
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(
        stream_agent_response(messages, "demo_user"),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/chat/demo/resume")
async def resilience_demo_resume(req: ResumeRequest):
    """Resume a HITL-interrupted demo agent run (no auth)."""
    return StreamingResponse(
        resume_agent_response(req.approved, req.reason, "demo_user"),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
