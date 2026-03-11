import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))

async def main():
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        r = await db.execute(text(
            "SELECT query_type, COUNT(*) as cnt, MAX(fetched_at) as latest "
            "FROM regional_risk_cache GROUP BY query_type"
        ))
        rows = r.fetchall()
        if not rows:
            print("Table is EMPTY - no rows at all")
        else:
            print("regional_risk_cache contents:")
            for row in rows:
                print(f"  query_type={row[0]}  count={row[1]}  latest={row[2]}")

        # Also check total row count
        r2 = await db.execute(text("SELECT COUNT(*) FROM regional_risk_cache"))
        print(f"\nTotal rows: {r2.scalar()}")

asyncio.run(main())
