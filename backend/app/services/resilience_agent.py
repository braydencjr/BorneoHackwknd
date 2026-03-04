"""
ResilienceAgentService — builds a DeepAgents orchestrator with a ShockSimulator subagent.
Streams events using astream_events (v2) and normalises them to frontend-ready SSE dicts.
"""
import json
import os
from typing import AsyncGenerator, List

from deepagents import create_deep_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver

from app.tools.financial_tools import (
    display_vitals,
    show_resilience_score,
    trigger_emergency_alert,
    show_savings_plan,
    suggest_actions,
)
from app.tools.shock_tools import simulate_shock
from app.agents.shock_simulator import SHOCK_SUBAGENT_DEF

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
FINSHIELD_SYSTEM_PROMPT = """\
You are FinShield AI, a personal financial resilience coach for users in Malaysia.

══ FIRST MESSAGE / FRESH SESSION — Initial Scan ══
When the user first arrives with no prior financial data in the conversation:
1. Call display_vitals(user_id)          — baseline health metrics
2. Call show_resilience_score(user_id)   — overall resilience score
3. Call trigger_emergency_alert(user_id) — ONLY if the score is below 40
4. Call suggest_actions with a brief summary — always close the scan with chips

Do this ONCE per session. Once the scan data exists in context, do NOT repeat
these steps on subsequent messages unless the user explicitly asks to rescan.

══ FOLLOW-UP MESSAGES — Conversational Mode ══
You already have the user's financial profile from the initial scan. Use it.

• Casual messages, greetings ("hi", "thanks", "ok", small talk) →
  Reply warmly in 1-2 sentences. Do NOT call any tools.
• Questions about data already shown → answer directly without re-calling tools.
• "What if I lose my job / get ill / disaster / flood / war?" →
  Delegate to the shock_simulator subagent via the task tool immediately.
• "Show me a savings plan" / savings questions → call show_savings_plan(user_id).
• "Rescan", "refresh", "check again" → re-run the initial scan sequence.

══ RESPONSE STYLE ══
• Keep prose to 1-3 sentences — the UI cards carry the data.
• Use Malaysian financial context: RM, EPF, PTPTN, SOCSO, Amanah Saham.
• Be direct and empathetic, never preachy or salesy.
• Never recommend specific investment products or insurance policies.

user_id is injected into each message as [user_id: <value>].
"""


def _build_model(api_key: str, model_name: str) -> ChatGoogleGenerativeAI:
    # Strip LangChain provider prefix if present (e.g. 'google_genai:gemini-...' → 'gemini-...')
    if ":" in model_name:
        model_name = model_name.split(":", 1)[1]
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.2,
        convert_system_message_to_human=False,
    )


def _build_agent(model: ChatGoogleGenerativeAI) -> object:
    """Build a DeepAgents orchestrator with a ShockSimulator subagent."""
    # Build subagent definition — pass the same model instance so API key is inherited
    shock_def = {
        "name": SHOCK_SUBAGENT_DEF["name"],
        "description": SHOCK_SUBAGENT_DEF["description"],
        "system_prompt": SHOCK_SUBAGENT_DEF["system_prompt"],
        "model": model,
        "tools": [simulate_shock],
    }

    return create_deep_agent(
        model=model,
        tools=[
            display_vitals,
            show_resilience_score,
            trigger_emergency_alert,
            show_savings_plan,
            suggest_actions,
        ],
        subagents=[shock_def],
        system_prompt=FINSHIELD_SYSTEM_PROMPT,
        checkpointer=_checkpointer,
    )


# ---------------------------------------------------------------------------
# In-memory checkpointer — maintains per-user conversation history.
# Keyed by thread_id (= user_id). Cleared on server restart (fine for hackathon).
# ---------------------------------------------------------------------------
_checkpointer = MemorySaver()

# ---------------------------------------------------------------------------
# Singleton agent (initialised lazily on first request)
# ---------------------------------------------------------------------------
_agent = None


