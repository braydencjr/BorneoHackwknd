from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.models.user import User
from app.repositories.user_repository import user_repository
from app.schemas.user import UserCreate, TokenResponse


class AuthService:
    """Business logic for authentication — keeps routes thin."""

    async def register(self, db: AsyncSession, body: UserCreate) -> User:
        existing = await user_repository.get_by_email(db, body.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        hashed = hash_password(body.password)
        return await user_repository.create(db, body.email, body.name, hashed)

    async def login(self, db: AsyncSession, email: str, password: str) -> TokenResponse:
        user = await user_repository.get_by_email(db, email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

        access = create_access_token(subject=str(user.id))
        refresh = create_refresh_token(subject=str(user.id))
        return TokenResponse(access_token=access, refresh_token=refresh)


auth_service = AuthService()
