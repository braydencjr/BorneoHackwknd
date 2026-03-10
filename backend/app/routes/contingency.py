"""
contingency.py — Routes for Feature 5 (Shock Simulation) + Feature 6 (Contingency Fund)

Endpoints:
  GET  /api/v1/contingency/                    → user's fund plan (recalcs if stale)
  GET  /api/v1/contingency/shock/{shock_type}  → shock simulation + narrative [Phase 4/5]
  GET  /api/v1/contingency/regional-risks      → cached Tavily risk events [Phase 3]
  PATCH /api/v1/contingency/progress           → user updates saved amount
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.regional_risk import RegionalRiskCache
from app.models.contingency_plan import ContingencyPlan
from app.models.transactions import Transaction
from app.services.contingency_service import calculate_plan, update_progress

router = APIRouter()

# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class ProgressUpdate(BaseModel):
    current_progress: float  # RM amount the user has already saved


class SaveToFundRequest(BaseModel):
    amount: float  # RM amount to allocate to the emergency fund this session


# ─── GET / ─────────────────────────────────────────────────────────────────────

@router.get("/")
async def get_contingency_plan(
    refresh: bool = Query(False, description="Force recalculation even if plan is fresh"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the authenticated user's personalised contingency fund plan.

    - If a plan exists and was calculated < 24 h ago, returns the cached version.
    - Pass `?refresh=true` to force an immediate recalculation (after new transactions).

    Response includes:
      target_months, target_amount, current_progress, progress_percentage,
      monthly_savings_target, weekly_savings_target, one_time_suggestion,
      milestone_level, months_to_goal, active_indicators, regional_risk_level,
      avg_monthly_expense, surplus, last_calculated_at
    """
    plan = await calculate_plan(db, current_user, force_recalculate=refresh)
    return plan


# ─── PATCH /progress ───────────────────────────────────────────────────────────

@router.patch("/progress")
async def patch_progress(
    body: ProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update how much the user has already saved toward their contingency fund.

    Does NOT trigger a full recalculation — only updates `current_progress`,
    `progress_percentage`, and `milestone_level`.
    """
    if body.current_progress < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="current_progress must be ≥ 0",
        )
    result = await update_progress(db, current_user, body.current_progress)
    return result


# ─── POST /save-to-fund ────────────────────────────────────────────────────────

@router.post("/save-to-fund")
async def save_to_fund(
    body: SaveToFundRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Records a real savings contribution to the emergency fund.

    - Creates a Transaction(type="savings", category="Emergency Fund") so it
      appears in the transaction history and survives plan recalculations.
    - Warns (but does NOT block) when the amount exceeds the user's monthly surplus
      or when the surplus is already zero/negative.
    - Force-recalculates the contingency plan so progress_percentage updates
      immediately.
    """
    if body.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Amount must be greater than 0.",
        )

    # ── Check surplus for a helpful warning ──────────────────────────────────
    plan_result = await db.execute(
        select(ContingencyPlan).where(ContingencyPlan.user_id == current_user.id)
    )
    existing_plan = plan_result.scalar_one_or_none()

    warning: str | None = None
    if existing_plan is not None:
        surplus = existing_plan.surplus or 0.0
        if surplus <= 0:
            warning = (
                f"Your current monthly surplus is RM{surplus:.2f}. "
                "Saving now may put you in a negative cash flow position. "
                "Proceed with caution."
            )
        elif body.amount > surplus:
            warning = (
                f"RM{body.amount:.2f} exceeds your monthly surplus of RM{surplus:.2f}. "
                f"Consider saving RM{existing_plan.monthly_savings_target:.2f} instead."
            )

    # ── Create the savings transaction ───────────────────────────────────────
    transaction = Transaction(
        user_id=current_user.id,
        merchant_name="Emergency Fund",
        amount=body.amount,
        type="savings",
        category="Emergency Fund",
        receipt_image="",
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)

    # ── Force-recalculate so current_progress reflects the new transaction ───
    updated_plan = await calculate_plan(db, current_user, force_recalculate=True)

    return {
        **updated_plan,
        "warning": warning,
        "transaction_id": transaction.id,
    }


# ─── GET /regional-risks ───────────────────────────────────────────────────────

@router.get("/regional-risks")
async def get_regional_risks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all currently cached Tavily risk events (last 24 hours), grouped by
    query_type (illness, job_loss, disaster, war).

    If no Tavily data has been fetched yet (Phase 3 not run), returns empty groups.
    """
    since = datetime.utcnow() - timedelta(hours=24)
    result = await db.execute(
        select(RegionalRiskCache).where(
            RegionalRiskCache.fetched_at >= since
        )
    )
    rows = result.scalars().all()

    # Group by query_type
    grouped: dict[str, list] = {}
    for row in rows:
        qt = row.query_type
        if qt not in grouped:
            grouped[qt] = []
        grouped[qt].append({
            "event_title":              row.event_title,
            "event_summary":            row.event_summary,
            "severity":                 row.severity,
            "financial_impact_category": row.financial_impact_category,
            "time_horizon":             row.time_horizon,
            "source_url":               row.source_url,
            "fetched_at":               row.fetched_at.isoformat(),
        })

    return {
        "illness":   grouped.get("illness", []),
        "job_loss":  grouped.get("job_loss", []),
        "disaster":  grouped.get("disaster", []),
        "war":       grouped.get("war", []),
        "last_updated": rows[0].fetched_at.isoformat() if rows else None,
    }


# ─── GET /shock/{shock_type} ───────────────────────────────────────────────────

VALID_SHOCK_TYPES = {"illness", "job_loss", "disaster", "war"}

@router.get("/shock/{shock_type}")
async def get_shock_simulation(
    shock_type: str,
    duration_months: int = Query(3, ge=1, le=6, description="Simulation duration in months"),
    severity: str = Query("moderate", description="moderate | severe"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    [Phase 4 + 5 — Shock Simulation Engine + Gemini Narrative]

    Runs a personalised financial shock simulation for the given shock type and
    returns impact projections + an AI-generated narrative.

    This endpoint is a placeholder until Phase 4 (shock_simulation_service) and
    Phase 5 (shock_narrative_service) are implemented.
    """
    if shock_type not in VALID_SHOCK_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"shock_type must be one of: {', '.join(sorted(VALID_SHOCK_TYPES))}",
        )

    # ── TODO Phase 4: replace with real simulation ────────────────────────────
    # from app.services.shock_simulation_service import run_shock_simulation
    # from app.services.shock_narrative_service  import generate_narrative
    # profile = await build_vulnerability_profile(db, current_user)
    # simulation = await run_shock_simulation(profile, shock_type, duration_months, severity)
    # narrative  = await generate_narrative(simulation)
    # return {**simulation, **narrative}
    # ─────────────────────────────────────────────────────────────────────────

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Shock simulation engine coming in Phase 4. "
               "Run GET /api/v1/contingency/ first to see your fund plan.",
    )