def _get_agent():
    global _agent
    if _agent is None:
        # Instantiate Settings() directly to bypass @lru_cache and always read fresh .env values
        from app.core.config import Settings
        settings = Settings()
        api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        model_name = settings.GEMINI_MODEL or "gemini-3.1-flash-lite-preview"
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to your .env file."
            )
        model = _build_model(api_key, model_name)
        _agent = _build_agent(model)
    return _agent


# ---------------------------------------------------------------------------
# SSE event normaliser
# ---------------------------------------------------------------------------
_TOOL_CARD_MAP = {
    "display_vitals": "vitals",
    "show_resilience_score": "score",
    "trigger_emergency_alert": "alert",
    "show_savings_plan": "plan",
    "suggest_actions": "chips",
    "simulate_shock": "shock",
}

# Tools that indicate subagent work (deepagents task tool)
_SUBAGENT_TOOLS = {"task", "shock_simulator"}


async def stream_agent_response(
    messages: List[dict],
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Runs the agent and yields SSE-formatted strings.
    Each yielded string is a `data: {...}\\n\\n` line.

    `messages` should contain ONLY the latest user message — the MemorySaver
    checkpointer restores prior conversation history automatically.

    Event shapes:
      {"type":"text","content":"..."}
      {"type":"tool_call","tool":"display_vitals","state":"running"}
      {"type":"tool_result","tool":"display_vitals","data":{...}}
      {"type":"subagent_status","status":"running","scenario":"job_loss"}
      {"type":"error","message":"..."}
      {"type":"done"}
    """
    agent = _get_agent()

    # Inject user_id into the last user message so tools can pick it up
    enriched = list(messages)
    if enriched and enriched[-1]["role"] == "user":
        enriched[-1] = {
            "role": "user",
            "content": f"{enriched[-1]['content']}\n[user_id: {user_id}]",
        }

    # Thread ID = user_id so each user gets their own isolated conversation memory
    config = {"configurable": {"thread_id": user_id}}

    try:
        async for event in agent.astream_events(
            {"messages": enriched},
            config=config,
            version="v2",
        ):
            event_type = event.get("event", "")
            name = event.get("name", "")

            # ---- streaming text tokens ----
            if event_type == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    content = chunk.content
                    if isinstance(content, list):
                        # Gemini may return a list of content blocks
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                yield _sse({"type": "text", "content": block["text"]})
                    elif isinstance(content, str) and content:
                        yield _sse({"type": "text", "content": content})

            # ---- tool about to run ----
            elif event_type == "on_tool_start":
                if name in _SUBAGENT_TOOLS:
                    # Detect shock scenario from input
                    inp = event["data"].get("input", {})
                    scenario = inp.get("scenario", "") or _extract_scenario(str(inp))
                    yield _sse({
                        "type": "subagent_status",
                        "status": "running",
                        "scenario": scenario or "unknown",
                    })
                elif name in _TOOL_CARD_MAP:
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})

            # ---- tool finished ----
            elif event_type == "on_tool_end":
                if name in _SUBAGENT_TOOLS:
                    yield _sse({"type": "subagent_status", "status": "done"})
                elif name in _TOOL_CARD_MAP:
                    raw_output = event["data"].get("output", "")
                    # output may be a ToolMessage or a string
                    if hasattr(raw_output, "content"):
                        raw_output = raw_output.content
                    if isinstance(raw_output, str):
                        try:
                            card_data = json.loads(raw_output)
                            yield _sse({
                                "type": "tool_result",
                                "tool": name,
                                "data": card_data,
                            })
                        except json.JSONDecodeError:
                            pass  # non-JSON tool output — ignore

    except Exception as exc:
        yield _sse({"type": "error", "message": str(exc)})
    finally:
        yield _sse({"type": "done"})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _extract_scenario(text: str) -> str:
    text = text.lower()
    if any(w in text for w in ["illness", "sick", "hospital", "medical"]):
        return "illness"
    if any(w in text for w in ["job", "fired", "unemployed", "retrench", "work"]):
        return "job_loss"
    if any(w in text for w in ["flood", "earthquake", "fire", "disaster", "nature"]):
        return "disaster"
    if any(w in text for w in ["war", "conflict", "unrest"]):
        return "war"
    return "job_loss"
