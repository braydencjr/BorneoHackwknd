"""
FinancialDataSource — Adapter pattern.

Swap the _fetch_profile / _fetch_breakdown methods for real DB queries
when the teammate's database is ready. Zero tool-layer changes required.
"""
from dataclasses import dataclass
from typing import List


@dataclass
class UserFinancialProfile:
    user_id: str
    monthly_income: float
    fixed_expenses: float        # rent, loan repayments, insurance
    flexible_expenses: float     # food, transport, entertainment
    savings_balance: float       # total liquid savings
    bnpl_debt: float             # outstanding BNPL balance
    credit_card_debt: float      # outstanding credit card balance
    dependents: int              # number of dependents
    risk_profile: str            # "conservative" | "moderate" | "aggressive"
    habit_score: float           # 0-100, from spending analysis feature (mock: 55)

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
# MOCK PROFILES — replace _fetch_profile with async DB call when ready
# ---------------------------------------------------------------------------

_MOCK_PROFILES = {
    "demo_user": UserFinancialProfile(
        user_id="demo_user",
        monthly_income=4500.0,
        fixed_expenses=1800.0,    # rent + car loan + insurance
        flexible_expenses=1360.0, # food, transport, subscriptions
        savings_balance=3800.0,   # current savings
        bnpl_debt=1200.0,         # Grab PayLater / Shopee PayLater
        credit_card_debt=600.0,
        dependents=0,
        risk_profile="moderate",
        habit_score=55.0,
    ),
    # Add more mock profiles here for testing different scenarios
    "low_score_user": UserFinancialProfile(
        user_id="low_score_user",
        monthly_income=2800.0,
        fixed_expenses=1600.0,
        flexible_expenses=1000.0,
        savings_balance=400.0,
        bnpl_debt=2200.0,
        credit_card_debt=1500.0,
        dependents=2,
        risk_profile="conservative",
        habit_score=30.0,
    ),
}


class FinancialDataSource:
    """
    Single source of truth for all financial data consumed by agent tools.
    Mock now — swap _fetch_profile for a real DB query to integrate with
    the teammate's database without changing any tool code.
    """

    async def get_profile(self, user_id: str) -> UserFinancialProfile:
        """Return the user's financial profile. Currently mocked."""
        return self._fetch_profile(user_id)

    def _fetch_profile(self, user_id: str) -> UserFinancialProfile:
        # ----------------------------------------------------------------
        # SWAP THIS for:  return await db.query(UserFinancialProfile, user_id)
        # ----------------------------------------------------------------
        return _MOCK_PROFILES.get(user_id, _MOCK_PROFILES["demo_user"])

    async def get_monthly_surplus(self, user_id: str) -> float:
        profile = await self.get_profile(user_id)
        return profile.monthly_surplus

    async def get_emergency_fund_months(self, user_id: str) -> float:
        profile = await self.get_profile(user_id)
        return profile.emergency_fund_months
