"""
FinancialDataSource — Adapter pattern.

Derives the user's financial profile from real transaction data in the database.
Falls back to a sensible default if the user has no transactions yet.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.transactions import Transaction
from app.models.user import User
from app.models.contingency_plan import ContingencyPlan

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Categories — used to split fixed vs flexible spending
# ---------------------------------------------------------------------------
_FIXED_CATEGORIES = {
    "Utilities", "Health", "Insurance", "Rent", "Mortgage",
    "Loan", "Education", "Childcare",
}
_BNPL_CATEGORIES = {
    "BNPL (Buy Now Pay Later)", "BNPL", "Buy Now Pay Later",
    "PayLater", "Instalment",
}

# ---------------------------------------------------------------------------
# Profile dataclass
# ---------------------------------------------------------------------------

@dataclass
class UserFinancialProfile:
    user_id: str
    monthly_income: float
    fixed_expenses: float        # rent, loan repayments, insurance, utilities
    flexible_expenses: float     # food, transport, entertainment, shopping
    savings_balance: float       # total liquid savings / emergency fund
    bnpl_debt: float             # outstanding BNPL balance (last 90 days)
    credit_card_debt: float      # outstanding credit card balance
    dependents: int              # number of dependents
    risk_profile: str            # "conservative" | "moderate" | "aggressive"
    habit_score: float           # 0-100, derived from spending patterns

    @property
    def total_monthly_expenses(self) -> float:
        return self.fixed_expenses + self.flexible_expenses

    @property
    def monthly_surplus(self) -> float:
        return self.monthly_income - self.total_monthly_expenses

    @property
    def total_debt(self) -> float:
        return self.bnpl_debt + self.credit_card_debt

    @property
    def emergency_fund_months(self) -> float:
        if self.total_monthly_expenses == 0:
            return 0.0
        return self.savings_balance / self.total_monthly_expenses


# ---------------------------------------------------------------------------
# Habit score computation
# ---------------------------------------------------------------------------

def _compute_habit_score(
    monthly_income: float,
    bnpl_monthly: float,
    savings_rate: float,   # surplus / income  (0-1)
    by_category: dict[str, float],
) -> float:
    """Return a habit score 0-100 based on the user's spending distribution."""
    score = 100.0
    if monthly_income <= 0:
        return 50.0

    # BNPL usage penalty (max -30)
    bnpl_ratio = bnpl_monthly / monthly_income
    score -= min(bnpl_ratio * 150, 30)

    # Low savings penalty (max -25)
    if savings_rate < 0:
        score -= 25
    elif savings_rate < 0.10:
        score -= 15
    elif savings_rate < 0.20:
        score -= 5

    # Excessive discretionary spending penalties
    food_ratio  = by_category.get("Food & Dining", 0) / monthly_income
    shop_ratio  = by_category.get("Shopping", 0)      / monthly_income
    ent_ratio   = by_category.get("Entertainment", 0) / monthly_income

    if food_ratio > 0.25:
        score -= min((food_ratio - 0.25) * 100, 10)
    if shop_ratio > 0.20:
        score -= min((shop_ratio - 0.20) * 100, 15)
    if ent_ratio > 0.10:
        score -= min((ent_ratio - 0.10) * 100, 10)

    return round(max(10.0, min(100.0, score)), 1)


# ---------------------------------------------------------------------------
# Resolve a string user_id to a DB integer primary key
# ---------------------------------------------------------------------------

async def _resolve_db_user_id(session: AsyncSession, user_id: str) -> int | None:
    """
    "demo_user" → first user in DB (id=1 if it exists, else the smallest id).
    Numeric string → that integer id.
    Returns None if the user cannot be found.
    """
    if user_id == "demo_user":
        result = await session.execute(
            select(User.id).order_by(User.id).limit(1)
        )
        row = result.scalar_one_or_none()
        return row
    try:
        db_id = int(user_id)
        result = await session.execute(select(User.id).where(User.id == db_id))
        return result.scalar_one_or_none()
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Main data source
# ---------------------------------------------------------------------------

