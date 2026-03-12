"""
OverviewAgentService — stateless daily financial health scan.

<<<<<<< Updated upstream
Calls financial tools directly in a fixed sequence (no LLM agent loop needed):
  1. display_vitals
  2. show_resilience_score
  3. trigger_emergency_alert  (only if score < 40)
  4. show_savings_plan
  5. show_analysis            (LLM-generated bullet insights)
=======
Architecture: direct tool invocations (no LangGraph agent loop).
This is intentional — the LLM-driven agent is unreliable for a fixed
diagnostic sequence because the LLM may choose not to call tools.
Instead we call each tool directly in order:
  1. display_vitals
  2. show_resilience_score
  3. trigger_emergency_alert  (only when score < 40)
  4. show_savings_plan
  5. show_analysis (LLM-authored bullet insights)
>>>>>>> Stashed changes
"""
import json
import logging
import os
from typing import AsyncGenerator

from langchain_google_genai import ChatGoogleGenerativeAI
<<<<<<< Updated upstream
from langchain_core.messages import HumanMessage, SystemMessage
=======
from langchain_core.messages import SystemMessage, HumanMessage
>>>>>>> Stashed changes

from app.tools.financial_tools import (
    display_vitals,
    show_resilience_score,
    trigger_emergency_alert,
    show_savings_plan,
)
<<<<<<< Updated upstream

logger = logging.getLogger(__name__)

=======
from app.tools.data_source import FinancialDataSource

logger = logging.getLogger(__name__)

_ds = FinancialDataSource()

_STEP_LABELS = {
    "display_vitals":          "Reading vital signs…",
    "show_resilience_score":   "Calculating resilience score…",
    "trigger_emergency_alert": "Checking emergency signals…",
    "show_savings_plan":       "Building savings plan…",
    "show_analysis":           "Writing AI insights…",
}

>>>>>>> Stashed changes

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _get_llm() -> ChatGoogleGenerativeAI:
<<<<<<< Updated upstream
    from app.core.config import Settings
    settings = Settings()
    api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    model_name = getattr(settings, "GEMINI_MODEL", None) or "gemini-1.5-flash"
=======
    api_key    = os.environ.get("GEMINI_API_KEY", "")
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    if not api_key:
        try:
            from app.core.config import get_settings
            s = get_settings()
            api_key    = s.GEMINI_API_KEY
            model_name = s.GEMINI_MODEL or model_name
        except Exception:
            pass
>>>>>>> Stashed changes
    if ":" in model_name:
        model_name = model_name.split(":", 1)[1]
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
<<<<<<< Updated upstream
        temperature=0.2,
    )


async def _tool_result(tool_name: str, result_json: str) -> tuple[dict, None]:
    """Parse JSON from a tool result and return (card_data, None)."""
    return json.loads(result_json), None
=======
        temperature=0.15,
    )


async def _invoke_tool(tool_fn, args: dict) -> dict | None:
    """Invoke a LangChain tool and return the parsed JSON dict, or None on failure."""
    try:
        raw = await tool_fn.ainvoke(args)
        if hasattr(raw, "content"):
            raw = raw.content
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        logger.exception("Tool %s failed", tool_fn.name)
        return None
>>>>>>> Stashed changes


# ---------------------------------------------------------------------------
# Main streaming function — calls tools directly, no LangGraph agent loop
# ---------------------------------------------------------------------------

