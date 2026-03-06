from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.transactions import Transaction

router = APIRouter(tags=["summary"])


@router.get("/")
async def get_summary(db: AsyncSession = Depends(get_db)):

    result = await db.execute(select(Transaction))
    transactions = result.scalars().all()

    income = 0
    outcome = 0

    for t in transactions:
        if t.category == "Income":
            income += t.amount
        else:
            outcome += t.amount

    total = income + outcome

    percentage = 0
    if total > 0:
        percentage = (income / total) * 100

    return {
        "income": income,
        "outcome": outcome,
        "income_percentage": percentage
    }