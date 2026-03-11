"""
contingency_service.py

Orchestrates the full contingency fund calculation for a user:

  1. Calls vulnerability_profiler  → get indicators + spending data
  2. Queries regional_risk_cache   → add 6th indicator + derive risk level
  3. Computes fund target           → target_months, target_amount
  4. Computes saving plan           → monthly/weekly targets, one-time tip
  5. Upserts contingency_plans     → create or refresh the user's plan row
  6. Returns the plan as a dict    → consumed by the route handler

Called by:
  app/routes/contingency.py  →  GET /api/v1/contingency/
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions import Transaction
from app.models.user import User
from app.models.regional_risk import RegionalRiskCache
from app.models.contingency_plan import ContingencyPlan
from app.services.vulnerability_profiler import build_vulnerability_profile

# ─── Constants ────────────────────────────────────────────────────────────────

BASE_MONTHS = 3.0          # Everyone starts with a 3-month fund target
MAX_MONTHS  = 12.0         # Cap — no one needs more than 12 months saved
PLAN_TTL_HOURS = 24        # Recalculate plan if older than this


# ─── Regional risk helpers ─────────────────────────────────────────────────────

async def _get_regional_risk(db: AsyncSession) -> dict:
    """
    Reads the regional_risk_cache table and returns:
      - max_severity (int 1-5) across all cached rows in the last 24h
      - risk_level   ("low" | "medium" | "high")
      - top_event_title (str | None)
      - indicator (dict | None) — the 6th vulnerability indicator

    Uses all query_types together — we want the worst active risk regardless of type.
    Falls back to {"max_severity": 1, "risk_level": "low", ...} if cache is empty.
    """
    since = datetime.utcnow() - timedelta(hours=PLAN_TTL_HOURS)

    result = await db.execute(
        select(RegionalRiskCache).where(
            RegionalRiskCache.fetched_at >= since
        )
    )
    rows = result.scalars().all()

    if not rows:
        return {
            "max_severity":    1,
            "risk_level":      "low",
            "top_event_title": None,
            "indicator":       None,
        }

    max_severity = max(r.severity for r in rows)
    top_row = max(rows, key=lambda r: r.severity)

    # risk_level bands
    if max_severity >= 4:
        risk_level = "high"
    elif max_severity >= 2:
        risk_level = "medium"
    else:
        risk_level = "low"

    # Build the 6th indicator (only fires at severity ≥ 3)
    indicator = None
    if max_severity >= 3:
        score = (max_severity - 2) / 3          # 3→0.33, 4→0.67, 5→1.0
        extra_months = round(score * 1.5, 2)    # max +1.5 months
        indicator = {
            "name":         "regional_risk_overlay",
            "score":        round(score, 3),
            "extra_months": extra_months,
            "detail":       f"A regional risk event of severity {max_severity}/5 "
                            f"was detected: '{top_row.event_title}'. "
                            "A larger buffer helps absorb wider economic disruption.",
        }

    return {
        "max_severity":    max_severity,
        "risk_level":      risk_level,
        "top_event_title": top_row.event_title if max_severity >= 3 else None,
        "indicator":       indicator,
    }


# ─── Saving plan helpers ───────────────────────────────────────────────────────

def _compute_saving_plan(
    profile: dict,
) -> tuple[float, float, float]:
    """
    Returns (monthly_savings_target, weekly_savings_target, one_time_suggestion).

    Two tiers:
      Normal tier     (surplus ≥ 5% of income): save 20% of surplus, min RM 50
      Micro-savings   (near_zero_surplus flag):  save 10% of surplus, min RM 20

    One-time boost: if any month's income was > 1.3× average, suggest putting
    50% of the spike toward the fund.
    """
    surplus           = profile["surplus"]
    avg_monthly_income = profile["avg_monthly_income"]
    income_by_month    = profile["income_by_month"]

    if profile["near_zero_surplus"]:
        # Micro-savings tier
        monthly = max(surplus * 0.10, 20.0)
    else:
        # Normal tier
        monthly = max(surplus * 0.20, 50.0)

    # Ensure we never suggest saving more than the actual surplus
    if surplus > 0:
        monthly = min(monthly, surplus * 0.80)
    else:
        monthly = 20.0   # even with zero surplus, nudge toward RM 20/month

    weekly = round(monthly / 4.33, 2)

    # One-time boost: any income month > 130% of average?
    one_time = 0.0
    if avg_monthly_income > 0:
        for month_income in income_by_month.values():
            if month_income > avg_monthly_income * 1.3:
                spike = month_income - avg_monthly_income
                one_time = max(one_time, round(spike * 0.50, 2))

    return round(monthly, 2), weekly, one_time


def _milestone_level(current_progress: float, target_amount: float) -> str:
    """Returns milestone label based on how much of the fund has been saved."""
    if target_amount <= 0:
        return "starter"
    ratio = current_progress / target_amount
    if ratio >= 1.0:
        return "ready"
    elif ratio >= 0.66:
        return "resilient"
    elif ratio >= 0.33:
        return "stable"
    else:
        return "starter"


# ─── Main entry point ──────────────────────────────────────────────────────────

async def calculate_plan(
    db: AsyncSession,
    user: User,
    force_recalculate: bool = False,
) -> dict:
    """
    Returns the user's contingency plan.

    If a plan exists and is < 24 hours old AND force_recalculate is False,
    the cached plan is returned immediately (no DB writes, no Gemini calls).

    Otherwise, the full calculation pipeline runs and the plan is upserted.
    """
    # ── 1. Check for a fresh cached plan ──────────────────────────────────────
    existing_result = await db.execute(
        select(ContingencyPlan).where(ContingencyPlan.user_id == user.id)
    )
    existing: ContingencyPlan | None = existing_result.scalar_one_or_none()

    if (
        existing is not None
        and not force_recalculate
        and (datetime.utcnow() - existing.last_calculated_at) < timedelta(hours=PLAN_TTL_HOURS)
    ):
        # Return the cached plan — build the same output shape from the ORM row
        return _plan_to_dict(existing)

    # ── 2. Build vulnerability profile (reads transactions table) ─────────────
    profile = await build_vulnerability_profile(db, user, days=92)

    # ── 3. Get regional risk + 6th indicator ──────────────────────────────────
    regional = await _get_regional_risk(db)

    # Merge regional indicator into the profile indicators list
    all_indicators = list(profile["indicators"])
    if regional["indicator"] is not None:
        all_indicators.append(regional["indicator"])

    # ── 4. Calculate fund target ───────────────────────────────────────────────
    total_extra = sum(i["score"] * i["extra_months"] for i in all_indicators)
    target_months = round(min(BASE_MONTHS + total_extra, MAX_MONTHS), 2)

    avg_monthly_expense = profile["avg_monthly_expense"]
    # Safeguard: if no transactions yet, use 0 but still return a sensible plan
    if avg_monthly_expense <= 0:
        avg_monthly_expense = 0.0
    target_amount = round(target_months * avg_monthly_expense, 2)

    # ── 5. Saving plan ─────────────────────────────────────────────────────────
    monthly_target, weekly_target, one_time = _compute_saving_plan(profile)

    # ── 6. Progress (auto-sum fund savings transactions) ──────────────────────
    savings_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
            Transaction.user_id == user.id,
            Transaction.type == "savings",
            Transaction.category == "Emergency Fund",
        )
    )
    current_progress = float(savings_result.scalar() or 0.0)
    progress_pct = (
        round((current_progress / target_amount) * 100, 1)
        if target_amount > 0
        else 0.0
    )

    # ── 7. Upsert the plan ─────────────────────────────────────────────────────
    now = datetime.utcnow()
    if existing is None:
        plan = ContingencyPlan(
            user_id               = user.id,
            target_months         = target_months,
            target_amount         = target_amount,
            current_progress      = current_progress,
            monthly_savings_target= monthly_target,
            weekly_savings_target = weekly_target,
            one_time_suggestion   = one_time,
            active_indicators     = all_indicators,
            regional_risk_level   = regional["risk_level"],
            avg_monthly_expense   = avg_monthly_expense,
            surplus               = profile["surplus"],
            last_calculated_at    = now,
        )
        db.add(plan)
    else:
        existing.target_months          = target_months
        existing.target_amount          = target_amount
        existing.current_progress       = current_progress
        existing.monthly_savings_target = monthly_target
        existing.weekly_savings_target  = weekly_target
        existing.one_time_suggestion    = one_time
        existing.active_indicators      = all_indicators
        existing.regional_risk_level    = regional["risk_level"]
        existing.avg_monthly_expense    = avg_monthly_expense
        existing.surplus                = profile["surplus"]
        existing.last_calculated_at     = now

    await db.commit()

    # ── 8. Return the output dict ──────────────────────────────────────────────
    months_to_goal: float | None = None
    remaining = target_amount - current_progress
    if monthly_target > 0 and remaining > 0:
        months_to_goal = math.ceil(remaining / monthly_target)

    return {
        "target_months":          target_months,
        "target_amount":          target_amount,
        "current_progress":       current_progress,
        "progress_percentage":    progress_pct,
        "monthly_savings_target": monthly_target,
        "weekly_savings_target":  weekly_target,
        "one_time_suggestion":    one_time,
        "milestone_level":        _milestone_level(current_progress, target_amount),
        "months_to_goal":         months_to_goal,
        "active_indicators":      all_indicators,
        "regional_risk_level":    regional["risk_level"],
        "top_regional_event":     regional["top_event_title"],
        "avg_monthly_expense":    avg_monthly_expense,
        "avg_monthly_income":     profile["avg_monthly_income"],
        "surplus":                profile["surplus"],
        "by_category":            profile["by_category"],
        "last_calculated_at":     now.isoformat(),
    }


def _plan_to_dict(plan: ContingencyPlan) -> dict:
    """Converts a cached ContingencyPlan ORM row back into the standard output dict."""
    target_amount    = plan.target_amount
    current_progress = plan.current_progress
    monthly_target   = plan.monthly_savings_target

    progress_pct = (
        round((current_progress / target_amount) * 100, 1)
        if target_amount > 0 else 0.0
    )
    months_to_goal: float | None = None
    remaining = target_amount - current_progress
    if monthly_target > 0 and remaining > 0:
        months_to_goal = math.ceil(remaining / monthly_target)

    return {
        "target_months":          plan.target_months,
        "target_amount":          target_amount,
        "current_progress":       current_progress,
        "progress_percentage":    progress_pct,
        "monthly_savings_target": monthly_target,
        "weekly_savings_target":  plan.weekly_savings_target,
        "one_time_suggestion":    plan.one_time_suggestion,
        "milestone_level":        _milestone_level(current_progress, target_amount),
        "months_to_goal":         months_to_goal,
        "active_indicators":      plan.active_indicators or [],
        "regional_risk_level":    plan.regional_risk_level,
        "top_regional_event":     None,   # not stored separately in the row
        "avg_monthly_expense":    plan.avg_monthly_expense,
        "avg_monthly_income":     None,   # not cached in row
        "surplus":                plan.surplus,
        "by_category":            None,   # not cached in row
        "last_calculated_at":     plan.last_calculated_at.isoformat(),
    }


# ─── Progress updater ──────────────────────────────────────────────────────────

async def update_progress(
    db: AsyncSession,
    user: User,
    amount: float,
) -> dict:
    """
    PATCH /progress — user manually updates how much they've saved.
    Returns the minimal updated fields (no full recalc needed).
    """
    result = await db.execute(
        select(ContingencyPlan).where(ContingencyPlan.user_id == user.id)
    )
    plan: ContingencyPlan | None = result.scalar_one_or_none()

    if plan is None:
        # Auto-create a basic plan first, then update progress
        plan_dict = await calculate_plan(db, user)
        # Fetch the freshly created row
        result2 = await db.execute(
            select(ContingencyPlan).where(ContingencyPlan.user_id == user.id)
        )
        plan = result2.scalar_one_or_none()

    if plan is None:
        # Still None (no transactions at all) — return a zero plan
        return {"current_progress": amount, "progress_percentage": 0.0, "milestone_level": "starter"}

    plan.current_progress = max(0.0, amount)
    await db.commit()

    progress_pct = (
        round((plan.current_progress / plan.target_amount) * 100, 1)
        if plan.target_amount > 0 else 0.0
    )
    return {
        "current_progress":    plan.current_progress,
        "progress_percentage": progress_pct,
        "milestone_level":     _milestone_level(plan.current_progress, plan.target_amount),
    }
