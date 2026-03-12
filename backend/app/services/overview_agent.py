"""
OverviewAgentService — stateless single-shot daily financial health scan.

Calls financial tools directly in a fixed sequence (no LLM agent loop needed):
  1. display_vitals
  2. show_resilience_score
  3. trigger_emergency_alert  (only if score < 40)
  4. show_savings_plan
  5. show_analysis            (LLM-generated bullet insights)
"""
import json
import logging
import os
from typing import AsyncGenerator

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.tools.financial_tools import (
    display_vitals,
    show_resilience_score,
    trigger_emergency_alert,
    show_savings_plan,
    show_analysis,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _get_llm() -> ChatGoogleGenerativeAI:
    from app.core.config import Settings
    settings = Settings()
    api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    model_name = getattr(settings, "GEMINI_MODEL", None) or "gemini-1.5-flash"
    if ":" in model_name:
        model_name = model_name.split(":", 1)[1]
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.2,
    )


async def _tool_result(tool_name: str, result_json: str) -> tuple[dict, None]:
    """Parse JSON from a tool result and return (card_data, None)."""
    return json.loads(result_json), None


# ---------------------------------------------------------------------------
# Main streaming function — calls tools directly, no LangGraph agent loop
# ---------------------------------------------------------------------------

async def stream_overview_response(user_id: str) -> AsyncGenerator[str, None]:
    """
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
        yield _sse({"type": "error", "message": str(exc)})
    finally:
        yield _sse({"type": "done"})
