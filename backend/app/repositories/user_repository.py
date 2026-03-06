from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate


class UserRepository:
    """All database access for the User model lives here."""

    async def get_by_id(self, db: AsyncSession, user_id: int) -> Optional[User]:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalars().first()

    async def get_by_email(self, db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalars().first()

    async def create(
        self,
        db: AsyncSession,
        email: str,
        name: str,
        hashed_password: str,
    ) -> User:
        user = User(email=email, name=name, hashed_password=hashed_password)
        db.add(user)
        await db.flush()        # get the generated id without committing
        await db.refresh(user)
        return user


user_repository = UserRepository()