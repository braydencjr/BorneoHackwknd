"""
FinancialDataSource — queries the real SQLite/MySQL database.

user_id mapping:
  "demo_user"      → DB user with id=1 (first registered user)
  "<integer str>"  → DB user with that integer id
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.transactions import Transaction

logger = logging.getLogger(__name__)

# Keywords (case-insensitive) that mark a category as a fixed obligation
_FIXED_KEYWORDS = ("utilities", "bnpl", "loan", "rent", "insurance", "subscription")
# Keywords that mark a category as BNPL debt
_BNPL_KEYWORDS  = ("bnpl",)


def _is_fixed(category: str) -> bool:
    c = (category or "").lower()
    return any(kw in c for kw in _FIXED_KEYWORDS)


def _is_bnpl(category: str) -> bool:
    c = (category or "").lower()
    return any(kw in c for kw in _BNPL_KEYWORDS)


@dataclass
class UserFinancialProfile:
    user_id: str
    monthly_income: float
    fixed_expenses: float        # utilities, BNPL, loan repayments
    flexible_expenses: float     # food, transport, entertainment, etc.
    savings_balance: float       # lifetime net (income − expenses, clamped ≥ 0)
    bnpl_debt: float             # 90-day BNPL spend proxy
    credit_card_debt: float      # outstanding credit card balance
    dependents: int
    risk_profile: str            # "conservative" | "moderate" | "aggressive"
    habit_score: float           # 0-100 derived from spending patterns

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


def _resolve_db_user_id(user_id: str) -> int:
    """Map a string user_id to an integer DB primary key."""
    if user_id == "demo_user":
        return 1
    try:
        return int(user_id)
    except (ValueError, TypeError):
        return 1


def _compute_habit_score(
    monthly_income: float,
    bnpl_debt: float,
    total_expenses: float,
    monthly_surplus: float,
) -> float:
    """
    0-100 habit score derived from:
      40 pts — BNPL ratio  (< 10 % income = full marks, > 50 % = 0)
      30 pts — savings rate (surplus / income, capped at 20 %)
      30 pts — discretionary control (expenses / income, lower is better)
    """
    if monthly_income <= 0:
        return 0.0

    # BNPL penalty
    bnpl_ratio = bnpl_debt / monthly_income
    bnpl_pts = max(0.0, min(1.0, 1.0 - (bnpl_ratio - 0.10) / 0.40)) * 40

    # Savings rate reward
    savings_rate = max(monthly_surplus, 0) / monthly_income
    savings_pts  = min(savings_rate / 0.20, 1.0) * 30

    # Expense control
    expense_ratio = total_expenses / monthly_income
    expense_pts   = max(0.0, min(1.0, 1.0 - (expense_ratio - 0.50) / 0.50)) * 30

    return round(bnpl_pts + savings_pts + expense_pts, 1)


class FinancialDataSource:
    """Queries the real DB to build a UserFinancialProfile for agent tools."""

    async def get_profile(self, user_id: str) -> UserFinancialProfile:
        db_uid = _resolve_db_user_id(user_id)
        now    = datetime.utcnow()
        since_30d = now - timedelta(days=30)
        since_90d = now - timedelta(days=90)

        try:
            async with AsyncSessionLocal() as session:
                # ── Last-30-day transactions ─────────────────────────────────
                res30 = await session.execute(
                    select(Transaction)
                    .where(Transaction.user_id == db_uid)
                    .where(Transaction.created_at >= since_30d)
                )
                txns_30 = res30.scalars().all()

                monthly_income = sum(
                    t.amount for t in txns_30 if t.type and t.type.lower() == "income"
                )
                expense_txns = [
                    t for t in txns_30
                    if t.type and t.type.lower() in ("expense", "spending")
                ]
                fixed_expenses = sum(
                    t.amount for t in expense_txns if _is_fixed(t.category)
                )
                flexible_expenses = sum(
                    t.amount for t in expense_txns if not _is_fixed(t.category)
                )

                # ── Last-90-day BNPL debt proxy ──────────────────────────────
                res90 = await session.execute(
                    select(Transaction)
                    .where(Transaction.user_id == db_uid)
                    .where(Transaction.created_at >= since_90d)
                )
                bnpl_txns_90 = res90.scalars().all()
                bnpl_debt = sum(
                    t.amount for t in bnpl_txns_90
                    if t.type and t.type.lower() in ("expense", "spending") and _is_bnpl(t.category)
                )

                # ── Lifetime savings (net income − expenses, floored at 0) ───
                res_all = await session.execute(
                    select(Transaction).where(Transaction.user_id == db_uid)
                )
                all_txns = res_all.scalars().all()
                total_in  = sum(
                    t.amount for t in all_txns
                    if t.type and t.type.lower() == "income"
                )
                total_out = sum(
                    t.amount for t in all_txns
                    if t.type and t.type.lower() in ("expense", "spending")
                )
                savings_balance = max(total_in - total_out, 0.0)

        except Exception:
            logger.exception("DB query failed for user_id=%s — returning zero profile", user_id)
            return self._zero_profile(user_id)

        total_expenses = fixed_expenses + flexible_expenses
        monthly_surplus = monthly_income - total_expenses
        habit_score = _compute_habit_score(
            monthly_income, bnpl_debt, total_expenses, monthly_surplus
        )

        return UserFinancialProfile(
            user_id=user_id,
            monthly_income=monthly_income,
            fixed_expenses=fixed_expenses,
            flexible_expenses=flexible_expenses,
            savings_balance=savings_balance,
            bnpl_debt=bnpl_debt,
            credit_card_debt=0.0,
            dependents=0,
            risk_profile="moderate",
            habit_score=habit_score,
        )

    def _zero_profile(self, user_id: str) -> UserFinancialProfile:
        """Returned when DB has no data for this user yet."""
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
            habit_score=0.0,
        )

    async def get_monthly_surplus(self, user_id: str) -> float:
        profile = await self.get_profile(user_id)
        return profile.monthly_surplus

    async def get_emergency_fund_months(self, user_id: str) -> float:
        profile = await self.get_profile(user_id)
        return profile.emergency_fund_months