class FinancialDataSource:
    """
    Derives the user's financial profile from real transaction data.
    Falls back gracefully when no data is available.
    """

    async def get_profile(self, user_id: str) -> UserFinancialProfile:
        """Build a UserFinancialProfile from real DB transactions."""
        try:
            async with AsyncSessionLocal() as session:
                db_user_id = await _resolve_db_user_id(session, user_id)
                if db_user_id is None:
                    logger.warning("data_source: user '%s' not found, using defaults", user_id)
                    return self._default_profile(user_id)

                # ── Fetch last 30 days of transactions ────────────────────
                since_30 = datetime.utcnow() - timedelta(days=30)
                since_90 = datetime.utcnow() - timedelta(days=90)

                result_30 = await session.execute(
                    select(Transaction).where(
                        Transaction.user_id == db_user_id,
                        Transaction.created_at >= since_30,
                    )
                )
                txs_30 = result_30.scalars().all()

                result_90 = await session.execute(
                    select(Transaction).where(
                        Transaction.user_id == db_user_id,
                        Transaction.created_at >= since_90,
                        Transaction.category.in_(list(_BNPL_CATEGORIES)),
                    )
                )
                txs_90_bnpl = result_90.scalars().all()

                if not txs_30:
                    logger.info("data_source: no recent transactions for user %s, using defaults", db_user_id)
                    return self._default_profile(user_id)

                # ── Aggregate 30-day income & expenses ─────────────────────
                monthly_income   = 0.0
                fixed_expenses   = 0.0
                flexible_expenses = 0.0
                by_category: dict[str, float] = {}

                for tx in txs_30:
                    if tx.type == "income":
                        monthly_income += tx.amount
                    elif tx.type == "expense":
                        cat = tx.category or "Other"
                        by_category[cat] = by_category.get(cat, 0.0) + tx.amount
                        if cat in _FIXED_CATEGORIES:
                            fixed_expenses += tx.amount
                        elif cat in _BNPL_CATEGORIES:
                            # Count BNPL payments as fixed (unavoidable installments)
                            fixed_expenses += tx.amount
                        else:
                            flexible_expenses += tx.amount

                # ── BNPL outstanding (last 90 days) ────────────────────────
                bnpl_90 = sum(tx.amount for tx in txs_90_bnpl)
                # Use 90-day BNPL as outstanding debt proxy
                bnpl_debt = round(bnpl_90, 2)

                # ── Savings balance ────────────────────────────────────────
                # Prefer ContingencyPlan.current_progress (user-reported savings).
                # Fall back to: max(0, lifetime income - lifetime expenses).
                savings_balance = await self._get_savings_balance(session, db_user_id)

                # ── Habit score ────────────────────────────────────────────
                surplus = monthly_income - fixed_expenses - flexible_expenses
                savings_rate = surplus / monthly_income if monthly_income > 0 else 0.0
                bnpl_monthly = by_category.get("BNPL (Buy Now Pay Later)", 0.0)
                habit_score = _compute_habit_score(
                    monthly_income, bnpl_monthly, savings_rate, by_category
                )

                # ── Risk profile heuristic ─────────────────────────────────
                if savings_rate < 0.05 or bnpl_debt > monthly_income * 0.5:
                    risk_profile = "conservative"
                elif savings_rate > 0.25:
                    risk_profile = "aggressive"
                else:
                    risk_profile = "moderate"

                return UserFinancialProfile(
                    user_id=user_id,
                    monthly_income=round(monthly_income, 2),
                    fixed_expenses=round(fixed_expenses, 2),
                    flexible_expenses=round(flexible_expenses, 2),
                    savings_balance=round(savings_balance, 2),
                    bnpl_debt=round(bnpl_debt, 2),
                    credit_card_debt=0.0,
                    dependents=0,
                    risk_profile=risk_profile,
                    habit_score=habit_score,
                )

        except Exception:
            logger.exception("data_source: DB error for user '%s', using defaults", user_id)
            return self._default_profile(user_id)

    async def _get_savings_balance(self, session: AsyncSession, db_user_id: int) -> float:
        """
        Return the user's current savings balance.
        Checks ContingencyPlan.current_progress first; falls back to
        computing max(0, lifetime income - lifetime expenses) from transactions.
        """
        try:
            result = await session.execute(
                select(ContingencyPlan).where(ContingencyPlan.user_id == db_user_id)
            )
            plan = result.scalar_one_or_none()
            if plan and plan.current_progress > 0:
                return plan.current_progress
        except Exception:
            pass

        # Fallback: lifetime balance from all transactions
        result = await session.execute(
            select(Transaction).where(Transaction.user_id == db_user_id)
        )
        all_txs = result.scalars().all()
        balance = sum(
            tx.amount if tx.type == "income" else -tx.amount
            for tx in all_txs
        )
        return max(0.0, balance)

    def _default_profile(self, user_id: str) -> UserFinancialProfile:
        """Fallback profile when DB is unavailable or user has no data."""
        return UserFinancialProfile(
            user_id=user_id,
            monthly_income=0.0,
            fixed_expenses=0.0,
            flexible_expenses=0.0,
            savings_balance=0.0,
            bnpl_debt=0.0,
            credit_card_debt=0.0,
            dependents=0,
            risk_profile="moderate",
            habit_score=50.0,
        )

    async def get_monthly_surplus(self, user_id: str) -> float:
        profile = await self.get_profile(user_id)
        return profile.monthly_surplus

    async def get_emergency_fund_months(self, user_id: str) -> float:
        profile = await self.get_profile(user_id)
        return profile.emergency_fund_months
