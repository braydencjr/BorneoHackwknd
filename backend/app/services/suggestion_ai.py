import json
from google import genai
from app.core.config import get_settings

settings = get_settings()
client = genai.Client(api_key=settings.GEMINI_API_KEY)

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
    outcome = spending_summary.get("outcome", 0)
    period = spending_summary.get("period_days", 30)
    monthly_outcome = spending_summary.get("monthly_outcome", [])
    fixed_expense = spending_summary.get("fixed_expense", 0)
    flexible_expense = spending_summary.get("flexible_expense", 0)
    fixed_pct = spending_summary.get("fixed_expense_pct", 0)
    flexible_pct = spending_summary.get("flexible_expense_pct", 0)
    bnpl_expense = spending_summary.get("bnpl_expense", 0)
    bnpl_count = spending_summary.get("bnpl_count", 0)
    bnpl_pct = spending_summary.get("bnpl_expense_pct", 0)

    if not categories and outcome == 0:
        return _FALLBACK

    cat_lines = "\n".join(
        f"  - {cat}: RM{amt:.2f}" for cat, amt in sorted(categories.items(), key=lambda x: -x[1])
    )

    monthly_lines = "\n".join(
        f"  - {item['month']}: RM{float(item['amount']):.2f}" for item in monthly_outcome
    ) or "  - No monthly trend available"

    prompt = f"""You are a concise, no-nonsense personal finance coach.

Here is the user's last {period} days of financial data:
- Total spending: RM{outcome:.2f}
- Monthly spending trend (latest months):
{monthly_lines}
- Spending by category:
{cat_lines}
- Fixed expenses: RM{fixed_expense:.2f} ({fixed_pct:.1f}%)
- Flexible expenses: RM{flexible_expense:.2f} ({flexible_pct:.1f}%)
- BNPL/deferred-payment spending: RM{bnpl_expense:.2f} across {bnpl_count} transaction(s) ({bnpl_pct:.1f}%)

Generate exactly 5 short financial suggestion cards for this specific person.
Card focus rules:
- Card 1 MUST analyze spending pattern over time using the monthly trend.
- Card 2 MUST analyze fixed vs flexible expense structure.
- Card 3 MUST highlight high-risk behavior, especially BNPL/deferred payments when present.
- Card 4 and 5 can be additional spending behavior insights.
- Do not use income-based ratio framing (for example, do not say "X% of income"). Focus on spending behavior and risk patterns.
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
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash", contents=prompt
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
