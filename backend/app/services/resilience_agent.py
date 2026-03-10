"""
ResilienceAgentService — builds a DeepAgents orchestrator with a ShockSimulator subagent.
Streams events using astream_events (v2) and normalises them to frontend-ready SSE dicts.
"""
import json
import logging
import os
from typing import AsyncGenerator, List

from deepagents import create_deep_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphInterrupt
from langgraph.types import Command

from app.tools.financial_tools import (
    display_vitals,
    show_resilience_score,
    trigger_emergency_alert,
    show_savings_plan,
    suggest_actions,
)
from app.tools.shock_tools import simulate_shock, stress_test_scenarios
from app.tools.educator_tools import generate_canvas, request_lesson_approval
from app.agents.shock_simulator import SHOCK_SUBAGENT_DEF
from app.agents.interactive_educator import INTERACTIVE_EDUCATOR_DEF
from app.agents.prompts.finsight_main import FINSIGHT_MAIN_SYSTEM_PROMPT


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


def _build_educator_model(gemini_model: ChatGoogleGenerativeAI) -> object:
    """Return Claude Sonnet for the educator if CLAUDE_API_KEY is set, else fall back to Gemini."""
    from app.core.config import Settings
    settings = Settings()
    api_key = settings.CLAUDE_API_KEY or os.environ.get("CLAUDE_API_KEY", "")
    model_name = settings.CLAUDE_MODEL or "claude-sonnet-4-6"
    if api_key:
        return ChatAnthropic(
            model=model_name,
            api_key=api_key,
            temperature=0.4,
            max_tokens=8192,
        )
    return gemini_model


def _build_agent(model: ChatGoogleGenerativeAI) -> object:
    """Build a DeepAgents orchestrator with ShockSimulator and InteractiveEducator subagents."""
    educator_model = _build_educator_model(model)

    # Absolute path to the project-local skills directory
    # resilience_agent.py lives at app/services/ → go up two levels to reach backend/skills/
    _skills_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "skills"))

    shock_def = {
        "name": SHOCK_SUBAGENT_DEF["name"],
        "description": SHOCK_SUBAGENT_DEF["description"],
        "system_prompt": SHOCK_SUBAGENT_DEF["system_prompt"],
        "model": model,
        "tools": [simulate_shock, stress_test_scenarios],
    }

    educator_def = {
        "name": INTERACTIVE_EDUCATOR_DEF["name"],
        "description": INTERACTIVE_EDUCATOR_DEF["description"],
        "system_prompt": INTERACTIVE_EDUCATOR_DEF["system_prompt"],
        "model": educator_model,  # Claude Sonnet 4.6 (or Gemini fallback)
        "tools": [generate_canvas],
        # Skills are NOT inherited by custom subagents — must be declared explicitly
        "skills": [os.path.join(_skills_dir, "frontend-design")],
    }

    return create_deep_agent(
        model=model,
        tools=[
            display_vitals,
            show_resilience_score,
            trigger_emergency_alert,
            show_savings_plan,
            suggest_actions,
            request_lesson_approval,   # HITL gate — must be called before educator
        ],
        subagents=[shock_def, educator_def],
        system_prompt=FINSIGHT_MAIN_SYSTEM_PROMPT,
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
    "stress_test_scenarios": "stress_test",
    "generate_canvas": "canvas",
}

# Tools that indicate subagent work (deepagents task tool)
_SUBAGENT_TOOLS = {"task", "shock_simulator", "interactive_educator"}

# Human-readable progress labels for ALL tools (root + subagent)
_TOOL_STEP_LABELS: dict = {
    "display_vitals":          "Reading vital signs…",
    "show_resilience_score":   "Calculating resilience score…",
    "trigger_emergency_alert": "Checking emergency signals…",
    "show_savings_plan":       "Building savings plan…",
    "suggest_actions":         "Generating suggested actions…",
    "simulate_shock":          "Running shock simulation…",
    "stress_test_scenarios":   "Stress-testing all scenarios…",
    "request_lesson_approval": "Preparing interactive lesson…",
    "generate_canvas":         "Rendering interactive lesson…",
    "task":                    "Delegating to specialist…",
}

