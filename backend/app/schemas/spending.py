from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class PaymentMethodEnum(str, Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    BNPL = "bnpl"
    TRANSFER = "transfer"
    OTHER = "other"


class GranularityEnum(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class SpendingTransactionIn(BaseModel):
    date: str  # ISO 8601 date string
    category: str
    amount: float
    payment_method: PaymentMethodEnum
    is_recurring: bool = False
    description: Optional[str] = None

    @field_validator("category")
    @classmethod
    def category_lowercase(cls, v: str) -> str:
        return v.lower().strip().replace(" ", "_")

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class AnalysisPeriod(BaseModel):
    start: str  # YYYY-MM-DD
    end: str  # YYYY-MM-DD
    granularity: GranularityEnum = GranularityEnum.MONTHLY


class CategoryRules(BaseModel):
    fixed_categories: Optional[List[str]] = None
    flexible_categories: Optional[List[str]] = None
    essential_categories: Optional[List[str]] = None
    non_essential_categories: Optional[List[str]] = None


class RiskThresholds(BaseModel):
    bnpl_share_warning: float = 0.15
    bnpl_share_high: float = 0.25
    category_spike_pct: float = 0.30
    single_category_concentration_warning: float = 0.40


class SpendingAnalysisRequest(BaseModel):
    currency: str = "MYR"
    period: AnalysisPeriod
    spending: List[SpendingTransactionIn]
    category_rules: Optional[CategoryRules] = None
    risk_thresholds: Optional[RiskThresholds] = None

    @field_validator("spending")
    @classmethod
    def spending_not_empty(cls, v: list) -> list:
        if len(v) == 0:
            raise ValueError("At least one spending transaction is required")
        return v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class CategoryShare(BaseModel):
    category: str
    share: float
    amount: Optional[float] = None


class SummaryOut(BaseModel):
    total_spending: float
    non_essential_share: float
    fixed_share: float
    flexible_share: float
    bnpl_share: float
    headline: str


class FixedVsFlexibleOut(BaseModel):
    fixed_amount: float
    flexible_amount: float
    key_fixed_categories: List[CategoryShare]
    key_flexible_categories: List[CategoryShare]


class RiskFlagOut(BaseModel):
    type: str
    severity: str
    evidence: str


class AnalysisMetadataOut(BaseModel):
    analysis_timestamp: str
    data_quality: str
    inferred_categories: List[str] = []
    warnings: List[str] = []


class SpendingAnalysisResponse(BaseModel):
    summary: SummaryOut
    patterns_over_time: List[str]
    fixed_vs_flexible: FixedVsFlexibleOut
    risk_flags: List[RiskFlagOut]
    recommendations: List[str]
    user_facing_message: str
    metadata: AnalysisMetadataOut


class SpendingTransactionOut(BaseModel):
    id: int
    date: str
    category: str
    amount: float
    currency: str
    payment_method: str
    is_recurring: bool
    description: Optional[str] = None


class SpendingAnalysisHistoryOut(BaseModel):
    id: int
    period_start: str
    period_end: str
    analysis_result: Dict[str, Any]
    created_at: str
