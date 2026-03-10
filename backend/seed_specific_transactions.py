import asyncio
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal, engine, Base
from app.models.transactions import Transaction
from app.models.user import User
from sqlalchemy import text


ROWS = [
    (1,  1, 3800.0, "income",   "Employer",        "Salary",         "2025-12-09 17:09:49"),
    (2,  1,  820.0, "expense",  "Grab Food",        "Food",           "2025-12-11 17:09:49"),
    (3,  1,  480.0, "expense",  "KPJ Hospital",     "Health",         "2025-12-12 17:09:49"),
    (4,  1,  280.0, "expense",  "TNB",              "Utilities",      "2025-12-13 17:09:49"),
    (5,  1,  220.0, "expense",  "Touch n Go",       "Transport",      "2025-12-14 17:09:49"),
    (6,  1,  350.0, "expense",  "Shopee",           "Shopping",       "2025-12-15 17:09:49"),
    (7,  1,  150.0, "expense",  "Netflix",          "Entertainment",  "2025-12-16 17:09:49"),
    (8,  1, 2900.0, "income",   "Employer",         "Salary",         "2026-01-08 17:09:49"),
    (9,  1,  750.0, "expense",  "Grab Food",        "Food",           "2026-01-10 17:09:49"),
    (10, 1,  520.0, "expense",  "Pantai Hospital",  "Health",         "2026-01-11 17:09:49"),
    (11, 1,  280.0, "expense",  "TNB",              "Utilities",      "2026-01-12 17:09:49"),
    (12, 1,  210.0, "expense",  "Touch n Go",       "Transport",      "2026-01-13 17:09:49"),
    (13, 1,  120.0, "expense",  "GSC Cinema",       "Entertainment",  "2026-01-14 17:09:49"),
    (14, 1, 3200.0, "income",   "Employer",         "Salary",         "2026-02-07 17:09:49"),
    (15, 1,  800.0, "expense",  "Grab Food",        "Food",           "2026-02-09 17:09:49"),
    (16, 1,  410.0, "expense",  "Columbia Asia",    "Health",         "2026-02-10 17:09:49"),
    (17, 1,  280.0, "expense",  "TNB",              "Utilities",      "2026-02-11 17:09:49"),
    (18, 1,  230.0, "expense",  "Touch n Go",       "Transport",      "2026-02-12 17:09:49"),
    (19, 1,  200.0, "expense",  "Lazada",           "Shopping",       "2026-02-13 17:09:49"),
    (20, 1,   90.0, "expense",  "Spotify",          "Entertainment",  "2026-02-14 17:09:49"),
    (21, 1,  214.9, "expense",  "Receipt",          "Utilities",      "2026-03-10 12:32:28"),
    (22, 1,  214.9, "expense",  "Receipt",          "Utilities",      "2026-03-10 12:32:40"),
    (23, 1,  200.0, "savings",  "Emergency Fund",   "Emergency Fund", "2026-03-10 16:32:06"),
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Ensure users 1 and 2 exist
        for uid, email, name in [
            (1, "user1@example.com", "User One"),
            (2, "user2@example.com", "User Two"),
        ]:
            u = await session.get(User, uid)
            if not u:
                print(f"Creating placeholder user {uid}...")
                session.add(User(
                    id=uid, email=email, hashed_password="dummy",
                    name=name, is_active=True,
                ))
        await session.commit()

        # Delete any existing rows with these IDs to avoid conflicts
        await session.execute(text("DELETE FROM transactions WHERE id BETWEEN 1 AND 23"))
        await session.commit()

        for (id_, uid, amt, typ, merchant, cat, ts) in ROWS:
            session.add(Transaction(
                id=id_,
                user_id=uid,
                amount=amt,
                type=typ,
                merchant_name=merchant,
                category=cat,
                created_at=datetime.strptime(ts, "%Y-%m-%d %H:%M:%S"),
                receipt_image="",
            ))
        await session.commit()
        print(f"Done. Inserted {len(ROWS)} rows into 'transactions'.")


if __name__ == "__main__":
    asyncio.run(seed())
