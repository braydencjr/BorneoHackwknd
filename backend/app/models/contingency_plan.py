from sqlalchemy import String, Float, Integer, ForeignKey, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from app.core.database import Base


class ContingencyPlan(Base):
    """
    One row per user. Stores the computed personalised contingency plan.
    Recalculated on demand (or when stale > 24h) by contingency_service.
    """
    __tablename__ = "contingency_plans"

    # Enforce one plan per user at the DB level
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_contingency_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    # --- Fund target ---
    target_months: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)
    # Computed: base 3 months + indicator bonuses, capped at 12
    target_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # target_months × avg_monthly_expense in RM

    # --- Current progress (user-reported via PATCH /progress) ---
    current_progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # RM amount the user has already saved toward the fund

    # --- Saving plan ---
    monthly_savings_target: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Recommended RM to save per month
    weekly_savings_target: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # monthly_savings_target / 4.33
    one_time_suggestion: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Optional one-time top-up if income spike detected

    # --- Indicator snapshot (JSON list of fired indicators) ---
    # e.g. [{"name": "health_exposure_high", "score": 0.8, "extra_months": 2.0}]
    active_indicators: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # --- Risk context ---
    regional_risk_level: Mapped[str] = mapped_column(
        String(20), nullable=False, default="low"
    )
    # "low" | "medium" | "high" — derived from max Tavily severity

    # --- Cached baseline values used during last calculation ---
    avg_monthly_expense: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    surplus: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # income - expenses at time of last calculation

    # --- Staleness control ---
    last_calculated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    # If now() - last_calculated_at > 24h → trigger recalculation

    # Relationship back to User (read-only, no cascade)
    user = relationship("User")
