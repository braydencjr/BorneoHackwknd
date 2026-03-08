from fastapi import APIRouter, Depends
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

@router.post("/", response_model=TransactionOut)
async def create_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    result = await categorize_receipt(payload.text)

    category = result["category"]
    total = result["total"]
    transaction_type = result["type"]

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

@router.get("/")
async def get_transactions(db: AsyncSession = Depends(get_db)):

    result = await db.execute(select(Transaction).order_by(Transaction.created_at.desc()))
    transactions = result.scalars().all()

    return transactions