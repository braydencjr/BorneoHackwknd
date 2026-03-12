"""
shock_narrative_service.py — Phase 5 (v2: structured analysis)

Returns a structured JSON analysis (not prose narrative) per shock scenario.
Uses Gemini with Google Search grounding for real-time 2024-2025 ASEAN context.

Output schema:
  asean_incidents:        list[{name, cost_rm_range, year}]
  contingency_costs:      list[{item, min_rm, max_rm}]
  total_contingency_min:  int
  total_contingency_max:  int
  withstand_verdict:      "YES" | "BORDERLINE" | "NO"
  withstand_summary:      str  (≤ 35 words, real RM numbers)
  months_can_survive:     float | None
  action_today:           str  (≤ 15 words, specific + RM figure)
  narrative:              ""   (kept for backward-compat, not rendered)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Scenario search hints injected into Gemini grounding prompt ───────────────
_SEARCH_HINTS: dict[str, str] = {
    "illness":  "most common hospitalised illnesses Malaysia ASEAN 2024 2025 hospital cost dengue heart attack stroke",
    "job_loss": "Malaysia retrenchment layoff unemployment 2024 2025 sectors workers retrenched",
    "disaster": "recent natural disasters floods Malaysia ASEAN 2024 2025 damage cost affected people",
    "war":      "ASEAN geopolitical conflict South China Sea instability 2025 Malaysia MYR financial impact",
}

_SCENARIO_LABELS: dict[str, str] = {
    "illness":  "illness and hospitalisation in Malaysia/ASEAN",
    "job_loss": "job loss, retrenchment and unemployment in Malaysia",
    "disaster": "natural disasters (floods, earthquakes, fires) in Malaysia/ASEAN",
    "war":      "war, civil unrest and geopolitical instability affecting ASEAN/Malaysia",
}

# ── Static fallbacks (pre-seeded 2024–2025 data) ─────────────────────────────
# Used when Gemini grounding is unavailable; already accurate for current year.
_STATIC_FALLBACKS: dict[str, dict] = {
    "illness": {
        "asean_incidents": [
            {"name": "Dengue Fever (Malaysia)",       "cost_rm_range": "RM 3,000–12,000",  "year": "2025"},
            {"name": "Heart Attack (private hosp.)",  "cost_rm_range": "RM 15,000–60,000", "year": "2024"},
            {"name": "Stroke",                        "cost_rm_range": "RM 20,000–80,000", "year": "2024"},
            {"name": "HFMD (children)",               "cost_rm_range": "RM 1,500–5,000",   "year": "2025"},
            {"name": "COVID-19 complications",        "cost_rm_range": "RM 8,000–35,000",  "year": "2024"},
        ],
        "contingency_costs": [
            {"item": "Private hospital bills",         "min_rm": 3500, "max_rm": 15000},
            {"item": "Lost income (2 months)",         "min_rm": 0,    "max_rm": 0},   # filled dynamically
            {"item": "Medication & follow-up (3 mo)", "min_rm": 600,  "max_rm": 1800},
            {"item": "Physiotherapy / rehab",          "min_rm": 500,  "max_rm": 2000},
        ],
    },
    "job_loss": {
        "asean_incidents": [
            {"name": "Tech sector layoffs (Malaysia)", "cost_rm_range": "3,700+ workers",   "year": "2025"},
            {"name": "Manufacturing retrenchments",    "cost_rm_range": "2,100+ jobs lost", "year": "2024"},
            {"name": "Retail & F&B closures",          "cost_rm_range": "Widespread",       "year": "2024"},
            {"name": "E-commerce platform cutbacks",   "cost_rm_range": "1,500+ affected",  "year": "2025"},
        ],
        "contingency_costs": [
            {"item": "Monthly living expenses (zero income)", "min_rm": 0,   "max_rm": 0},   # filled dynamically
            {"item": "Job search costs (transport, tools)",   "min_rm": 150, "max_rm": 300},
            {"item": "Skills retraining / courses",           "min_rm": 500, "max_rm": 3000},
        ],
    },
    "disaster": {
        "asean_incidents": [
            {"name": "Johor/Kelantan floods (Malaysia)",  "cost_rm_range": "RM 1.2B total damage", "year": "2025"},
            {"name": "Thailand northern floods",          "cost_rm_range": "USD 1.5B damage",      "year": "2024"},
            {"name": "Philippines Typhoon Carina",        "cost_rm_range": "USD 300M damage",      "year": "2024"},
            {"name": "Sabah monsoon floods (Malaysia)",   "cost_rm_range": "RM 200M+ damage",      "year": "2024"},
        ],
        "contingency_costs": [
            {"item": "Emergency home repairs",           "min_rm": 5000, "max_rm": 20000},
            {"item": "Temporary accommodation",          "min_rm": 1500, "max_rm": 6000},
            {"item": "Replacement essentials",           "min_rm": 2000, "max_rm": 8000},
            {"item": "Lost income (disruption period)",  "min_rm": 0,    "max_rm": 0},  # filled dynamically
        ],
    },
    "war": {
        "asean_incidents": [
            {"name": "South China Sea tensions (2025)",   "cost_rm_range": "MYR fell to 4.75/USD",  "year": "2025"},
            {"name": "Myanmar civil conflict spillover",  "cost_rm_range": "ASEAN trade disrupted",  "year": "2024"},
            {"name": "Red Sea conflict — import surge",   "cost_rm_range": "+15–20% import costs",   "year": "2024"},
            {"name": "Ukraine war food & fuel impact",    "cost_rm_range": "+8–12% inflation",        "year": "2024"},
        ],
        "contingency_costs": [
            {"item": "Emergency relocation / evacuation", "min_rm": 3000, "max_rm": 10000},
            {"item": "Temporary shelter abroad",          "min_rm": 2500, "max_rm": 8000},
            {"item": "Food & fuel inflation (6 months)",  "min_rm": 0,    "max_rm": 0},  # filled dynamically
            {"item": "Foreign currency reserve",          "min_rm": 2000, "max_rm": 5000},
        ],
    },
}


# ── Deterministic computation (no AI dependency) ─────────────────────────────

def _compute_deterministic_fields(simulation: dict, profile: dict) -> dict:
    """
    Compute withstand verdict and months_can_survive from real simulation data.
    Always deterministic — not AI-generated, always correct.
    """
    months_until_broke: float | None = simulation.get("months_until_broke")
    duration: int = simulation.get("duration_months", 3)
    avg_expense: float = (
        simulation.get("baseline_monthly_expense") or
        profile.get("avg_monthly_expense", 2500)
    )
    savings: float = profile.get("savings_balance", profile.get("current_progress", 0))
    grand_impact: float = simulation.get("grand_total_impact", 0)

    # months_can_survive: how long fund lasts during this specific shock
    if months_until_broke is not None:
        months_can_survive: float | None = round(float(months_until_broke), 1)
    else:
        # Survived — approximate from savings ÷ average monthly burn
        projections = simulation.get("monthly_projected", [])
        if projections:
            avg_burn = sum(p.get("expense", 0) for p in projections) / len(projections)
        else:
            avg_burn = avg_expense
        months_can_survive = round(savings / avg_burn, 1) if avg_burn > 0 else None

    # Verdict thresholds
    if months_until_broke is None:
        verdict = "YES"
        if months_can_survive:
            summary = (
                f"Your savings cover all {duration} months of this scenario. "
                f"You have ~{months_can_survive:.1f} months of runway."
            )
        else:
            summary = f"Your fund holds for all {duration} months modelled."
    elif months_until_broke >= 3.0:
        verdict = "BORDERLINE"
        gap = round(grand_impact - savings, 0)
        if savings > 0 and gap > 0:
            summary = (
                f"Fund lasts ~{months_until_broke:.1f} months before depleting. "
                f"Gap of ~RM{gap:,.0f} if scenario runs the full {duration} months."
            )
        else:
            summary = (
                f"Fund lasts ~{months_until_broke:.1f} of {duration} months. "
                "Build your reserve further to close the gap."
            )
    else:
        verdict = "NO"
        target = round(avg_expense * 3 / 100) * 100
        summary = (
            f"Only {months_until_broke:.1f} months of runway. "
            f"A 3-month emergency fund needs ~RM{target:,.0f}."
        )

    return {
        "months_can_survive": months_can_survive,
        "withstand_verdict":  verdict,
        "withstand_summary":  summary,
    }


def _fill_dynamic_costs(costs: list, profile: dict) -> tuple[list, int, int]:
    """
    Fill zero-placeholder cost items using the user's real RM numbers.
    Entries with min_rm == max_rm == 0 are dynamic placeholders.
    Returns (filled_costs, total_min, total_max).
    """
    avg_income  = profile.get("avg_monthly_income", 3000)
    avg_expense = profile.get("avg_monthly_expense", 2500)

    filled = []
    for c in costs:
        c = dict(c)
        if c["min_rm"] == 0 and c["max_rm"] == 0:
            label = c["item"].lower()
            if "lost income" in label:
                amt = round(avg_income * 2 / 100) * 100
                c["min_rm"] = amt
                c["max_rm"] = amt
            elif "living expenses" in label or "monthly living" in label:
                monthly = round(avg_expense / 100) * 100
                c["min_rm"] = monthly
                c["max_rm"] = monthly * 3
            elif "inflation" in label or "food" in label:
                c["min_rm"] = round(avg_expense * 0.10 * 6 / 100) * 100
                c["max_rm"] = round(avg_expense * 0.20 * 6 / 100) * 100
            elif "disruption" in label:
                amt = round(avg_income * 1.5 / 100) * 100
                c["min_rm"] = amt
                c["max_rm"] = round(avg_income * 2 / 100) * 100
            else:
                c["min_rm"] = round(avg_expense * 0.5 / 100) * 100
                c["max_rm"] = round(avg_expense * 1.0 / 100) * 100
        filled.append(c)

    total_min = sum(c["min_rm"] for c in filled)
    total_max = sum(c["max_rm"] for c in filled)
    return filled, total_min, total_max


# ── Main public function ──────────────────────────────────────────────────────

async def generate_shock_analysis(
    simulation: dict,
    profile: dict,
    shock_type: str,
) -> dict:
    """
    Generates structured shock analysis for the frontend.

    1. Computes deterministic verdict/months_can_survive from real simulation data
    2. Attempts Gemini Google Search grounding for fresh 2024-2025 ASEAN incidents
    3. Falls back to pre-seeded static data if Gemini is unavailable
    """
    deterministic = _compute_deterministic_fields(simulation, profile)

    fallback = _STATIC_FALLBACKS.get(shock_type, _STATIC_FALLBACKS["illness"])
    fb_costs, fb_min, fb_max = _fill_dynamic_costs(
        [dict(c) for c in fallback["contingency_costs"]], profile
    )

    raw_surplus = profile.get("surplus", 100)
    surplus_save = round(min(max(raw_surplus * 0.5, 50), 1000) / 10) * 10
    default_action = f"Transfer RM{surplus_save:.0f} to a dedicated emergency fund today."

    base_result = {
        "contingency_costs":     fb_costs,
        "total_contingency_min": fb_min,
        "total_contingency_max": fb_max,
        **deterministic,
        "narrative": "",  # kept for backward compat — not rendered on frontend
    }

    if not settings.GEMINI_API_KEY:
        return {
            **base_result,
            "asean_incidents": fallback["asean_incidents"],
            "action_today":    default_action,
        }

    try:
        incidents, action_today = await _fetch_with_grounding(shock_type, surplus_save)
        return {
            **base_result,
            "asean_incidents": incidents if len(incidents) >= 2 else fallback["asean_incidents"],
            "action_today":    action_today or default_action,
        }
    except Exception as exc:
        logger.warning(
            "Gemini grounding failed for %s: %s — using static fallback", shock_type, exc
        )
        return {
            **base_result,
            "asean_incidents": fallback["asean_incidents"],
            "action_today":    default_action,
        }


async def _fetch_with_grounding(shock_type: str, surplus_save: float) -> tuple[list, str]:
    """
    Calls Gemini 2.5 Flash with Google Search grounding to fetch current
    ASEAN incidents and a personalised action_today string.
    Returns (asean_incidents_list, action_today_str).
    """
    from google import genai as gai
    from google.genai import types as gtypes

    search_hint    = _SEARCH_HINTS.get(shock_type, "")
    scenario_label = _SCENARIO_LABELS.get(shock_type, shock_type)

    prompt = f"""You are a Malaysian personal finance analyst.
