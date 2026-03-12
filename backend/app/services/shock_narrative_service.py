"""
shock_narrative_service.py — Phase 5

Generates a personalized, Malaysia-specific financial impact narrative using Gemini
with full context injection (not template substitution).

Key improvements over a generic prompt:
  - Full spending profile injected as structured context
  - Malaysian safety nets explicitly modeled: EPF, SOCSO EIS, hospital cost tiers
  - Spending trends included: "your food costs are rising RM40/month"
  - SOCSO coverage likelihood inferred from employment stability indicator
  - RM amounts are the user's real numbers — Gemini reasons about THEIR situation
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Static Malaysian financial context (injected into every prompt) ──────────
_MY_CONTEXT = """\
MALAYSIA-SPECIFIC FINANCIAL CONTEXT (always accurate — apply where relevant):
- EPF: Malaysian employees auto-contribute 11% of salary to the Employees Provident Fund.
  This is a RETIREMENT fund. Early withdrawal has tax penalties and long-term cost.
  Do NOT recommend EPF withdrawal for short-term emergencies.
- SOCSO EIS (Employment Insurance Scheme): Covers EMPLOYED workers only (not self-employed
  or gig workers). Pays ~80% of last drawn salary for up to 6 months upon retrenchment.
  Does NOT cover voluntary resignation or general illness.
- Government hospitals: RM 1–5/day for Malaysian citizens. Private hospitals: RM 400–2,000/day.
  Private medical bills are the #1 cause of emergency fund depletion in Malaysia.
- BNM OPR: Emergency fund in a fixed deposit earns ~3.0% p.a. — meaningfully better than a
  savings account. Mention this if relevant to encourage fund-building.
- MYR sensitivity: Ringgit weakens during global crises (e.g. hit 4.75/USD in 2024).
  This raises import costs — medicine, electronics, fuel — even for domestic earners.
- Sabah/Sarawak: Materially higher flood risk. Lower average cost of living than KL."""

# ─── Shock-specific Malaysian context ────────────────────────────────────────
_SHOCK_CONTEXT: dict[str, str] = {
    "illness": (
        "ILLNESS: Government hospital costs RM 1–5/day for Malaysian citizens. "
        "Private hospitalisation is RM 400–2,000/day and is NOT covered by SOCSO. "
        "SOCSO Invalidity Scheme only covers permanent disability, not general illness. "
        "Recommend choosing government hospital if cost is a concern."
    ),
    "job_loss": (
        "JOB LOSS: SOCSO EIS pays 80% of last salary for up to 6 months — only for retrenched "
        "employees, NOT for voluntary resignation or self-employed workers. "
        "Infer coverage likelihood from their income pattern: stable monthly salary → likely "
        "employee with SOCSO; irregular income → likely self-employed, no SOCSO."
    ),
    "disaster": (
        "DISASTER: Malaysia's NADMA provides basic relief (food, temporary shelter), but "
        "property repair and contents replacement are borne by the homeowner. "
        "Contents insurance is uncommon in Malaysia. "
        "If the user is in Sabah or Sarawak, note the higher flood risk."
    ),
    "war": (
        "WAR/INSTABILITY: MYR typically weakens during geopolitical stress. "
        "Imported goods (electronics, medicine, fuel) become significantly more expensive. "
        "However, rice, chicken, cooking oil are government price-controlled — "
        "these staples remain affordable even during instability."
    ),
}


def _build_prompt(simulation: dict, profile: dict, shock_type: str, regional_risks: list | None = None) -> str:
    projections  = simulation["monthly_projected"]
    trends       = simulation.get("spending_trends", {})
    top_cat      = simulation["top_category_affected"]
    total_impact = simulation["grand_total_impact"]
    one_time     = simulation["one_time_cost_estimate"]
    months_broke = simulation.get("months_until_broke")
    indicators   = profile.get("indicators", [])
    regional_risks = regional_risks or []

    # Plain-English spending trend description (top 3 by magnitude)
    trend_lines = []
    for cat, slope in sorted(trends.items(), key=lambda kv: abs(kv[1]), reverse=True)[:3]:
        if abs(slope) > 5:
            direction = "rising" if slope > 0 else "falling"
            trend_lines.append(f"  - {cat}: {direction} RM{abs(slope):.0f}/month")
    trend_text = "\n".join(trend_lines) if trend_lines else "  - Spending appears stable"

    # Month-by-month impact table
    month_lines = "\n".join(
        f"  Month {p['month']}: income RM{p['income']:.0f}, "
        f"expenses RM{p['expense']:.0f}, "
        f"{'deficit' if p['deficit'] < 0 else 'surplus'} RM{abs(p['deficit']):.0f}"
        for p in projections
    )

    indicator_text = (
        ", ".join(i["name"].replace("_", " ") for i in indicators)
        or "none detected"
    )

    runway_text = (
        f"current emergency fund covers {months_broke} months of deficit"
        if months_broke
        else "no emergency fund yet — zero runway"
    )

    shock_label = shock_type.replace("_", " ")
    # Suggest saving ~50% of monthly surplus — realistic, not the whole amount.
    # Floor at RM50 (even tight budgets can start small), ceiling at RM1000.
    raw_surplus = profile.get("surplus", 100)
    surplus_save = round(min(max(raw_surplus * 0.5, 50), 1000) / 10) * 10  # round to nearest RM10

    return f"""\
