from pydantic import BaseModel
from datetime import datetime

class TransactionCreate(BaseModel):
    merchant_name: str
    receipt_image: str
    text: str


class TransactionOut(BaseModel):
    id: int
    merchant_name: str
    amount: float
    type: str
    category: str
    receipt_image: str
    created_at: datetime

    class Config:
        from_attributes = True