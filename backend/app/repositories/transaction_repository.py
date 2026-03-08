from sqlalchemy.ext.asyncio import AsyncSession
from app.models.transactions import Transaction


class TransactionRepository:

    async def create(
        self,
        db: AsyncSession,
        user_id: int,
        merchant_name: str,
        amount: float,
        category: str,
        type: str,
        receipt_image: str,
    ) -> Transaction:

        transaction = Transaction(
            user_id=user_id,
            merchant_name=merchant_name,
            amount=amount,
            category=category,
            type=type,
            receipt_image=receipt_image,
        )

        db.add(transaction)
        await db.commit()          # ← was only flush(), now properly committed
        await db.refresh(transaction)

        return transaction


transaction_repository = TransactionRepository()