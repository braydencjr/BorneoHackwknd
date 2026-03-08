from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.transactions import Transaction
from app.services.suggestion_ai import generate_suggestions

router = APIRouter(tags=["summary"])


# ─── Insights ─────────────────────────────────────────────────────────────

def _compute_insights(s: dict) -> list[dict]:
    """
    Derive meaningful insight cards purely from spending data.
    Types: praise | warning | consequence | tip
    """
    income = s["income"]
    outcome = s["outcome"]
    total = income + outcome
    spend_rate = (outcome / income * 100) if income > 0 else 100

    insights: list[dict] = []

    # 1. Financial health — praise or warning
    if spend_rate < 50:
        insights.append({
            "type": "praise",
            "icon": "🌟",
            "title": "Excellent discipline!",
            "body": (
                f"You only spent {spend_rate:.0f}% of your income this period — "
                "you're well ahead of the recommended 70% limit. Keep it up."
            ),
        })
    elif spend_rate < 75:
        insights.append({
            "type": "praise",
            "icon": "👍",
            "title": "You're doing okay",
            "body": (
                f"Spending at {spend_rate:.0f}% of income is manageable, "
                "but try pushing it below 70% to give yourself a real safety net."
            ),
        })
    elif spend_rate < 100:
        insights.append({
            "type": "warning",
            "icon": "⚠️",
            "title": "High spending alert",
            "body": (
                f"You spent {spend_rate:.0f}% of your income — barely any left over. "
                "One unexpected bill could push you into the red."
            ),
        })
    else:
        insights.append({
            "type": "consequence",
            "icon": "🚨",
            "title": "You're spending more than you earn",
            "body": (
                f"Your expenses exceeded income by RM{(outcome - income):.2f}. "
                "This is being covered by savings or credit — which won't last."
            ),
        })

    # 2. Savings projection
    monthly_net = income - outcome
    if monthly_net >= 0:
        annual = monthly_net * 12
        insights.append({
            "type": "praise",
            "icon": "📈",
            "title": f"RM{monthly_net:.2f} saved this period",
            "body": (
                f"At this rate you'd save RM{annual:.0f} a year. "
                "Even putting half into a fixed deposit grows significantly over time."
            ),
        })
    else:
        shortfall = abs(monthly_net)
        insights.append({
            "type": "consequence",
            "icon": "📉",
            "title": "Losing money each month",
            "body": (
                f"You're RM{shortfall:.2f} short this period. "
                "If this continues for 6 months, that's RM{shortfall * 6:.0f} drawn from savings or credit."
            ),
        })

    # 3. Top category deep-dive
    if s.get("top_category") and income > 0:
        cat = s["top_category"]
        amt = s["top_category_amount"]
        pct = (amt / income) * 100
        insights.append({
            "type": "tip",
            "icon": "🔍",
            "title": f"{cat} is your biggest expense",
            "body": (
                f"You spent RM{amt:.2f} on {cat} — {pct:.0f}% of your income. "
                f"Cutting that by 20% saves RM{amt * 0.20:.2f} per month."
            ),
        })

    # 4. Transaction frequency
    count = s.get("transaction_count", 0)
    period = s.get("period_days", 30)
    if count > 0:
        per_day = count / period
        insights.append({
            "type": "tip",
            "icon": "🧾",
            "title": f"{count} transactions in {period} days",
            "body": (
                f"That's {per_day:.1f} transactions a day. "
                "More frequent buyers tend to overspend on small impulse purchases — "
                "try batching purchases to once a day."
                if per_day >= 2 else
                f"That's {per_day:.1f} per day — a well-controlled pace. "
                "Stay aware of where each one goes."
            ),
        })

    return insights


# ─── Helper ────────────────────────────────────────────────────────────────

async def _build_spending_summary(db: AsyncSession, user: User, days: int = 30) -> dict:
    """Aggregate transaction data for the last `days` days."""
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.created_at >= since,
        )
    )
    transactions = result.scalars().all()

    income = 0.0
    outcome = 0.0
    by_category: dict[str, float] = {}
    merchant_counts: dict[str, int] = {}

    for t in transactions:
        if t.type == "income":
            income += t.amount
        else:
            outcome += abs(t.amount)
            by_category[t.category] = by_category.get(t.category, 0) + abs(t.amount)

        if t.merchant_name:
            merchant_counts[t.merchant_name] = merchant_counts.get(t.merchant_name, 0) + 1

    top_merchant = max(merchant_counts, key=merchant_counts.get) if merchant_counts else None

    return {
        "income": income,
        "outcome": outcome,
        "by_category": by_category,
        "top_merchant": top_merchant,
        "period_days": days,
        "transaction_count": len(transactions),
    }


# ─── Routes ────────────────────────────────────────────────────────────────

@router.get("/")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(Transaction.user_id == current_user.id)
    )
    transactions = result.scalars().all()

    income = 0.0
    outcome = 0.0

    for t in transactions:
        if t.type == "income":
            income += t.amount
        else:
            outcome += abs(t.amount)

    total = income + outcome
    percentage = round((income / total) * 100, 1) if total > 0 else 0.0

    return {
        "income": income,
        "outcome": outcome,
        "income_percentage": percentage,
    }


@router.get("/suggestions")
async def get_suggestions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a daily financial report as 5 AI-generated suggestion cards.
    Each card: { title, body, icon, color }
    Also returns the spending summary for the header card.
    """
    summary = await _build_spending_summary(db, current_user, days=30)
    cards = await generate_suggestions(summary)
    insights = _compute_insights({
        **summary,
        "top_category": max(summary["by_category"], key=summary["by_category"].get)
            if summary["by_category"] else None,
        "top_category_amount": max(summary["by_category"].values())
            if summary["by_category"] else 0,
    })

    return {
        "summary": {
            "income": summary["income"],
            "outcome": summary["outcome"],
            "top_category": max(summary["by_category"], key=summary["by_category"].get)
                if summary["by_category"] else None,
            "top_category_amount": max(summary["by_category"].values())
                if summary["by_category"] else 0,
            "transaction_count": summary["transaction_count"],
            "period_days": summary["period_days"],
        },
        "cards": cards,
        "insights": insights,
    }