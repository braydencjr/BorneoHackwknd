"""
seed_transactions.py
--------------------
One-time script to insert realistic test transactions directly into the DB
for a specific user — bypasses the API (no Gemini call needed).

Usage (run from backend/ folder with venv active):
    python seed_transactions.py --email your@email.com

If you don't know your email, run with --list to see all users:
    python seed_transactions.py --list
"""

import asyncio
import sys

# Windows: ProactorEventLoop breaks SSL + aiomysql — must switch before any DB call
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import argparse
from datetime import datetime, timedelta

# Must be run from backend/ so these imports resolve
from app.core.database import AsyncSessionLocal, create_tables
import app.models  # noqa: registers all ORM models
from app.models.user import User
from app.models.transactions import Transaction
from sqlalchemy import select


# ─── Seed data ────────────────────────────────────────────────────────────────
# 3 months of transactions — varied so ALL 5 indicators get a chance to fire.
#
# Indicator targets:
#   health_exposure_high  → Health spend > 10% of total expenses
#   single_income_source  → Only 1 income per month
#   high_fixed_costs      → Utilities + Health + Transport > 40% of expenses
#   irregular_income      → Income varies > 30% month-to-month
#   near_zero_surplus     → NOT triggered here (surplus ~40%) — healthy user

# Month offsets from today (negative = in the past)
def months_ago(months: int, day: int = 15) -> datetime:
    base = datetime.utcnow().replace(day=1)
    # Go back 'months' months
    for _ in range(months):
        base = (base - timedelta(days=1)).replace(day=1)
    return base.replace(day=day, hour=10, minute=0, second=0, microsecond=0)


SEED_TRANSACTIONS = [
    # ── Month 3 ago ─────────────────────────────────────────────────────────
    # Income: RM 3,800 (highest month — tests irregular_income)
    {"type": "income",   "amount": 3800.0, "category": "Salary",      "merchant_name": "Employer",        "days_ago": 90},
    # Expenses
    {"type": "expense",  "amount": 820.0,  "category": "Food",         "merchant_name": "Grab Food",       "days_ago": 88},
    {"type": "expense",  "amount": 480.0,  "category": "Health",       "merchant_name": "KPJ Hospital",    "days_ago": 87},
    {"type": "expense",  "amount": 280.0,  "category": "Utilities",    "merchant_name": "TNB",             "days_ago": 86},
    {"type": "expense",  "amount": 220.0,  "category": "Transport",    "merchant_name": "Touch n Go",      "days_ago": 85},
    {"type": "expense",  "amount": 350.0,  "category": "Shopping",     "merchant_name": "Shopee",          "days_ago": 84},
    {"type": "expense",  "amount": 150.0,  "category": "Entertainment","merchant_name": "Netflix",         "days_ago": 83},

    # ── Month 2 ago ─────────────────────────────────────────────────────────
    # Income: RM 2,900 (dip — tests irregular_income, std dev widens)
    {"type": "income",   "amount": 2900.0, "category": "Salary",       "merchant_name": "Employer",        "days_ago": 60},
    # Expenses
    {"type": "expense",  "amount": 750.0,  "category": "Food",         "merchant_name": "Grab Food",       "days_ago": 58},
    {"type": "expense",  "amount": 520.0,  "category": "Health",       "merchant_name": "Pantai Hospital", "days_ago": 57},
    {"type": "expense",  "amount": 280.0,  "category": "Utilities",    "merchant_name": "TNB",             "days_ago": 56},
    {"type": "expense",  "amount": 210.0,  "category": "Transport",    "merchant_name": "Touch n Go",      "days_ago": 55},
    {"type": "expense",  "amount": 120.0,  "category": "Entertainment","merchant_name": "GSC Cinema",      "days_ago": 54},

    # ── Month 1 ago (most recent) ────────────────────────────────────────────
    # Income: RM 3,200 (middle value)
    {"type": "income",   "amount": 3200.0, "category": "Salary",       "merchant_name": "Employer",        "days_ago": 30},
    # Expenses
    {"type": "expense",  "amount": 800.0,  "category": "Food",         "merchant_name": "Grab Food",       "days_ago": 28},
    {"type": "expense",  "amount": 410.0,  "category": "Health",       "merchant_name": "Columbia Asia",   "days_ago": 27},
    {"type": "expense",  "amount": 280.0,  "category": "Utilities",    "merchant_name": "TNB",             "days_ago": 26},
    {"type": "expense",  "amount": 230.0,  "category": "Transport",    "merchant_name": "Touch n Go",      "days_ago": 25},
    {"type": "expense",  "amount": 200.0,  "category": "Shopping",     "merchant_name": "Lazada",          "days_ago": 24},
    {"type": "expense",  "amount": 90.0,   "category": "Entertainment","merchant_name": "Spotify",         "days_ago": 23},
]

