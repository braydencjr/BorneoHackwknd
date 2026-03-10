from typing import Dict, List


async def generate_suggestions(summary: Dict) -> List[Dict]:
    """Generate 5 lightweight suggestion cards from a spending summary.

    This is a minimal, deterministic implementation used when the AI
    service is unavailable. Each card contains: title, body, icon, color.
    """
    income = summary.get("income", 0.0)
    outcome = summary.get("outcome", 0.0)
    top_category = summary.get("top_category") or "your top category"
    top_category_amount = summary.get("top_category_amount", 0.0)

    # Avoid division by zero
    spend_rate = (outcome / income * 100) if income > 0 else 100.0

    cards: List[Dict] = []

    cards.append({
        "title": "Quick snapshot",
        "body": f"You spent RM{outcome:.2f} this period ({spend_rate:.0f}% of income).",
        "icon": "📊",
        "color": "#4F46E5",
    })

    cards.append({
        "title": "Top spending area",
        "body": (
            f"{top_category} is your largest expense at RM{top_category_amount:.2f}. "
            "Try trimming non-essential items there by 10–20%."
        ),
        "icon": "🔍",
        "color": "#0EA5A4",
    })

    cards.append({
        "title": "Build a small buffer",
        "body": (
            "Aim to set aside RM50–RM200 this month for emergencies. "
            "Small, regular contributions compound quickly."
        ),
        "icon": "🛡️",
        "color": "#F59E0B",
    })

    cards.append({
        "title": "Reduce merchant friction",
        "body": (
            "If you notice repeated small purchases, try batching them or using a shopping list."
        ),
        "icon": "🧾",
        "color": "#EF4444",
    })

    cards.append({
        "title": "Weekly goal",
        "body": (
            "Set a weekly spending limit and check in every 7 days — consistent review helps."
        ),
        "icon": "✅",
        "color": "#10B981",
    })

    return cards
