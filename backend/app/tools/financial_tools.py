"""
Main agent tools — each returns a JSON string consumed by:
1. The LLM (natural language context)
2. The frontend (card data via astream_events on_tool_end parsing)
"""
import json
import asyncio
from langchain.tools import tool
from app.tools.data_source import FinancialDataSource

_ds = FinancialDataSource()


def _status(value: float, low: float, mid: float) -> str:
    if value >= mid:
        return "ok"
    if value >= low:
        return "warning"
    return "danger"


def _compute_score(
    buffer_months: float,
    debt_ratio: float,
    cashflow_ratio: float,
    habit_score: float,
) -> float:
    """Resilience score: 0-100 weighted formula."""
    s_buffer = min(buffer_months / 6.0, 1.0) * 100
    s_debt = max(1.0 - debt_ratio, 0.0) * 100
    s_cashflow = max(cashflow_ratio, 0.0) * 100
    s_habit = habit_score
    return round(
        0.35 * s_buffer + 0.25 * s_debt + 0.20 * s_cashflow + 0.20 * s_habit, 1
    )


@tool
async def display_vitals(user_id: str) -> str:
    """
    Fetch the user's core financial vital signs.
    Returns buffer months, debt pressure, monthly cash flow, and spending habit score.
    Always call this FIRST before any other tool.
    """
    profile = await _ds.get_profile(user_id)

    debt_ratio = profile.total_debt / max(profile.monthly_income, 1)
    cashflow_ratio = profile.monthly_surplus / max(profile.monthly_income, 1)

    data = {
        "card": "vitals",
        "buffer_months": round(profile.emergency_fund_months, 1),
        "buffer_status": _status(profile.emergency_fund_months, 1.0, 3.0),
        "debt_pressure": round(debt_ratio * 100, 1),
        "debt_status": _status(100 - debt_ratio * 100, 40, 70),
        "cashflow_monthly": round(profile.monthly_surplus, 0),
        "cashflow_status": _status(cashflow_ratio * 100, 10, 20),
        "habit_score": round(profile.habit_score, 0),
        "habit_status": _status(profile.habit_score, 40, 65),
        "monthly_income": profile.monthly_income,
        "total_expenses": profile.total_monthly_expenses,
    }
    return json.dumps(data)


@tool
async def show_resilience_score(user_id: str) -> str:
    """
    Calculate and return the user's Financial Resilience Score (0-100).
    Formula: 35% emergency buffer + 25% debt load + 20% cash flow + 20% spending habits.
    Always call this AFTER display_vitals.
    """
    profile = await _ds.get_profile(user_id)

    debt_ratio = profile.total_debt / max(profile.monthly_income, 1)
    cashflow_ratio = profile.monthly_surplus / max(profile.monthly_income, 1)
    score = _compute_score(
        profile.emergency_fund_months, debt_ratio, cashflow_ratio, profile.habit_score
    )

    if score >= 70:
        verdict = f"Strong. You could survive {round(profile.emergency_fund_months, 1)} months without income."
        tier = "strong"
    elif score >= 40:
        verdict = f"Moderate. You'd last {round(profile.emergency_fund_months, 1)} months — below the 3-month safety line."
        tier = "moderate"
    else:
        verdict = f"Critical. You have only {round(profile.emergency_fund_months, 1)} months of buffer. Act now."
        tier = "critical"

    data = {
        "card": "score",
        "score": score,
        "tier": tier,
        "verdict": verdict,
        "buffer_months": round(profile.emergency_fund_months, 1),
        "dimensions": {
            "buffer": round(min(profile.emergency_fund_months / 6.0, 1.0) * 100, 1),
            "debt": round(max(1.0 - debt_ratio, 0.0) * 100, 1),
            "cashflow": round(max(cashflow_ratio, 0.0) * 100, 1),
            "habits": round(profile.habit_score, 1),
        },
    }
    return json.dumps(data)


