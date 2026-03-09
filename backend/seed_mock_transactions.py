import asyncio
import random
from datetime import datetime, timedelta
import sys
import os

# Add the backend root to PYTHONPATH so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal, engine, Base
from app.models.transactions import Transaction
from app.models.user import User

async def seed_data():
    async with engine.begin() as conn:
        # Create tables if they don't exist yet
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Check if user 1 exists, if not, create a dummy user
        user = await session.get(User, 1)
        if not user:
            print("Creating dummy user (ID: 1)...")
            user = User(
                id=1,
                email="test_user@example.com",
                hashed_password="dummy_password",
                name="Test User",
                is_active=True
            )
            session.add(user)
            await session.commit()

        # Mock Categories and their standard merchants
        categories = {
            "Food & Dining": ["McDonald's", "Starbucks", "Local Cafe", "Pizza Hut", "Sushi King"],
            "Groceries": ["Jaya Grocer", "Lotus's", "Village Grocer", "AEON", "99 Speedmart"],
            "Transport": ["Grab", "LRT", "Shell Station", "Petronas", "Touch n Go"],
            "Shopping": ["Uniqlo", "H&M", "Shopee", "Lazada", "Zara"],
            "Entertainment": ["Netflix", "Spotify", "GSC Cinemas", "Steam", "TGV"],
            "Utilities": ["TNB", "Air Selangor", "Maxis", "Celcom", "Time Internet"],
            "BNPL (Buy Now Pay Later)": ["SPayLater", "Atome", "Grab PayLater", "ShopBack PayLater"]
        }

        print("Generating mock transactions for the last 30 days...")
        
        now = datetime.utcnow()
        transactions_to_add = []

        # 1. Add some income for the month
        transactions_to_add.append(
            Transaction(
                user_id=1,
                amount=4500.0,
                type="income",
                merchant_name="Employer Inc",
                category="Salary",
                created_at=now - timedelta(days=28),
                receipt_image=""
            )
        )
        transactions_to_add.append(
            Transaction(
                user_id=1,
                amount=500.0,
                type="income",
                merchant_name="Upwork",
                category="Freelance",
                created_at=now - timedelta(days=15),
                receipt_image=""
            )
        )

        # 2. Add daily/random expenses
        for i in range(45): # 45 random expenses
            days_ago = random.randint(0, 30)
            category = random.choice(list(categories.keys()))
            merchant = random.choice(categories[category])
            
            # Weighted random amounts based on category
            if category in ["Groceries", "Utilities"]:
                amount = round(random.uniform(50.0, 300.0), 2)
            elif category == "Shopping":
                amount = round(random.uniform(30.0, 500.0), 2)
            elif category == "BNPL (Buy Now Pay Later)":
                # BNPL payments tend to be specific installment amounts
                amount = round(random.choice([45.50, 89.90, 120.00, 250.00]), 2)
            else: # Food, Transport, Entertainment
                amount = round(random.uniform(5.0, 60.0), 2)

            tx_date = now - timedelta(days=days_ago, hours=random.randint(0, 23))

            transactions_to_add.append(
                Transaction(
                    user_id=1,
                    amount=amount,
                    type="expense",
                    merchant_name=merchant,
                    category=category,
                    created_at=tx_date,
                    receipt_image=""
                )
            )

        session.add_all(transactions_to_add)
        await session.commit()
        print(f"Successfully seeded {len(transactions_to_add)} mock transactions!")

if __name__ == "__main__":
    asyncio.run(seed_data())
