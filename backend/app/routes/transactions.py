from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.transactions import TransactionCreate, TransactionOut
from app.repositories.transaction_repository import transaction_repository
from app.services.receipt_ai import categorize_receipt
from app.core.security import get_current_user
from app.models.user import User
from sqlalchemy import select
from app.models.transactions import Transaction

router = APIRouter(tags=["transactions"])


class NotificationTransactionCreate(BaseModel):
    merchant_name: str
    amount: float
    category: str
    type: str  # "income" | "expense"
    description: str = ""


@router.post("/", response_model=TransactionOut)
async def create_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await categorize_receipt(payload.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI categorization failed: {str(e)}")

    category = result.get("category", "Others")
    total = float(result.get("total", 0))
    transaction_type = result.get("type", "expense")

    transaction = await transaction_repository.create(
        db=db,
        user_id=current_user.id,
        merchant_name=payload.merchant_name,
        amount=total,
        category=category,
        type=transaction_type,
        receipt_image=payload.receipt_image,
    )

    return transaction


@router.post("/from-notification")
async def create_from_notification(
    payload: NotificationTransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a transaction from a classified TNG notification (user-confirmed)."""
    transaction = await transaction_repository.create(
        db=db,
        user_id=current_user.id,
        merchant_name=payload.merchant_name,
        amount=payload.amount,
        category=payload.category,
        type=payload.type,
        receipt_image="",
    )
    return transaction


@router.get("/")
async def get_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc())
    )
    transactions = result.scalars().all()
    return transactions