# Human-readable progress labels for educator's internal tool calls
_EDUCATOR_STEP_LABELS: dict = {
    "write_file":     "Writing lesson content…",
    "edit_file":      "Refining lesson…",
    "read_file":      "Reviewing draft…",
    "generate_canvas": "Rendering interactive lesson…",
}


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
      {"type":"thinking","state":"start"|"stop"}
      {"type":"tool_call","tool":"display_vitals","state":"running"}
      {"type":"tool_call","tool":"display_vitals","state":"done"}
      {"type":"tool_result","tool":"display_vitals","data":{...}}
      {"type":"subagent_status","status":"running","scenario":"lesson:EPF"}
      {"type":"subagent_status","status":"done"}
      {"type":"subagent_step","step":"write_file","label":"Writing lesson content…"}
      {"type":"hitl_request","topic":"...","message":"..."}
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
    # recursion_limit raised from default 25 — orchestrator + subagents need more steps
    config = {"configurable": {"thread_id": user_id}, "recursion_limit": 100}

    emitted_any_text = False
    thinking_active = False
    _text_buf: list = []  # buffer text tokens per LLM pass to suppress pre-tool preamble
    try:
        async for event in agent.astream_events(
            {"messages": enriched},
            config=config,
            version="v2",
        ):
            event_type = event.get("event", "")
            name = event.get("name", "")

            # ---- LLM starts processing (emit "thinking" start) ----
            if event_type == "on_chat_model_start":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                if "tools:" not in checkpoint_ns:
                    _text_buf = []  # reset buffer for each new root-level LLM pass
                    if not thinking_active:
                        thinking_active = True
                        yield _sse({"type": "thinking", "state": "start"})

            # ---- streaming text tokens (buffer — flushed on LLM end) ----
            elif event_type == "on_chat_model_stream":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                if "tools:" not in checkpoint_ns:
                    chunk = event["data"].get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    _text_buf.append(block["text"])
                        elif isinstance(content, str) and content:
                            _text_buf.append(content)

            # ---- LLM finished a generation pass ----
            elif event_type == "on_chat_model_end":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                if "tools:" not in checkpoint_ns:
                    output = event["data"].get("output")
                    has_tool_calls = bool(
                        output and hasattr(output, "tool_calls") and output.tool_calls
                    )
                    if has_tool_calls:
                        # Tool-calling pass — discard buffered preamble text
                        _text_buf.clear()
                    else:
                        # Final response pass — flush buffered text
                        for token in _text_buf:
                            if token:
                                emitted_any_text = True
                                yield _sse({"type": "text", "content": token})
                        _text_buf.clear()
                        if thinking_active:
                            thinking_active = False
                            yield _sse({"type": "thinking", "state": "stop"})

            # ---- tool about to run ----
            elif event_type == "on_tool_start":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                is_in_subagent = "tools:" in checkpoint_ns

                if name in _SUBAGENT_TOOLS:
                    inp = event["data"].get("input", {})
                    inp_str = str(inp).lower()
                    if any(kw in inp_str for kw in (
                        "educator", "lesson", "teach", "topic:", "epf", "socso",
                        "ptptn", "bnpl", "explain", "interactive",
                    )):
                        topic = (inp.get("topic", "") if isinstance(inp, dict) else "") or inp_str[:80]
                        yield _sse({
                            "type": "subagent_status",
                            "status": "running",
                            "scenario": f"lesson:{topic}",
                        })
                    else:
                        scenario = (inp.get("scenario", "") if isinstance(inp, dict) else "") or _extract_scenario(inp_str)
                        yield _sse({
                            "type": "subagent_status",
                            "status": "running",
                            "scenario": scenario or "job_loss",
                        })
                elif is_in_subagent and name in _EDUCATOR_STEP_LABELS:
                    yield _sse({
                        "type": "subagent_step",
                        "step": name,
                        "label": _EDUCATOR_STEP_LABELS[name],
                    })
                elif name == "generate_canvas":
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})
                elif name in _TOOL_CARD_MAP and not is_in_subagent:
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})
                elif name == "request_lesson_approval":
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})

            # ---- tool finished ----
            elif event_type == "on_tool_end":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                is_in_subagent = "tools:" in checkpoint_ns

                if name in _SUBAGENT_TOOLS:
                    yield _sse({"type": "subagent_status", "status": "done"})

                elif name in _TOOL_CARD_MAP:
                    raw_output = event["data"].get("output", "")
                    if hasattr(raw_output, "content"):
                        raw_output = raw_output.content
                    if isinstance(raw_output, str):
                        try:
                            card_data = json.loads(raw_output)
                            if not is_in_subagent:
                                yield _sse({"type": "tool_call", "tool": name, "state": "done"})
                            yield _sse({
                                "type": "tool_result",
                                "tool": name,
                                "data": card_data,
                            })
                        except json.JSONDecodeError:
                            pass

        # ---- After stream completes, check for pending HITL interrupts ----
        # LangGraph v1.0+ no longer raises GraphInterrupt during astream_events.
        # Instead, the graph pauses and we must inspect state for pending interrupts.
        try:
            state = agent.get_state(config)
            if state and state.next:
                for task in state.tasks:
                    if hasattr(task, "interrupts") and task.interrupts:
                        payload = task.interrupts[0].value
                        if isinstance(payload, dict):
                            yield _sse({
                                "type": "hitl_request",
                                "topic":   payload.get("topic", "this topic"),
                                "message": payload.get("message",
                                    "The AI wants to open an interactive lesson. Approve?"),
                            })
                        break
        except Exception:
            pass  # state check is best-effort

    except GraphInterrupt as exc:
        # Legacy fallback — kept for compatibility with older LangGraph versions
        payload = exc.interrupts[0].value if exc.interrupts else {}
        yield _sse({
            "type": "hitl_request",
            "topic":   payload.get("topic", "this topic"),
            "message": payload.get("message", "The AI wants to open an interactive lesson. Approve?"),
        })
    except Exception as exc:
        yield _sse({"type": "error", "message": str(exc)})
    finally:
        yield _sse({"type": "done"})


