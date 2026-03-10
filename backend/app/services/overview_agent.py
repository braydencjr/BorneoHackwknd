"""
OverviewAgentService — stateless single-shot daily financial health scan.

Key differences from resilience_agent.py:
  • No MemorySaver checkpointer — every invocation starts fresh, no thread history.
  • Only 4 tools: display_vitals, show_resilience_score, trigger_emergency_alert,
    show_savings_plan. No subagents, no HITL, no educator.
  • Dedicated system prompt that instructs the agent to write per-metric explanations.
  • Singleton agent instance (compiled graph reuse) — safe because there is no shared
    mutable state without a checkpointer.
"""
import json
import logging
import os
from typing import AsyncGenerator

from deepagents import create_deep_agent
from langchain_google_genai import ChatGoogleGenerativeAI

from app.tools.financial_tools import (
    display_vitals,
    show_resilience_score,
    trigger_emergency_alert,
    show_savings_plan,
)
from app.agents.prompts.finsight_overview import FINSIGHT_OVERVIEW_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool → card-type mapping (subset of the main agent's map)
# ---------------------------------------------------------------------------
_TOOL_CARD_MAP = {
    "display_vitals":          "vitals",
    "show_resilience_score":   "score",
    "trigger_emergency_alert": "alert",
    "show_savings_plan":       "plan",
}

_TOOL_STEP_LABELS = {
    "display_vitals":          "Reading vital signs…",
    "show_resilience_score":   "Calculating resilience score…",
    "trigger_emergency_alert": "Checking emergency signals…",
    "show_savings_plan":       "Building savings plan…",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _build_model(api_key: str, model_name: str) -> ChatGoogleGenerativeAI:
    if ":" in model_name:
        model_name = model_name.split(":", 1)[1]
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.1,  # lower than chat — we want predictable structured output
        convert_system_message_to_human=False,
    )


# ---------------------------------------------------------------------------
# Singleton agent — compiled once, reused for all requests.
# No checkpointer → each astream_events call is fully independent.
# ---------------------------------------------------------------------------
_overview_agent = None


def _get_overview_agent():
    global _overview_agent
    if _overview_agent is None:
        from app.core.config import Settings
        settings = Settings()
        api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        model_name = settings.GEMINI_MODEL or "gemini-2.0-flash"
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set. Add it to your .env file.")
        model = _build_model(api_key, model_name)
        _overview_agent = create_deep_agent(
            model=model,
            tools=[
                display_vitals,
                show_resilience_score,
                trigger_emergency_alert,
                show_savings_plan,
            ],
            system_prompt=FINSIGHT_OVERVIEW_SYSTEM_PROMPT,
            # No checkpointer → stateless: each invoke is a fresh execution
        )
        logger.info("Overview agent initialised (stateless, no checkpointer).")
    return _overview_agent


# ---------------------------------------------------------------------------
# Main streaming function
# ---------------------------------------------------------------------------

async def stream_overview_response(user_id: str) -> AsyncGenerator[str, None]:
    """
    Runs the overview agent for `user_id` and yields SSE-formatted strings.

    Event shapes emitted (subset of the main agent's protocol):
      {"type": "step",        "tool": "display_vitals", "label": "Reading vital signs…"}
      {"type": "tool_call",   "tool": "display_vitals", "state": "running"}
      {"type": "tool_call",   "tool": "display_vitals", "state": "done"}
      {"type": "tool_result", "tool": "display_vitals", "data": {...}}
      {"type": "text",        "content": "..."}
      {"type": "error",       "message": "..."}
      {"type": "done"}
    """
    agent = _get_overview_agent()

    # Inject user_id the same way the main agent expects it
    message = f"Run my financial health overview [user_id: {user_id}]"

    # No thread_id in config → LangGraph creates ephemeral state per invocation
    config = {"recursion_limit": 50}

    try:
        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
            version="v2",
        ):
            event_type = event.get("event", "")
            name       = event.get("name", "")
            meta       = event.get("metadata", {})
            checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")

            # ── Streaming text tokens from the main LLM node ──────────────
            if event_type == "on_chat_model_stream":
                if "tools:" not in checkpoint_ns:
                    chunk = event["data"].get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    yield _sse({"type": "text", "content": block["text"]})
                        elif isinstance(content, str) and content:
                            yield _sse({"type": "text", "content": content})

            # ── Tool about to run ─────────────────────────────────────────
            elif event_type == "on_tool_start":
                if name in _TOOL_CARD_MAP:
                    yield _sse({
                        "type": "step",
                        "tool": name,
                        "label": _TOOL_STEP_LABELS.get(name, f"Running {name}…"),
                    })
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})

            # ── Tool finished ─────────────────────────────────────────────
            elif event_type == "on_tool_end":
                if name in _TOOL_CARD_MAP:
                    raw_output = event["data"].get("output", "")
                    if hasattr(raw_output, "content"):
                        raw_output = raw_output.content
                    if isinstance(raw_output, str):
                        try:
                            card_data = json.loads(raw_output)
                            yield _sse({"type": "tool_call", "tool": name, "state": "done"})
                            yield _sse({"type": "tool_result", "tool": name, "data": card_data})
                        except json.JSONDecodeError:
                            pass

    except Exception as exc:
        logger.exception("Overview agent error for user %s", user_id)
        yield _sse({"type": "error", "message": str(exc)})
    finally:
        yield _sse({"type": "done"})
