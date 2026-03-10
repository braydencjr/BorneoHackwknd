from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.resilience import ChatRequest, ResumeRequest
from app.services.resilience_agent import stream_agent_response, resume_agent_response
from app.services.overview_agent import stream_overview_response

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


# ---------------------------------------------------------------------------
# Overview endpoints — stateless single-shot daily health scan.
# No request body required: user_id is implicit (demo) or from auth token.
# ---------------------------------------------------------------------------

@router.post("/overview/demo")
async def resilience_overview_demo():
    """
    One-shot daily overview scan for the demo user.
    Runs the stateless overview agent: vitals → score → alert (if critical) → plan,
    then streams an AI-authored plain-English analysis of each metric.
    No auth, no conversation history.
    """
    return StreamingResponse(
        stream_overview_response("demo_user"),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/overview")
async def resilience_overview(current_user: User = Depends(get_current_user)):
    """
    One-shot daily overview scan for the authenticated user.
    Same as /overview/demo but uses the real user's profile.
    """
    return StreamingResponse(
        stream_overview_response(str(current_user.id)),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
