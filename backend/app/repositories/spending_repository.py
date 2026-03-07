import json
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.spending import SpendingAnalysis, SpendingTransaction


class SpendingRepository:
    """Database access for spending transactions and analyses."""

    # ── Transactions ────────────────────────────────────────────────────

    async def create_transaction(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        date: datetime,
        category: str,
        amount: float,
        currency: str,
        payment_method: str,
        is_recurring: bool,
        description: Optional[str] = None,
    ) -> SpendingTransaction:
        tx = SpendingTransaction(
            user_id=user_id,
            date=date,
            category=category,
            amount=amount,
            currency=currency,
            payment_method=payment_method,
            is_recurring=is_recurring,
            description=description,
        )
        db.add(tx)
        await db.flush()
        await db.refresh(tx)
        return tx

    async def bulk_create_transactions(
        self,
        db: AsyncSession,
        transactions: List[SpendingTransaction],
    ) -> List[SpendingTransaction]:
        db.add_all(transactions)
        await db.flush()
        for tx in transactions:
            await db.refresh(tx)
        return transactions

    async def get_transactions_by_user(
        self,
        db: AsyncSession,
        user_id: int,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[SpendingTransaction]:
        stmt = select(SpendingTransaction).where(
            SpendingTransaction.user_id == user_id
        )
        if start_date:
            stmt = stmt.where(SpendingTransaction.date >= start_date)
        if end_date:
            stmt = stmt.where(SpendingTransaction.date <= end_date)
        stmt = stmt.order_by(SpendingTransaction.date.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def delete_transaction(
        self, db: AsyncSession, tx_id: int, user_id: int
    ) -> bool:
        stmt = select(SpendingTransaction).where(
            SpendingTransaction.id == tx_id,
            SpendingTransaction.user_id == user_id,
        )
        result = await db.execute(stmt)
        tx = result.scalars().first()
        if not tx:
            return False
        await db.delete(tx)
        await db.flush()
        return True

    # ── Analyses ────────────────────────────────────────────────────────

    async def save_analysis(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        period_start: datetime,
        period_end: datetime,
        analysis_result: dict,
    ) -> SpendingAnalysis:
        analysis = SpendingAnalysis(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            analysis_result=json.dumps(analysis_result),
        )
        db.add(analysis)
        await db.flush()
        await db.refresh(analysis)
        return analysis

    async def get_analyses_by_user(
        self,
        db: AsyncSession,
        user_id: int,
        *,
        limit: int = 10,
    ) -> List[SpendingAnalysis]:
        stmt = (
            select(SpendingAnalysis)
            .where(SpendingAnalysis.user_id == user_id)
            .order_by(SpendingAnalysis.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())


spending_repository = SpendingRepository()