async def stream_overview_response(user_id: str) -> AsyncGenerator[str, None]:
    """
<<<<<<< Updated upstream
    Runs the overview scan for `user_id` by calling financial tools directly,
    then uses the LLM to generate per-section bullet insights.

    SSE events emitted:
      {"type": "step",        "tool": "display_vitals", "label": "..."}
      {"type": "tool_call",   "tool": "display_vitals", "state": "running"|"done"}
      {"type": "tool_result", "tool": "display_vitals", "data": {...}}
      {"type": "error",       "message": "..."}
      {"type": "done"}
    """
    try:
        # ── 1. Vitals ────────────────────────────────────────────────────────
        yield _sse({"type": "step",      "tool": "display_vitals", "label": "Reading vital signs…"})
        yield _sse({"type": "tool_call", "tool": "display_vitals", "state": "running"})
        vitals_json = await display_vitals.ainvoke({"user_id": user_id})
        vitals = json.loads(vitals_json)
        yield _sse({"type": "tool_call",   "tool": "display_vitals", "state": "done"})
        yield _sse({"type": "tool_result", "tool": "display_vitals", "data": vitals})

        # ── 2. Resilience score ──────────────────────────────────────────────
        yield _sse({"type": "step",      "tool": "show_resilience_score", "label": "Calculating resilience score…"})
        yield _sse({"type": "tool_call", "tool": "show_resilience_score", "state": "running"})
        score_json = await show_resilience_score.ainvoke({"user_id": user_id})
        score = json.loads(score_json)
        yield _sse({"type": "tool_call",   "tool": "show_resilience_score", "state": "done"})
        yield _sse({"type": "tool_result", "tool": "show_resilience_score", "data": score})

        # ── 3. Emergency alert (only if score critical) ───────────────────────
        alert = None
        if score.get("score", 100) < 40:
            yield _sse({"type": "step",      "tool": "trigger_emergency_alert", "label": "Checking emergency signals…"})
            yield _sse({"type": "tool_call", "tool": "trigger_emergency_alert", "state": "running"})
            alert_json = await trigger_emergency_alert.ainvoke({"user_id": user_id})
            alert = json.loads(alert_json)
            yield _sse({"type": "tool_call",   "tool": "trigger_emergency_alert", "state": "done"})
            yield _sse({"type": "tool_result", "tool": "trigger_emergency_alert", "data": alert})

        # ── 4. Savings plan ──────────────────────────────────────────────────
        yield _sse({"type": "step",      "tool": "show_savings_plan", "label": "Building savings plan…"})
        yield _sse({"type": "tool_call", "tool": "show_savings_plan", "state": "running"})
        plan_json = await show_savings_plan.ainvoke({"user_id": user_id})
        plan = json.loads(plan_json)
        yield _sse({"type": "tool_call",   "tool": "show_savings_plan", "state": "done"})
        yield _sse({"type": "tool_result", "tool": "show_savings_plan", "data": plan})

        # ── 5. AI analysis bullets (LLM direct call) ─────────────────────────
        yield _sse({"type": "step", "tool": "show_analysis", "label": "Writing insights…"})
        try:
            llm = _get_llm()
            context = (
                f"Vitals: buffer={vitals.get('buffer_months')}mo ({vitals.get('buffer_status')}), "
                f"debt={vitals.get('debt_pressure')}% ({vitals.get('debt_status')}), "
                f"cashflow=RM{vitals.get('cashflow_monthly')} ({vitals.get('cashflow_status')}), "
                f"habits={vitals.get('habit_score')}/100 ({vitals.get('habit_status')}), "
                f"income=RM{vitals.get('monthly_income')}, expenses=RM{vitals.get('total_expenses')}. "
                f"Score: {score.get('score')}/100 ({score.get('tier')}). "
                f"Plan gap: RM{plan.get('gap', 0)}, surplus: RM{plan.get('monthly_surplus', 0)}/mo."
            )
            prompt = f"""You are a Malaysian personal finance advisor. Based on this data:
{context}

Return ONLY a JSON object with exactly these keys, each containing a list of exactly 2 short strings (≤20 words each, plain text, no bullet symbols):
{{
  "overall_standing": ["...", "..."],
  "emergency_buffer": ["...", "..."],
  "debt_load": ["...", "..."],
  "monthly_cash_flow": ["...", "..."],
  "spending_habits": ["...", "..."],
  "priority_action": ["...", "..."]
}}
Be direct, use RM figures. No disclaimers."""

            response = await llm.ainvoke([HumanMessage(content=prompt)])
            content = response.content.strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            bullets = json.loads(content.strip())
            analysis_json = await show_analysis.ainvoke({
                "overall_standing":  bullets.get("overall_standing",  ["", ""]),
                "emergency_buffer":  bullets.get("emergency_buffer",  ["", ""]),
                "debt_load":         bullets.get("debt_load",         ["", ""]),
                "monthly_cash_flow": bullets.get("monthly_cash_flow", ["", ""]),
                "spending_habits":   bullets.get("spending_habits",   ["", ""]),
                "priority_action":   bullets.get("priority_action",   ["", ""]),
            })
            analysis = json.loads(analysis_json)
            yield _sse({"type": "tool_result", "tool": "show_analysis", "data": analysis})
        except Exception as analysis_exc:
            logger.warning("Overview analysis LLM call failed: %s", analysis_exc)
            # Non-fatal — vitals/score/plan already sent successfully

    except Exception as exc:
        logger.exception("Overview scan error for user %s", user_id)
