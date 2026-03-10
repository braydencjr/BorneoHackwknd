import asyncio
import json
import google.generativeai as genai
from app.core.config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GEMINI_API_KEY)

# Fallback cards if Gemini fails
_FALLBACK = [
    {
        "title": "Track your spending",
        "body": "Log every transaction this week so you can see where your money actually goes.",
        "icon": "📊",
        "color": "#1E3A8A",
        "detail": "Open this app after every purchase and scan your receipt immediately.",
    },
    {
        "title": "Set a weekly limit",
        "body": "Pick your top spending category and cap it 20% lower than last week.",
        "icon": "🎯",
        "color": "#065F46",
        "detail": "Decide your cap now and set a phone reminder to check it mid-week.",
    },
    {
        "title": "Check subscriptions",
        "body": "List every recurring charge. Cancel any you haven't used in 30 days.",
        "icon": "🔄",
        "color": "#92400E",
        "detail": "Go to your bank app and filter by recurring payments to spot them quickly.",
    },
    {
        "title": "Pay yourself first",
        "body": "Move at least 10% of any income to savings before spending anything.",
        "icon": "💰",
        "color": "#4C1D95",
        "detail": "Set up an auto-transfer to your savings account on the day you get paid.",
    },
    {
        "title": "Review tomorrow",
        "body": "Come back after adding more receipts for sharper, more personalised advice.",
        "icon": "📅",
        "color": "#7F1D1D",
        "detail": "Scan at least 3 receipts today so tomorrow's report is based on your real data.",
    },
]


async def generate_suggestions(spending_summary: dict) -> list[dict]:
    """
    spending_summary shape:
    {
      "income": 2500.0,
      "outcome": 1800.0,
      "by_category": { "Food": 450.0, "Transport": 120.0, ... },
      "top_merchant": "McDonald's",
      "period_days": 30
    }
    Returns a list of 5 dicts: { title, body, icon, color }
    """
    categories = spending_summary.get("by_category", {})
    income = spending_summary.get("income", 0)
    outcome = spending_summary.get("outcome", 0)
    period = spending_summary.get("period_days", 30)

    if not categories and income == 0 and outcome == 0:
        return _FALLBACK

    cat_lines = "\n".join(
        f"  - {cat}: RM{amt:.2f}" for cat, amt in sorted(categories.items(), key=lambda x: -x[1])
    )

    prompt = f"""You are a concise, no-nonsense personal finance coach.

Here is the user's last {period} days of financial data:
- Total income: RM{income:.2f}
- Total spending: RM{outcome:.2f}
- Spending by category:
{cat_lines}

Generate exactly 5 short financial suggestion cards for this specific person.
Rules:
- body: 1-2 sentences max. Reference their actual numbers. Be direct, not generic.
- detail: 1 short sentence — one concrete action they can do TODAY.
- title: 3-5 words max.
- icon: a single relevant emoji.
- color: one of these hex codes only: #1E3A8A, #065F46, #92400E, #4C1D95, #9D174D

Return ONLY valid JSON array, no markdown, no explanation:
[
  {{"title": "...", "body": "...", "icon": "...", "color": "...", "detail": "..."}},
  {{"title": "...", "body": "...", "icon": "...", "color": "...", "detail": "..."}},
  {{"title": "...", "body": "...", "icon": "...", "color": "...", "detail": "..."}},
  {{"title": "...", "body": "...", "icon": "...", "color": "...", "detail": "..."}},
  {{"title": "...", "body": "...", "icon": "...", "color": "...", "detail": "..."}}
]"""

    try:
        model = genai.GenerativeModel("models/gemini-2.5-flash")
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: model.generate_content(prompt)
        )

        clean = response.text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        parsed = json.loads(clean)

        # Validate: must be a list of 5 dicts with required keys
        valid = []
        required = {"title", "body", "icon", "color"}
        for item in parsed:
            if isinstance(item, dict) and required.issubset(item.keys()):
                valid.append({
                    "title": str(item["title"]),
                    "body": str(item["body"]),
                    "icon": str(item["icon"]),
                    "color": str(item["color"]),
                    "detail": str(item.get("detail", "")),
                })
        if len(valid) >= 3:
            return valid[:5]
        return _FALLBACK

    except Exception as e:
        print(f"[suggestion_ai] Gemini error: {e}")
        return _FALLBACK
