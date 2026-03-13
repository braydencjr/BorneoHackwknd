"""
regional_risk_service.py — Phase 3

Fetches real-world crisis news via Tavily Search API, uses Gemini to extract
severity metadata, and caches results in the regional_risk_cache table (24h TTL).

Graceful fallbacks:
  - No TAVILY_API_KEY   → returns empty list (regional risk defaults to "low")
  - Gemini extraction fails → defaults to severity=2, impact="other", horizon="3_months"
  - Tavily search fails → returns whatever is in cache, even if stale
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta

import google.generativeai as genai
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.regional_risk import RegionalRiskCache

logger = logging.getLogger(__name__)

CACHE_TTL_HOURS = 24

# Per-shock-type write locks — prevents concurrent cache-miss writers from
# deadlocking on the DELETE + INSERT pair in MySQL.
_WRITE_LOCKS: dict[str, asyncio.Lock] = {
    "illness":  asyncio.Lock(),
    "job_loss": asyncio.Lock(),
    "disaster": asyncio.Lock(),
    "war":      asyncio.Lock(),
}

# Characters outside MySQL utf8 (3-byte) BMP range, zero-width spaces, BOM, etc.
_ZW_CHARS = {"\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\ufeff", "\u00ad"}


def _sanitize(text: str, maxlen: int = 1000) -> str:
    """
    Strip characters that break MySQL utf8 (non-mb4) columns:
      1. Zero-width / invisible Unicode characters
      2. Any code-point above U+FFFF (4-byte UTF-8; emoji, etc.)
    Then truncate to maxlen.
    """
    # Remove zero-width and invisible chars
    cleaned = "".join(c for c in text if c not in _ZW_CHARS and ord(c) <= 0xFFFF)
    return cleaned[:maxlen]

# One Tavily query per shock type — focused on Malaysia / ASEAN context
QUERY_MAP: dict[str, str] = {
    "illness":  "Malaysia disease outbreak health emergency 2025",
    "job_loss": "Malaysia economic recession unemployment layoffs 2025",
    "disaster": "Malaysia flood banjir disaster 2025",
    "war":      "ASEAN political instability conflict currency Malaysia 2025",
}

# Static fallbacks used when Tavily returns 0 results for a shock type.
# Ensures the frontend always has at least some regional context to display.
STATIC_FALLBACKS: dict[str, list[dict]] = {
    "disaster": [
        {
            "event_title": "Malaysia Monsoon Flood Season 2025–2026",
            "event_summary": (
                "MetMalaysia warns of elevated flood risk in Johor, Pahang, Kelantan "
                "and Terengganu during the North-East Monsoon season (Oct–Mar)."
            ),
            "severity": 3,
            "financial_impact_category": "property",
            "time_horizon": "immediate",
            "source_url": "https://www.met.gov.my",
        },
        {
            "event_title": "NADMA: National Flood Early Warning Advisory",
            "event_summary": (
                "NADMA urges Malaysians in flood-prone zones to maintain 3-month "
                "emergency fund covering food, shelter, and property repair costs."
            ),
            "severity": 3,
            "financial_impact_category": "property",
            "time_horizon": "3_months",
            "source_url": "https://www.nadma.gov.my",
        },
        {
            "event_title": "ASEAN Disaster Risk Reduction 2025",
            "event_summary": (
                "AADMER Partnership highlights that Southeast Asia remains one of the "
                "world's most disaster-prone regions; financial resilience planning is key."
            ),
            "severity": 2,
            "financial_impact_category": "other",
            "time_horizon": "6_months",
            "source_url": "https://www.asean.org/asean-socio-cultural/asean-agreement-on-disaster-management-and-emergency-response/",
        },
    ],
    "illness": [
        {
            "event_title": "Malaysia MOH Dengue Surveillance 2025",
            "event_summary": (
                "MOH Malaysia monitors dengue, HFMD, and influenza clusters in "
                "urban areas ahead of wet season. Health insurance gaps remain a "
                "key household financial vulnerability."
            ),
            "severity": 2,
            "financial_impact_category": "medical",
            "time_horizon": "3_months",
            "source_url": "https://www.moh.gov.my",
        },
    ],
    "job_loss": [
        {
            "event_title": "Malaysia Unemployment Rate Q1 2025",
            "event_summary": (
                "DOSM reports Malaysia unemployment at 3.3% with structural shifts "
                "in manufacturing and digital economy sectors creating sector-specific "
                "layoff risks."
            ),
            "severity": 2,
            "financial_impact_category": "income",
            "time_horizon": "3_months",
            "source_url": "https://www.dosm.gov.my",
        },
    ],
    "war": [
        {
            "event_title": "ASEAN Geopolitical Risk Monitor 2025",
            "event_summary": (
                "Analysts note elevated geopolitical tension in the South China Sea and "
                "broader ASEAN region may exert upward pressure on MYR volatility and "
                "import-driven inflation."
            ),
            "severity": 2,
            "financial_impact_category": "other",
            "time_horizon": "6_months",
            "source_url": "https://www.bnm.gov.my",
        },
    ],
}

_SEVERITY_PROMPT = """\
Given this news article about a potential crisis event in Southeast Asia or Malaysia,
extract ONLY valid JSON — no markdown, no explanation:
{{
  "severity": <1-5 integer; 1=minor local event, 5=catastrophic national/regional crisis>,
  "financial_impact_category": <"medical"|"income"|"property"|"food"|"other">,
  "time_horizon": <"immediate"|"3_months"|"6_months">
}}
Article title: {title}
Article excerpt: {content}"""


async def _extract_severity(title: str, content: str) -> dict:
    """Calls Gemini to score a Tavily article for financial severity and impact category."""
    if not settings.GEMINI_API_KEY:
        return {"severity": 2, "financial_impact_category": "other", "time_horizon": "3_months"}

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("models/gemini-2.5-flash-lite")
    prompt = _SEVERITY_PROMPT.format(title=title[:200], content=content[:500])
    loop = asyncio.get_running_loop()
    try:
        response = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        raw = response.text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Gemini severity extraction failed: %s", exc)
        return {"severity": 2, "financial_impact_category": "other", "time_horizon": "3_months"}


async def fetch_or_refresh_risks(db: AsyncSession, shock_type: str) -> list[dict]:
    """
    Returns regional risk events for the given shock_type.

    1. Fast path: if fresh DB rows exist, return immediately (no lock needed).
    2. Cache miss: acquire a per-shock-type asyncio.Lock, then re-check the cache
       (double-checked locking) so only the first waiter actually calls Tavily.
    3. Writes fresh rows to DB inside the lock, preventing concurrent DELETE+INSERT
       deadlocks on MySQL.
    """
    since = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)

    def _rows_to_dicts(rows: list) -> list[dict]:
        return [
            {
                "event_title":               r.event_title,
                "event_summary":             r.event_summary,
                "severity":                  r.severity,
                "financial_impact_category": r.financial_impact_category,
                "time_horizon":              r.time_horizon,
                "source_url":                r.source_url,
            }
            for r in rows
        ]

    # ── Fast path: fresh cache ────────────────────────────────────────────────
    cached_result = await db.execute(
        select(RegionalRiskCache).where(
            RegionalRiskCache.query_type == shock_type,
            RegionalRiskCache.fetched_at >= since,
        )
    )
    cached = cached_result.scalars().all()
    if cached:
        return _rows_to_dicts(cached)

    # ── Cache miss: serialise writes per shock_type ───────────────────────────
    if not settings.TAVILY_API_KEY:
        return []

    lock = _WRITE_LOCKS.get(shock_type) or asyncio.Lock()
    async with lock:
        # Double-check: another coroutine may have written while we waited
        await db.rollback()          # clear any stale transaction state
        recheck = await db.execute(
            select(RegionalRiskCache).where(
                RegionalRiskCache.query_type == shock_type,
                RegionalRiskCache.fetched_at >= since,
            )
        )
        recached = recheck.scalars().all()
        if recached:
            return _rows_to_dicts(recached)

        # ── Call Tavily ───────────────────────────────────────────────────────
        try:
            from tavily import TavilyClient
            client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            query = QUERY_MAP.get(shock_type, f"Malaysia financial crisis {shock_type} 2025")
            logger.info("Tavily search: shock_type=%s query=%r", shock_type, query)
            loop = asyncio.get_running_loop()
            search_resp = await loop.run_in_executor(
                None, lambda: client.search(query, max_results=5)
            )
            articles = search_resp.get("results", [])
            logger.info("Tavily returned %d articles for shock_type=%s", len(articles), shock_type)
        except Exception as exc:
            logger.exception("Tavily search failed for shock_type=%s: %s", shock_type, exc)
            articles = []

        # ── Static fallback when Tavily returns nothing ───────────────────────
        if not articles:
            fallbacks = STATIC_FALLBACKS.get(shock_type, [])
            if fallbacks:
                logger.warning(
                    "Tavily returned 0 results for shock_type=%s — using %d static fallbacks",
                    shock_type, len(fallbacks),
                )
                return fallbacks
            logger.warning("No articles and no static fallback for shock_type=%s", shock_type)
            return []

        # ── Evict stale rows and write fresh ones ─────────────────────────────
        try:
            await db.execute(
                delete(RegionalRiskCache).where(RegionalRiskCache.query_type == shock_type)
            )

            now = datetime.utcnow()
            fresh_rows: list[dict] = []
            for article in articles:
                title   = _sanitize(article.get("title", ""), 500)
                content = _sanitize(article.get("content", ""), 1000)
                url     = article.get("url", "")
                meta    = await _extract_severity(title, content)

                row = RegionalRiskCache(
                    query_type                = shock_type,
                    country                   = "Malaysia/ASEAN",
                    event_title               = _sanitize(title, 500),
                    event_summary             = _sanitize(content, 1000),
                    severity                  = int(meta.get("severity", 2)),
                    financial_impact_category = _sanitize(meta.get("financial_impact_category", "other"), 50),
                    time_horizon              = _sanitize(meta.get("time_horizon", "3_months"), 50),
                    source_url                = _sanitize(url, 1000),
                    fetched_at                = now,
                )
                db.add(row)
                fresh_rows.append({
                    "event_title":               _sanitize(title, 200),
                    "event_summary":             _sanitize(content, 300),
                    "severity":                  int(meta.get("severity", 2)),
                    "financial_impact_category": meta.get("financial_impact_category", "other"),
                    "time_horizon":              meta.get("time_horizon", "3_months"),
                    "source_url":                url,
                })

            await db.commit()
            return fresh_rows

        except Exception as exc:
            logger.exception("DB write failed for shock_type=%s: %s", shock_type, exc)
            await db.rollback()
            return []