Search Google for the MOST RECENT (2024–2025) events about: {scenario_label}.
Search query to use: {search_hint}

Output ONLY valid JSON — no markdown fences, no explanation:
{{
  "asean_incidents": [
    {{"name": "specific event or illness name", "cost_rm_range": "RM X,000–Y,000 or relevant stat", "year": "2024 or 2025"}}
  ],
  "action_today": "one specific actionable sentence under 15 words"
}}

Rules:
- asean_incidents: EXACTLY 4–5 items from REAL 2024–2025 search results
- illness: common conditions hospitalised in Malaysia with private hospital cost in RM
- job_loss: specific company/sector layoffs in Malaysia with worker counts
- disaster: specific recent floods/disasters in Malaysia or ASEAN with damage figures
- war: specific geopolitical events in ASEAN 2024-2025 affecting MYR or supply chains
- action_today: mention RM{surplus_save:.0f} or reference SOCSO/EPF/JKM where relevant
- Return ONLY the JSON object, nothing else"""

    client = gai.Client(api_key=settings.GEMINI_API_KEY)
    loop = asyncio.get_running_loop()

    def _call() -> str:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=gtypes.GenerateContentConfig(
                tools=[gtypes.Tool(google_search=gtypes.GoogleSearch())],
                temperature=0.2,
            ),
        )
        return resp.text

    raw = await loop.run_in_executor(None, _call)
    raw = raw.strip()

    # Strip markdown code fences Gemini may add
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    # Extract first JSON object (grounding may prepend citation text)
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise ValueError(f"No JSON object found in Gemini response: {raw[:300]}")

    parsed = json.loads(m.group(0))
    incidents = [
        i for i in parsed.get("asean_incidents", [])
        if isinstance(i, dict) and "name" in i and "cost_rm_range" in i
    ]
    if len(incidents) < 2:
        raise ValueError(f"Too few valid incidents returned: {incidents}")

    return incidents, parsed.get("action_today", "")


# ── Backward-compatibility shim ───────────────────────────────────────────────

async def generate_shock_narrative(
    simulation: dict,
    profile: dict,
    shock_type: str,
) -> dict:
    """
    Legacy wrapper — converts structured analysis to the old {narrative, action_today} shape.
    Kept so any other callers don't break during transition.
    """
    result = await generate_shock_analysis(simulation, profile, shock_type)
    return {
        "narrative":    result.get("withstand_summary", ""),
        "action_today": result.get("action_today", ""),
    }
