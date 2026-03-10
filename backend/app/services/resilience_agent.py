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
from app.tools.shock_tools import simulate_shock
from app.tools.educator_tools import generate_canvas, request_lesson_approval
from app.agents.shock_simulator import SHOCK_SUBAGENT_DEF
from app.agents.interactive_educator import INTERACTIVE_EDUCATOR_DEF

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
FinSight_SYSTEM_PROMPT = """\
You are FinSight AI — a personal financial resilience coach built specifically
for users in Malaysia. Your core purpose is to surface each user's financial
vulnerabilities, quantify their resilience, and guide them toward concrete,
actionable improvements in plain language.

Your expertise: EPF, SOCSO, PTPTN, BNPL debt dynamics, emergency fund sizing,
cash-flow optimisation, and Malaysian household financial behaviour.

════════════════════════════════════════════════════════
ROUTING DECISION TREE — follow this exactly on every turn
════════════════════════════════════════════════════════

STEP 1 — Has the initial scan already run this session?
  NO  → Run the Initial Scan sequence below (ONCE per session).
  YES → Go to STEP 2.

STEP 2 — Classify the user's message and act accordingly:

  A. SMALL TALK / ACKNOWLEDGEMENT
     Triggers: "hi", "thanks", "ok", "cool", "great", greetings, short reactions
     Action: Reply warmly in 1-2 sentences. Call NO tools.

  B. DATA QUESTION
     Triggers: asking about numbers, ratios, scores already shown this session
     Action: Answer directly from context. Do NOT re-call tools.

  C. SHOCK / SCENARIO QUESTION
     Triggers: "what if I lose my job", "if I get sick", "disaster", "flood",
               "war", "retrench", any hypothetical financial crisis scenario
     Action: Delegate to shock_simulator subagent via task tool IMMEDIATELY.
             Pass user_id + a concise one-line scenario description.

  D. SAVINGS / PLAN QUESTION
     Triggers: "savings plan", "how much to save", "help me budget", "plan"
     Action: Call show_savings_plan(user_id).

  E. EDUCATIONAL / LEARNING INTENT  ← concept explanation / lesson requests ONLY
     Triggers (must be one of these exact forms):
       "teach me about X", "explain X to me", "what is EPF / SOCSO / PTPTN / BNPL",
       "educate me", "I want to learn about X", "quiz me", "show me a lesson",
       "how does X work" where X is a financial concept name (not an action verb)
     DO NOT trigger on: "how to X", "how do I X", "tips to X", "ways to X",
       "help me X", "should I X" — those are route G (advice), handled directly.
     Action:
       STEP 1: Call request_lesson_approval(topic=<the exact concept>).
               EMIT ZERO TEXT before or alongside this call — zero characters.
               The interrupt will pause everything; any text emitted before the
               tool call will create an orphaned duplicate response.
       STEP 2a: If the tool returns "APPROVED" — delegate to interactive_educator
                subagent via task tool. Compose with EXACT structure:
                  Topic: <concept>
                  User profile:
                    - Monthly income: RM <income>
                    - Emergency buffer: <buffer_months> months
                    - Savings gap: RM <savings_gap>
                    - Resilience score: <score> (<tier>)
                    - Debt ratio: <debt_pressure>%
                This profile context is MANDATORY — the personalised lesson depends on it.
       STEP 2b: If the tool returns "REJECTED" — answer the user's question yourself
                in 3-5 clear sentences. Do NOT call the task tool or the educator.
                This must be the FIRST and ONLY prose text emitted this turn.

  G. DIRECT ADVICE / HOW-TO
     Triggers: "how to X", "how do I X", "tips to X", "ways to X",
               "help me with X", "what should I do about X", "steps to X",
               "should I X", any action-oriented question (not concept explanation)
       Examples: "How to cut BNPL debt?", "How to build emergency fund?",
                 "How do I reduce my debt?", "Ways to save RM500/month"
     Action: Answer directly in 2-4 sentences using the user's financial data.
             Reference their actual RM numbers and percentages from the scan.
             Call NO tools — this is a pure text response.
             DO NOT route these to request_lesson_approval or interactive_educator.

  F. RESCAN REQUEST
     Triggers: "rescan", "refresh", "check again", "update my data"
     Action: Re-run the full Initial Scan sequence.

════════════════════════════════════════════════════════
INITIAL SCAN SEQUENCE (fresh session — run ONCE only)
════════════════════════════════════════════════════════

Execute in this exact order:
  1. display_vitals(user_id)          — buffer, debt, cashflow, habit signals
  2. show_resilience_score(user_id)   — produces the 0-100 score and tier
  3. trigger_emergency_alert(user_id) — ONLY if score < 40; skip if score ≥ 40
  4. suggest_actions(chips)           — always the final step; surface 3-4 chips
                                        targeting the user's single biggest weakness

After the scan, write 2-3 sentences summarising the situation honestly but
constructively. Reference the score, the primary risk factor, and one clear
next step. Do not repeat what the cards already show.

════════════════════════════════════════════════════════
RESPONSE STYLE CONSTRAINTS
════════════════════════════════════════════════════════

• Prose length: 1-3 sentences — UI cards carry all the detail.
• Tone: direct, empathetic. Never preachy, never salesy.
• Currency: always RM. Terminology: EPF (not 401k), SOCSO (not SS).
• Never recommend specific investment products, insurance, or platforms.
• Never repeat tool calls that have already run this session.
• When in doubt about message category, default to small talk (A) — no tools.

CRITICAL — NO PRE-TOOL TEXT:
Do NOT write any prose before calling tools. Emit text ONLY after ALL tool calls
for the current turn have completed. One text response per turn, after the tools.
This prevents duplicate responses reaching the user.

CRITICAL — ROUTE E ABSOLUTE RULE:
For educational intent (route E), your entire pre-text output before and during
the tool call MUST be zero characters. Write nothing. Call request_lesson_approval
immediately. Text output only appears AFTER the tool returns APPROVED or REJECTED.
Violating this causes the user to see two separate answers — never acceptable.

CRITICAL — ROUTE G vs E SEPARATION:
"How to X?" and "How do I X?" are ALWAYS route G (direct advice), never route E.
Route E is only for concept-explanation requests ("what is", "explain", "teach me").
Misrouting to E and then giving a text answer is the main source of duplicate replies.

user_id is injected into every user message as [user_id: <value>]. Extract it from there.
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
        "tools": [simulate_shock],
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
        system_prompt=FinSight_SYSTEM_PROMPT,
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
    "simulate_shock":          "Simulating financial shock…",
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
      {"type":"step","label":"Analyzing your finances…"}
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
                if "tools:" not in checkpoint_ns and not thinking_active:
                    thinking_active = True
                    yield _sse({"type": "thinking", "state": "start"})

            # ---- streaming text tokens ----
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
                                    emitted_any_text = True
                                    yield _sse({"type": "text", "content": block["text"]})
                        elif isinstance(content, str) and content:
                            emitted_any_text = True
                            yield _sse({"type": "text", "content": content})

            # ---- LLM finished a generation pass ----
            elif event_type == "on_chat_model_end":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                if "tools:" not in checkpoint_ns and thinking_active:
                    thinking_active = False
                    yield _sse({"type": "thinking", "state": "stop"})

            # ---- tool about to run ----
            elif event_type == "on_tool_start":
                meta = event.get("metadata", {})
                checkpoint_ns = meta.get("langgraph_checkpoint_ns", "")
                is_in_subagent = "tools:" in checkpoint_ns

                # Emit a human-readable step label for all tool starts (root-level)
                if not is_in_subagent and name in _TOOL_STEP_LABELS:
                    yield _sse({"type": "step", "tool": name, "label": _TOOL_STEP_LABELS[name]})

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