@tool
async def trigger_emergency_alert(user_id: str) -> str:
    """
    Trigger an emergency financial alert when the resilience score is critically low (below 40).
    Returns urgent, actionable steps the user must take this week.
    """
    profile = await _ds.get_profile(user_id)
    debt_ratio = profile.total_debt / max(profile.monthly_income, 1)

    actions = []
    if profile.bnpl_debt > profile.monthly_income * 0.3:
        actions.append(
            f"Pause all BNPL purchases — your RM {profile.bnpl_debt:.0f} BNPL balance is eating {round(profile.bnpl_debt / profile.monthly_income * 100)}% of your income."
        )
    if profile.emergency_fund_months < 1:
        actions.append(
            f"Start a RM {round(profile.monthly_surplus * 0.5, -2):.0f}/month emergency auto-transfer — even 50% of your surplus builds a buffer fast."
        )
    if debt_ratio > 0.5:
        actions.append(
            f"Target your smallest debt first (RM {min(profile.bnpl_debt, profile.credit_card_debt):.0f}) — clearing it frees up monthly cash flow immediately."
        )
    if not actions:
        actions = [
            "Set up an emergency fund account separate from your main account.",
            f"Save at least RM {round(profile.total_monthly_expenses * 3 - profile.savings_balance, -2):.0f} more to reach 3 months of expenses.",
            "Review subscriptions and BNPL — cut one non-essential today.",
        ]

    data = {
        "card": "alert",
        "urgency": "critical" if profile.emergency_fund_months < 0.5 else "high",
        "buffer_months": round(profile.emergency_fund_months, 1),
        "action_bullets": actions[:3],
        "savings_gap": round(
            max(profile.total_monthly_expenses * 3 - profile.savings_balance, 0), 0
        ),
    }
    return json.dumps(data)


@tool
async def show_savings_plan(user_id: str) -> str:
    """
    Generate a personalised 3-tier savings plan (aggressive, balanced, safe)
    based on the user's monthly surplus and their emergency fund gap.
    """
    profile = await _ds.get_profile(user_id)
    target = profile.total_monthly_expenses * 6  # 6-month emergency fund target
    gap = max(target - profile.savings_balance, 0)
    surplus = max(profile.monthly_surplus, 0)

    aggressive_rate = min(surplus * 0.6, gap)
    balanced_rate = min(surplus * 0.35, gap)
    safe_rate = min(surplus * 0.20, gap)

    def months_to_target(monthly: float) -> int:
        if monthly <= 0:
            return 999
        return max(int(gap / monthly), 1)

    data = {
        "card": "plan",
        "target_amount": round(target, 0),
        "current_savings": round(profile.savings_balance, 0),
        "gap": round(gap, 0),
        "monthly_surplus": round(surplus, 0),
        "tiers": [
            {
                "id": "aggressive",
                "label": "Fast Track",
                "monthly_save": round(aggressive_rate, -1),
                "weekly_save": round(aggressive_rate / 4, 0),
                "months_to_target": months_to_target(aggressive_rate),
                "sacrifice": "Cuts most flexible spending",
                "tag": "Fastest",
                "tag_color": "amber",
            },
            {
                "id": "balanced",
                "label": "Balanced",
                "monthly_save": round(balanced_rate, -1),
                "weekly_save": round(balanced_rate / 4, 0),
                "months_to_target": months_to_target(balanced_rate),
                "sacrifice": "Comfortable lifestyle maintained",
                "tag": "Recommended",
                "tag_color": "blue",
            },
            {
                "id": "safe",
                "label": "Go Easy",
                "monthly_save": round(safe_rate, -1),
                "weekly_save": round(safe_rate / 4, 0),
                "months_to_target": months_to_target(safe_rate),
                "sacrifice": "Almost no lifestyle change",
                "tag": "Slow & Steady",
                "tag_color": "green",
            },
        ],
    }
    return json.dumps(data)


@tool
async def suggest_actions(chips: list[str]) -> str:
    """
    Render 2-4 contextual action chips for the user to tap next.
    YOU decide what chips to show based on the conversation so far. Ensure it is relevant to the current conversation history and context
    Pass a list of short, tappable suggestion strings relevant to the user's situation.
    Example: ["What if I lose my job?", "Show me a savings plan", "How do I cut BNPL debt?"]
    Always call this at the end of the initial scan and after any major answer.
    """
    data = {
        "card": "chips",
        "chips": chips[:4],  # cap at 4 so the UI doesn't overflow
    }
    return json.dumps(data)
