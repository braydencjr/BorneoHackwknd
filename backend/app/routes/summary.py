from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.transactions import Transaction

router = APIRouter(tags=["summary"])


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
        if t.type == "income":          # use the 'type' field, not 'category'
            income += t.amount
        else:
            outcome += abs(t.amount)    # use abs() in case amount is stored as negative

    total = income + outcome

    percentage = round((income / total) * 100, 1) if total > 0 else 0.0

    return {
        "income": income,
        "outcome": outcome,
        "income_percentage": percentage,
    }