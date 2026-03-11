"""
/api/v1/spending endpoints — transaction CRUD + AI spending analysis.
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.spending import SpendingTransaction
from app.models.user import User
from app.repositories.spending_repository import spending_repository
from app.schemas.spending import (
    SpendingAnalysisHistoryOut,
    SpendingAnalysisRequest,
    SpendingAnalysisResponse,
    SpendingTransactionIn,
    SpendingTransactionOut,
)
from app.services.spending_analysis_service import spending_analysis_service

router = APIRouter()


# ── Transactions ────────────────────────────────────────────────────────────


@router.post(
    "/transactions",
    response_model=list[SpendingTransactionOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_transactions(
    items: list[SpendingTransactionIn],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-create spending transactions for the authenticated user."""
    if not items:
        raise HTTPException(status_code=400, detail="Provide at least one transaction")

    models = [
        SpendingTransaction(
            user_id=current_user.id,
            date=datetime.fromisoformat(item.date),
            category=item.category,
            amount=item.amount,
            currency="MYR",
            payment_method=item.payment_method.value,
            is_recurring=item.is_recurring,
            description=item.description,
        )
        for item in items
    ]
    saved = await spending_repository.bulk_create_transactions(db, models)
    return [
        SpendingTransactionOut(
            id=tx.id,
            date=tx.date.isoformat(),
            category=tx.category,
            amount=tx.amount,
            currency=tx.currency,
            payment_method=tx.payment_method,
            is_recurring=tx.is_recurring,
            description=tx.description,
        )
        for tx in saved
    ]


@router.get("/transactions", response_model=list[SpendingTransactionOut])
async def list_transactions(
    start: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    end: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's spending transactions, optionally filtered by date range."""
    start_dt = datetime.fromisoformat(start) if start else None
    end_dt = datetime.fromisoformat(end) if end else None
    rows = await spending_repository.get_transactions_by_user(
        db, current_user.id, start_date=start_dt, end_date=end_dt
    )
    return [
        SpendingTransactionOut(
            id=tx.id,
            date=tx.date.isoformat(),
            category=tx.category,
            amount=tx.amount,
            currency=tx.currency,
            payment_method=tx.payment_method,
            is_recurring=tx.is_recurring,
            description=tx.description,
        )
        for tx in rows
    ]


@router.delete("/transactions/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    tx_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await spending_repository.delete_transaction(db, tx_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Transaction not found")


# ── AI Analysis ─────────────────────────────────────────────────────────────


@router.post("/analyze", response_model=SpendingAnalysisResponse)
async def analyze_spending(
    request: SpendingAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze the user's spending habits via LLM.

    Accepts spending data inline in the request body, calls the AI model,
    validates the response, persists the result, and returns it.
    """
    result = await spending_analysis_service.analyze(request)

    # LLM returned an error envelope
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result)

    if not spending_analysis_service.validate_response(result):
        raise HTTPException(
            status_code=502,
            detail="Invalid analysis response from AI model",
        )

    # Persist
    await spending_repository.save_analysis(
        db,
        user_id=current_user.id,
        period_start=datetime.fromisoformat(request.period.start),
        period_end=datetime.fromisoformat(request.period.end),
        analysis_result=result,
    )

    return SpendingAnalysisResponse(**result)


@router.get("/history", response_model=list[SpendingAnalysisHistoryOut])
async def get_analysis_history(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return past spending analyses for the authenticated user."""
    rows = await spending_repository.get_analyses_by_user(
        db, current_user.id, limit=limit
    )
    return [
        SpendingAnalysisHistoryOut(
            id=row.id,
            period_start=row.period_start.isoformat(),
            period_end=row.period_end.isoformat(),
            analysis_result=json.loads(row.analysis_result),
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]
