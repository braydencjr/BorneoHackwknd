from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base


class RegionalRiskCache(Base):
    """
    Stores Tavily-scraped + Gemini-parsed regional risk events.
    Shared across all users. One row per article result.
    Refreshed every 24 hours by the regional_risk_service.
    """
    __tablename__ = "regional_risk_cache"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Which Tavily query produced this row
    query_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    # e.g. "illness", "job_loss", "disaster", "war"

    country: Mapped[str] = mapped_column(String(100), nullable=True)
    # e.g. "Malaysia", "ASEAN"

    event_title: Mapped[str] = mapped_column(String(500), nullable=False)
    # Raw title from Tavily result

    event_summary: Mapped[str] = mapped_column(Text, nullable=True)
    # Content snippet from Tavily result

    # --- Gemini-extracted structured fields ---
    severity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 1 (minimal) → 5 (catastrophic)

    financial_impact_category: Mapped[str] = mapped_column(String(100), nullable=True)
    # "medical" | "income" | "property" | "food" | "other"

    time_horizon: Mapped[str] = mapped_column(String(50), nullable=True)
    # "immediate" | "3_months" | "6_months"

    source_url: Mapped[str] = mapped_column(String(1000), nullable=True)
    # Original article URL from Tavily

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    # Used for TTL check: skip rows older than 24h
