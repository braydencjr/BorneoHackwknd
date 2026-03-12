"""
regional_risk_service.py — Phase 3

Fetches real-world crisis news via Tavily Search API (if key present) or
Google Search, uses Gemini to extract severity
metadata, and caches results in the regional_risk_cache table (24h TTL).

Graceful fallbacks:
  - TAVILY_API_KEY set   → Tavily search → static fallbacks if 0 results
  - No TAVILY_API_KEY    → Google Search → static fallbacks if 0 results
  - Gemini extraction fails → defaults to severity=2, impact="other", horizon="3_months"
  - All searches fail   → static fallbacks always ensure cards are shown
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
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

# Multiple targeted queries per shock type — different states/events so results are varied.
# DuckDuckGo is called once per query and results are deduplicated by URL.
QUERY_MAP: dict[str, list[str]] = {
    "illness": [
        "tuberculosis TB infection outbreak Malaysia 2025 2026",
        "leptospirosis bacterial infection Malaysia Sabah Sarawak 2025 2026",
        "cholera typhoid waterborne disease outbreak ASEAN Southeast Asia 2026",
        "hepatitis A B outbreak Malaysia Singapore Indonesia 2025 2026",
        "antibiotic resistant infection superbug Malaysia hospital 2025 2026",
    ],
    "job_loss": [
        "factory retrenchment layoffs Penang Selangor Malaysia 2025 2026",
        "unemployment graduates Kuala Lumpur Malaysia 2026",
        "company closure retrenchment Johor Malaysia 2025",
        "economic slowdown job loss Sabah Sarawak Malaysia 2025",
        "ASEAN Indonesia Thailand unemployment layoffs 2025 2026",
    ],
    "disaster": [
        "flood banjir Johor Pahang Malaysia 2025 2026",
        "flood banjir Kelantan Terengganu Malaysia 2025 2026",
        "landslide flood Selangor Kuala Lumpur Malaysia 2025 2026",
        "flood disaster Sabah Sarawak Malaysia 2025",
        "typhoon earthquake Philippines Indonesia ASEAN 2025 2026",
    ],
    "war": [
        "South China Sea Malaysia territorial dispute tension 2025 2026",
        "Myanmar civil war conflict ASEAN impact 2025 2026",
        "geopolitical risk MYR ringgit currency Malaysia 2025 2026",
        "Russia Ukraine war impact Malaysia inflation 2025",
        "ASEAN military conflict tension security 2025 2026",
    ],
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
You are analyzing a news article about a crisis event in Southeast Asia (ASEAN).
Extract ONLY valid JSON — no markdown, no explanation:
{{
  "event_title": <concise label: "EventType, City/Country" e.g. "Flood, Johor" or "Dengue Outbreak: Bangkok" or "Factory Layoffs, Penang" — max 60 chars, must include location>,
  "severity": <1-5 integer; 1=minor local, 5=catastrophic national/regional>,
  "financial_impact_category": <"medical"|"income"|"property"|"food"|"other">,
  "time_horizon": <"immediate"|"3_months"|"6_months">
}}
Article title: {title}
Article excerpt: {content}"""


async def _tavily_search(shock_type: str, max_results: int = 5) -> list[dict]:
    """Call Tavily Search API and return raw article dicts {title, content, url}."""
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=settings.TAVILY_API_KEY)
        queries = QUERY_MAP.get(shock_type, [f"Malaysia ASEAN {shock_type} crisis 2025"])
        query = queries[0]  # Tavily: use the most specific first query
        logger.info("Tavily search: shock_type=%s query=%r", shock_type, query)
        loop = asyncio.get_running_loop()
        search_resp = await loop.run_in_executor(
            None, lambda: client.search(query, max_results=max_results)
        )
        articles = search_resp.get("results", [])
        logger.info("Tavily returned %d articles for shock_type=%s", len(articles), shock_type)
        return articles
    except Exception as exc:
        logger.exception("Tavily search failed for shock_type=%s: %s", shock_type, exc)
        return []


async def _google_search_web(shock_type: str, max_results: int = 5) -> list[dict]:
    """
    Fan out across multiple targeted DuckDuckGo queries, take 1-2 results each,
    deduplicate by URL, and return up to max_results diverse articles.
    """
    from ddgs import DDGS

    queries: list[str] = QUERY_MAP.get(shock_type, [f"ASEAN {shock_type} crisis 2025"])
    loop = asyncio.get_running_loop()
    seen_urls: set[str] = set()
    combined: list[dict] = []

    def _fetch_one(q: str) -> list[dict]:
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(q, max_results=2))
        except Exception:
            return []

    for query in queries:
        if len(combined) >= max_results:
            break
        try:
            raw = await loop.run_in_executor(None, _fetch_one, query)
            for r in raw:
                url   = (r.get("href") or "").strip()
                title = (r.get("title") or "").strip()
                body  = re.sub(r"<[^>]+>", "", (r.get("body") or "")).strip()
                if title and url and url not in seen_urls:
                    seen_urls.add(url)
                    combined.append({"title": title, "url": url, "content": body})
                    if len(combined) >= max_results:
                        break
        except Exception as exc:
            logger.warning("DuckDuckGo query failed (shock=%s query=%r): %s", shock_type, query, exc)

    logger.info(
        "DuckDuckGo search returned %d unique results for shock_type=%s",
        len(combined), shock_type,
    )
    return combined


async def _extract_severity(title: str, content: str) -> dict:
    """Calls Gemini to score a news article and produce a concise ASEAN-style title."""
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

        # ── Choose search source: Tavily (if key set) or Google News (free) ──
        if settings.TAVILY_API_KEY:
            articles = await _tavily_search(shock_type)
        else:
            logger.info(
                "No TAVILY_API_KEY — falling back to Google Search for shock_type=%s",
                shock_type,
            )
            articles = await _google_search_web(shock_type)

        # ── Static fallback when all searches return nothing ──────────────────
        if not articles:
            fallbacks = STATIC_FALLBACKS.get(shock_type, [])
            if fallbacks:
                logger.warning(
                    "Search returned 0 results for shock_type=%s — using %d static fallbacks",
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
                raw_title = _sanitize(article.get("title", ""), 500)
                content   = _sanitize(article.get("content", ""), 1000)
                url       = article.get("url", "")
                meta      = await _extract_severity(raw_title, content)

                # Use the Gemini-formatted concise title (e.g. "Flood, Johor")
                # fall back to the raw Google title if Gemini didn't produce one
                display_title = _sanitize(meta.get("event_title") or raw_title, 500)

                row = RegionalRiskCache(
                    query_type                = shock_type,
                    country                   = "ASEAN",
                    event_title               = display_title,
                    event_summary             = _sanitize(content, 1000),
                    severity                  = int(meta.get("severity", 2)),
                    financial_impact_category = _sanitize(meta.get("financial_impact_category", "other"), 50),
                    time_horizon              = _sanitize(meta.get("time_horizon", "3_months"), 50),
                    source_url                = _sanitize(url, 1000),
                    fetched_at                = now,
                )
                db.add(row)
                fresh_rows.append({
                    "event_title":               _sanitize(display_title, 200),
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
