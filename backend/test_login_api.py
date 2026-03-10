import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.services.auth_service import auth_service

async def test_login():
    async with AsyncSessionLocal() as db:
        try:
            res = await auth_service.login(db, "braydencjr05@gmail.com", "abc123")
            print("Login successful:", res)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_login())
