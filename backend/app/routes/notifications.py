from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.repositories.transaction_repository import transaction_repository
from app.services.notification_ai import classify_notification

router = APIRouter(tags=["notifications"])


class NotificationClassifyRequest(BaseModel):
    title: str
    text: str


class NotificationClassifyResponse(BaseModel):
    classification: str  # "general" | "outgoing_payment" | "incoming_money"
    merchant_name: str | None = None
    amount: float | None = None
    category: str | None = None
    description: str | None = None
    recorded: bool = False


@router.post("/classify", response_model=NotificationClassifyResponse)
async def classify_notification_endpoint(
    payload: NotificationClassifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Classify a TNG eWallet notification using Gemini AI.
    If it's an outgoing payment or incoming money, automatically record
    it as a transaction.
    """
    try:
        result = await classify_notification(payload.title, payload.text)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"AI classification failed: {str(e)}"
        )

    classification = result["classification"]

    if classification == "general":
        return NotificationClassifyResponse(
            classification="general",
            recorded=False,
        )

    amount = result.get("amount") or 0.0
    merchant_name = result.get("merchant_name") or "TNG eWallet"
    category = result.get("category") or "Others"
    description = result.get("description") or ""
    transaction_type = "expense" if classification == "outgoing_payment" else "income"

    await transaction_repository.create(
        db=db,
        user_id=current_user.id,
        merchant_name=merchant_name,
        amount=amount,
        category=category,
        type=transaction_type,
        receipt_image="",
    )

    return NotificationClassifyResponse(
        classification=classification,
        merchant_name=merchant_name,
        amount=amount,
        category=category,
        description=description,
        recorded=True,
    )