# ─── Expected indicator outcomes (printed after seeding so you can verify) ───
EXPECTED = """
Expected indicator outcomes after seeding:
  ✓ health_exposure_high  → Health total ~RM1410 / total expense ~RM5390 = ~26% > 10% threshold
  ✓ single_income_source  → 1 income transaction per month (3/3 months covered = 100%, but only 1 source)
  ✓ high_fixed_costs      → (Health+Utilities+Transport) ~RM2700 / ~RM5390 = ~50% > 40% threshold
  ✗ near_zero_surplus     → Surplus ~RM3300 / ~RM9900 income = ~33% — healthy (won't fire)
  ✓ irregular_income      → Income: 3800, 2900, 3200 → std_dev/mean = ~15% — may NOT fire (need >30%)
                            (Run with --spike to add a RM6000 spike month for stronger variance)
"""


# ─── Main ─────────────────────────────────────────────────────────────────────

async def list_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        if not users:
            print("No users found. Register via the app first.")
            return
        print("\nRegistered users:")
        for u in users:
            print(f"  id={u.id}  email={u.email}  name={u.full_name}")


async def seed(email: str, add_spike: bool = False):
    async with AsyncSessionLocal() as db:
        # Find user
        result = await db.execute(select(User).where(User.email == email))
        user: User | None = result.scalar_one_or_none()
        if user is None:
            print(f"ERROR: No user found with email '{email}'")
            print("Run with --list to see registered users.")
            sys.exit(1)

        print(f"\nSeeding transactions for: {user.name} (id={user.id})")

        # Check existing count
        existing = await db.execute(
            select(Transaction).where(Transaction.user_id == user.id)
        )
        count = len(existing.scalars().all())
        if count > 0:
            print(f"  User already has {count} transactions.")
            confirm = input("  Add seed data on top? [y/N]: ").strip().lower()
            if confirm != "y":
                print("Aborted.")
                return

        # Optionally add a spike month for irregular_income
        rows = list(SEED_TRANSACTIONS)
        if add_spike:
            rows.append({
                "type": "income", "amount": 6500.0,
                "category": "Freelance", "merchant_name": "Client",
                "days_ago": 75,
            })
            print("  + Adding RM6500 freelance spike for stronger irregular_income signal")

        # Insert
        now = datetime.utcnow()
        inserted = 0
        for row in rows:
            tx = Transaction(
                user_id      = user.id,
                amount       = row["amount"],
                type         = row["type"],
                category     = row["category"],
                merchant_name= row["merchant_name"],
                receipt_image= "",
                created_at   = now - timedelta(days=row["days_ago"]),
            )
            db.add(tx)
            inserted += 1

        await db.commit()
        print(f"  ✓ Inserted {inserted} transactions")
        print(EXPECTED)
        print("Next step:")
        print("  Hit GET /api/v1/contingency/?refresh=true to recalculate the plan.")
        print("  Open Contingency or Resilience page in the app — data will be live.\n")


async def main():
    parser = argparse.ArgumentParser(description="Seed test transactions")
    parser.add_argument("--email",  help="User email to seed data for")
    parser.add_argument("--list",   action="store_true", help="List all registered users")
    parser.add_argument("--spike",  action="store_true", help="Add a RM6500 income spike for stronger irregular_income signal")
    args = parser.parse_args()

    await create_tables()  # ensure tables exist (idempotent)

    if args.list:
        await list_users()
    elif args.email:
        await seed(args.email, add_spike=args.spike)
    else:
        parser.print_help()


if __name__ == "__main__":
    asyncio.run(main())