async def resume_agent_response(
    approved: bool,
    reason: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Resume an agent run that was paused by a HITL interrupt.
    `approved=True`  → educator subagent runs normally.
    `approved=False` → main agent receives "REJECTED" and answers itself.
    """
    agent = _get_agent()
    config = {"configurable": {"thread_id": user_id}, "recursion_limit": 100}
    decision = {"approved": approved, "reason": reason or ("Approved" if approved else "Skipped")}

    _text_buf: list = []  # buffer text tokens per LLM pass to suppress pre-tool preamble
    try:
        async for event in agent.astream_events(
            Command(resume=decision),
            config=config,
            version="v2",
        ):
            event_type = event.get("event", "")
            name = event.get("name", "")
            meta = event.get("metadata", {})
            checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
            is_in_subagent = "tools:" in checkpoint_ns

            if event_type == "on_chat_model_start":
                if "tools:" not in checkpoint_ns:
                    _text_buf = []  # reset buffer for each new root-level LLM pass

            elif event_type == "on_chat_model_stream":
                if "tools:" not in checkpoint_ns:
                    chunk = event["data"].get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    _text_buf.append(block["text"])
                        elif isinstance(content, str) and content:
                            _text_buf.append(content)

            elif event_type == "on_chat_model_end":
                if "tools:" not in checkpoint_ns:
                    output = event["data"].get("output")
                    has_tool_calls = bool(
                        output and hasattr(output, "tool_calls") and output.tool_calls
                    )
                    if has_tool_calls:
                        _text_buf.clear()
                    else:
                        for token in _text_buf:
                            if token:
                                yield _sse({"type": "text", "content": token})
                        _text_buf.clear()

            elif event_type == "on_tool_start":
                if name in _SUBAGENT_TOOLS:
                    inp = event["data"].get("input", {})
                    inp_str = str(inp).lower()
                    if any(kw in inp_str for kw in (
                        "educator", "lesson", "teach", "topic:", "epf", "socso",
                        "ptptn", "bnpl", "explain", "interactive",
                    )):
                        topic = (inp.get("topic", "") if isinstance(inp, dict) else "") or inp_str[:80]
                        yield _sse({"type": "subagent_status", "status": "running", "scenario": f"lesson:{topic}"})
                    else:
                        scenario = (inp.get("scenario", "") if isinstance(inp, dict) else "") or _extract_scenario(inp_str)
                        yield _sse({"type": "subagent_status", "status": "running", "scenario": scenario or "job_loss"})
                elif is_in_subagent and name in _EDUCATOR_STEP_LABELS:
                    yield _sse({"type": "subagent_step", "step": name, "label": _EDUCATOR_STEP_LABELS[name]})
                elif name == "generate_canvas":
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})
                elif name in _TOOL_CARD_MAP and not is_in_subagent:
                    yield _sse({"type": "tool_call", "tool": name, "state": "running"})

            elif event_type == "on_tool_end":
                if name in _SUBAGENT_TOOLS:
                    yield _sse({"type": "subagent_status", "status": "done"})
                elif name in _TOOL_CARD_MAP:
                    raw_output = event["data"].get("output", "")
                    if hasattr(raw_output, "content"):
                        raw_output = raw_output.content
                    if isinstance(raw_output, str):
                        try:
                            card_data = json.loads(raw_output)
                            if not is_in_subagent:
                                yield _sse({"type": "tool_call", "tool": name, "state": "done"})
                            yield _sse({"type": "tool_result", "tool": name, "data": card_data})
                        except json.JSONDecodeError:
                            pass

        # ---- Check for pending HITL interrupts after resume stream completes ----
        try:
            state = agent.get_state(config)
            if state and state.next:
                for task in state.tasks:
                    if hasattr(task, "interrupts") and task.interrupts:
                        payload = task.interrupts[0].value
                        if isinstance(payload, dict):
                            yield _sse({
                                "type": "hitl_request",
                                "topic":   payload.get("topic", "this topic"),
                                "message": payload.get("message", "Approval required."),
                            })
                        break
        except Exception:
            pass

    except GraphInterrupt as exc:
        # Legacy fallback for resume path
        payload = exc.interrupts[0].value if exc.interrupts else {}
        yield _sse({
            "type": "hitl_request",
            "topic":   payload.get("topic", "this topic"),
            "message": payload.get("message", "Approval required."),
        })
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