=======
    Runs the financial health overview for `user_id` and yields SSE strings.

    Events emitted:
      {"type": "step",        "tool": "<name>", "label": "…"}
      {"type": "tool_result", "tool": "<name>", "data": {…}}
      {"type": "error",       "message": "…"}
      {"type": "done"}
    """
    try:
        # ── 1. Vitals ─────────────────────────────────────────────────────
        yield _sse({"type": "step", "tool": "display_vitals",
                    "label": _STEP_LABELS["display_vitals"]})
        vitals_data = await _invoke_tool(display_vitals, {"user_id": user_id})
        if vitals_data:
            yield _sse({"type": "tool_result", "tool": "display_vitals", "data": vitals_data})

        # ── 2. Score ──────────────────────────────────────────────────────
        yield _sse({"type": "step", "tool": "show_resilience_score",
                    "label": _STEP_LABELS["show_resilience_score"]})
        score_data = await _invoke_tool(show_resilience_score, {"user_id": user_id})
        if score_data:
            yield _sse({"type": "tool_result", "tool": "show_resilience_score", "data": score_data})

        # ── 3. Emergency alert (critical only) ────────────────────────────
        score_val = score_data.get("score", 100) if score_data else 100
        if score_val < 40:
            yield _sse({"type": "step", "tool": "trigger_emergency_alert",
                        "label": _STEP_LABELS["trigger_emergency_alert"]})
            alert_data = await _invoke_tool(trigger_emergency_alert, {"user_id": user_id})
            if alert_data:
                yield _sse({"type": "tool_result", "tool": "trigger_emergency_alert", "data": alert_data})

        # ── 4. Savings plan ───────────────────────────────────────────────
        yield _sse({"type": "step", "tool": "show_savings_plan",
                    "label": _STEP_LABELS["show_savings_plan"]})
        plan_data = await _invoke_tool(show_savings_plan, {"user_id": user_id})
        if plan_data:
            yield _sse({"type": "tool_result", "tool": "show_savings_plan", "data": plan_data})

        # ── 5. AI-authored analysis bullets ──────────────────────────────
        yield _sse({"type": "step", "tool": "show_analysis",
                    "label": _STEP_LABELS["show_analysis"]})
        analysis_data = await _generate_analysis(user_id, vitals_data, score_data, plan_data)
        if analysis_data:
            yield _sse({"type": "tool_result", "tool": "show_analysis", "data": analysis_data})

    except Exception as exc:
        logger.exception("Overview stream error for user %s", user_id)
>>>>>>> Stashed changes
        yield _sse({"type": "error", "message": str(exc)})
    finally:
        yield _sse({"type": "done"})


async def _generate_analysis(
    user_id: str,
    vitals: dict | None,
    score: dict | None,
    plan: dict | None,
) -> dict | None:
    """
    Calls the LLM directly to generate structured bullet insights.
    Returns a dict matching the `show_analysis` tool schema, or None on failure.
    """
    try:
        profile = await _ds.get_profile(user_id)

        context = (
            f"Monthly income: RM{profile.monthly_income:.0f}\n"
            f"Fixed expenses: RM{profile.fixed_expenses:.0f}\n"
            f"Flexible expenses: RM{profile.flexible_expenses:.0f}\n"
            f"Monthly surplus: RM{profile.monthly_surplus:.0f}\n"
            f"BNPL debt (90 days): RM{profile.bnpl_debt:.0f}\n"
            f"Savings balance: RM{profile.savings_balance:.0f}\n"
            f"Emergency fund: {profile.emergency_fund_months:.1f} months\n"
            f"Resilience score: {score.get('score', '?') if score else '?'}/100 "
            f"({score.get('tier', '') if score else ''})\n"
        )

        prompt = (
            "You are a concise financial advisor. Given this user's financial data, "
            "produce a JSON object ONLY (no markdown, no explanation) with exactly these keys, "
            "each containing a list of exactly 2 short bullet strings (max 20 words each):\n"
            "overall_standing, emergency_buffer, debt_load, monthly_cash_flow, "
            "spending_habits, priority_action\n\n"
            f"Financial data:\n{context}\n\n"
            "Respond with valid JSON only."
        )

        llm = _get_llm()
        response = await llm.ainvoke([
            SystemMessage(content="You output only valid JSON. No markdown fences."),
            HumanMessage(content=prompt),
        ])

        raw = response.content if hasattr(response, "content") else str(response)
        # Strip markdown code fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip().rstrip("```").strip()

        parsed = json.loads(raw)
        parsed["card"] = "analysis"
        return parsed

    except Exception:
        logger.exception("Analysis LLM call failed for user %s", user_id)
        # Return a minimal fallback so the card still appears
        return {
            "card": "analysis",
            "overall_standing": ["Review your spending to improve financial health.", "Focus on reducing BNPL usage first."],
            "emergency_buffer": ["Build at least 3 months of expenses as a buffer.", "Set up an automatic savings transfer each month."],
            "debt_load": ["Prioritise clearing BNPL debts quickly.", "Avoid new BNPL commitments until debts are cleared."],
            "monthly_cash_flow": ["Track daily spending to stay within budget.", "Small cuts in flexible spending add up fast."],
            "spending_habits": ["Review recurring subscriptions for savings.", "A spending diary helps identify waste."],
            "priority_action": ["Open a dedicated emergency savings account today.", "Target 10% of income for automatic savings."],
        }

