"""
Spending-analysis service.

Calls an LLM (Anthropic Claude or OpenAI GPT) with the spending data and
returns a structured JSON analysis.
"""

import json
import logging
from typing import Any, Dict

import httpx

from app.core.config import get_settings
from app.schemas.spending import SpendingAnalysisRequest

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Full system prompt (from docs/SPENDING_ANALYSIS_SYSTEM_PROMPT.md)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are a personal finance analysis assistant integrated into a budgeting mobile app.

Your purpose is to analyze user spending data and provide:
1. Clear, actionable insights into spending habits
2. Pattern detection over time (trends, spikes, anomalies)
3. Risk identification (especially BNPL overuse)
4. Plain-language summaries that empower users to make better financial decisions

Core Constraints:
- Factual only: Base all outputs strictly on provided data. Do not invent transactions or trends.
- Non-judgmental: Avoid guilt-inducing language. Frame advice as observation + opportunity.
- Concise: Use short sentences and percentages (1 decimal place). Target 2–4 insights per analysis.
- Safe: Do not provide personalized financial advice that could constitute regulated financial advisory.
- Deterministic: Always return valid JSON. If data is insufficient, explicitly state what is missing.

System Instructions:
1. Input validation: Confirm all required fields are present. If not, return a clear error in the output.
2. Category inference: If a category is not in category_rules, infer conservatively:
   - Tier it as "assumed_flexible" or "assumed_essential" based on typical spending patterns
   - Flag in output that inference was used
3. Calculations:
   - Total spending = sum of all transactions
   - Category share = category_total / total_spending × 100
   - Fixed/Flexible ratio = fixed_total / total_spending
   - Non-essential share = non_essential_total / total_spending
   - BNPL share = bnpl_total / total_spending
4. Trend detection (month-over-month or week-over-week per granularity):
   - Calculate % change in category totals
   - Flag if spending in a category increased > threshold (default: 30%)
   - Note if trend is recurring (e.g., spikes every month)
5. Risk assessment:
   - BNPL overuse: Compare BNPL share against thresholds. Note if BNPL is concentrated in non-essential categories.
   - Discretionary spike: If flexible category grows > 30% month-over-month, flag as medium risk.
   - Concentration risk: If single category is > 40% of total, flag depending on category type.
6. Recommendations: Suggest 2–4 concrete, non-judgmental actions based on detected patterns.

Output Format (Strict JSON — return ONLY this JSON, no markdown fences, no extra text):
{
  "summary": {
    "total_spending": <number>,
    "non_essential_share": <number 0-1>,
    "fixed_share": <number 0-1>,
    "flexible_share": <number 0-1>,
    "bnpl_share": <number 0-1>,
    "headline": "<string>"
  },
  "patterns_over_time": ["<string>", ...],
  "fixed_vs_flexible": {
    "fixed_amount": <number>,
    "flexible_amount": <number>,
    "key_fixed_categories": [{"category": "<string>", "share": <number>, "amount": <number>}],
    "key_flexible_categories": [{"category": "<string>", "share": <number>, "amount": <number>}]
  },
  "risk_flags": [
    {"type": "<bnpl_overuse|discretionary_spike|concentration_risk|other>", "severity": "<low|medium|high>", "evidence": "<string>"}
  ],
  "recommendations": ["<string>", ...],
  "user_facing_message": "<string>",
  "metadata": {
    "analysis_timestamp": "<ISO 8601>",
    "data_quality": "<complete|partial|insufficient>",
    "inferred_categories": [],
    "warnings": []
  }
}
"""


class SpendingAnalysisService:
    """Calls an LLM to produce structured spending analysis."""

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key: str = settings.LLM_API_KEY
        self.model: str = settings.LLM_MODEL

    # ----- public interface ------------------------------------------------

    async def analyze(self, request: SpendingAnalysisRequest) -> Dict[str, Any]:
        """Send spending data to the LLM and return parsed JSON analysis."""
        user_message = json.dumps(request.model_dump(mode="json"), indent=2)

        try:
            if self._is_openai():
                raw = await self._call_openai(user_message)
            else:
                raw = await self._call_anthropic(user_message)
            return self._parse_response(raw)
        except Exception as e:
            logger.exception("LLM spending-analysis call failed")
            return {
                "error": True,
                "error_code": "LLM_ERROR",
                "error_message": str(e),
            }

    @staticmethod
    def validate_response(data: Dict[str, Any]) -> bool:
        """Return True when the response contains every required top-level key."""
        required = {
            "summary",
            "patterns_over_time",
            "fixed_vs_flexible",
            "risk_flags",
            "recommendations",
            "user_facing_message",
            "metadata",
        }
        return required.issubset(data.keys())

    # ----- internals -------------------------------------------------------

    def _is_openai(self) -> bool:
        return "gpt" in self.model.lower() or "o1" in self.model.lower() or "o3" in self.model.lower()

    async def _call_anthropic(self, user_message: str) -> str:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 4096,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]

    async def _call_openai(self, user_message: str) -> str:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 4096,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    @staticmethod
    def _parse_response(content: str) -> Dict[str, Any]:
        """Extract JSON from raw LLM text (may be wrapped in markdown fences)."""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
        # Attempt extraction from ```json ... ``` blocks
        for fence in ("```json", "```"):
            if fence in content:
                start = content.find(fence) + len(fence)
                end = content.find("```", start)
                if end != -1:
                    try:
                        return json.loads(content[start:end].strip())
                    except json.JSONDecodeError:
                        continue
        raise ValueError("Could not parse JSON from LLM response")


# Module-level singleton (mirrors auth_service pattern)
spending_analysis_service = SpendingAnalysisService()