You are a personal finance advisor based in Malaysia. Write an empathetic \
financial impact story for a user facing a {shock_label} scenario. \
Use second person ("you"). Be specific — use their real RM numbers throughout.

USER FINANCIAL PROFILE:
- Monthly income: RM{profile['avg_monthly_income']:.0f}
- Monthly expenses: RM{profile['avg_monthly_expense']:.0f}
- Monthly surplus: RM{profile['surplus']:.0f}
- Category most under pressure in this shock: {top_cat}
- Active risk indicators: {indicator_text}

SPENDING TRENDS (recent months):
{trend_text}

SHOCK PROJECTIONS — {shock_label.upper()} for {simulation['duration_months']} months:
{month_lines}
  One-time cost estimate: RM{one_time:.0f}
  Total financial impact: RM{total_impact:.0f}
  Emergency fund runway: {runway_text}

REGIONAL RISK EVENTS (real recent events in Malaysia — reference where relevant):
{chr(10).join(f'  - {r["event_title"]} (severity {r["severity"]}/5)' for r in regional_risks[:3]) if regional_risks else '  - No specific regional events on record'}

{_MY_CONTEXT}

{_SHOCK_CONTEXT.get(shock_type, '')}

WRITE EXACTLY this format — plain text only, no bullet points, no markdown:

PARAGRAPH 1 (2–3 sentences about month 1): What does month 1 feel like financially? \
Use their exact RM income and expense numbers. Reference {top_cat} specifically.

PARAGRAPH 2 (2–3 sentences about month 3 outlook): If nothing changes, what does month 3 look \
like? Use their real RM numbers. Mention whether SOCSO or EPF is relevant to their situation.

PARAGRAPH 3 (1–2 sentences — one action TODAY): The single most impactful thing they can do \
TODAY. Give a specific RM figure based on their surplus (around RM{surplus_save:.0f}).

Then on a NEW LINE, output ONLY this JSON — nothing else after it:
{{"action_today": "<one specific, actionable sentence with a RM figure>"}}

Maximum 160 words total across all three paragraphs.\
"""


async def generate_shock_narrative(
    simulation: dict,
    profile: dict,
    shock_type: str,
    regional_risks: list | None = None,
) -> dict:
    """
    Generates a personalized narrative and action_today for the shock scenario.
    Falls back gracefully if Gemini is unavailable or returns malformed output.
    """
    raw_surplus = profile.get("surplus", 100)
    fallback_amount = round(min(max(raw_surplus * 0.5, 50), 1000) / 10) * 10
    fallback_action = (
        f"Set aside RM{fallback_amount:.0f} into a dedicated emergency savings account today."
    )

    if not settings.GEMINI_API_KEY:
        return {
            "narrative": (
                f"A {shock_type.replace('_', ' ')} scenario would create significant "
                "financial pressure based on your current spending profile."
            ),
            "action_today": fallback_action,
        }

    prompt = _build_prompt(simulation, profile, shock_type, regional_risks or [])
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("models/gemini-2.5-flash-lite")
    loop = asyncio.get_running_loop()

    try:
        response = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        full_text = response.text.strip()
        logger.debug("Gemini raw response for %s: %.400s", shock_type, full_text)

        # Strip markdown code fences Gemini 2.5 Flash often adds
        cleaned = full_text.replace("```json", "").replace("```", "").strip()

        narrative = cleaned
        action_today = fallback_action

        # Robust extraction: regex finds {"action_today": "<any text>"}
        # This is immune to `}` inside the value or trailing Gemini text.
        m = re.search(r'\{\s*"action_today"\s*:\s*"([^"]+)"\s*\}', cleaned)
        if m:
            action_today = m.group(1)
            # narrative = everything before the JSON block
            json_start = cleaned.rfind('{', 0, m.start() + 1)
            narrative = cleaned[:json_start].strip() if json_start >= 0 else cleaned
        elif '{"action_today"' in cleaned:
            # Fallback: try the old splitting approach
            parts = cleaned.rsplit('{"action_today"', 1)
            narrative = parts[0].strip()
            raw_json = '{"action_today"' + parts[1]
            brace_end = raw_json.find("}") + 1
            if brace_end > 0:
                try:
                    parsed = json.loads(raw_json[:brace_end])
                    action_today = parsed.get("action_today", fallback_action)
                except Exception as parse_exc:
                    logger.warning("JSON parse fallback failed for %s: %s | raw_json=%.200s", shock_type, parse_exc, raw_json)

        return {"narrative": narrative, "action_today": action_today}

    except Exception as exc:
        logger.exception("Gemini narrative generation failed for shock_type=%s: %s", shock_type, exc)
        return {
            "narrative": (
                f"A {shock_type.replace('_', ' ')} event would create a projected "
                f"RM{simulation['grand_total_impact']:.0f} impact on your finances "
                f"over {simulation['duration_months']} months."
            ),
            "action_today": fallback_action,
        }