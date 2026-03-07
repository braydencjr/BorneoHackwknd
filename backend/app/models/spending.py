import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    BNPL = "bnpl"
    TRANSFER = "transfer"
    OTHER = "other"


class SpendingTransaction(Base):
    """Individual spending transaction linked to a user."""

    __tablename__ = "spending_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), index=True, nullable=False
    )
    date: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SpendingAnalysis(Base):
    """Cached LLM spending-analysis result for a user + period."""

    __tablename__ = "spending_analyses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), index=True, nullable=False
    )
    period_start: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    analysis_result: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
