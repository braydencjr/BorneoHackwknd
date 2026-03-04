from jose import JWTError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, create_access_token, create_refresh_token
from app.schemas.user import UserCreate, UserOut, TokenResponse, RefreshRequest
from app.services.auth_service import auth_service
from app.dependencies import get_current_user

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await auth_service.register(db, body)
    return UserOut(email=user.email, name=user.name)


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.login(db, form_data.username, form_data.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access = create_access_token(subject=payload["sub"])
    refresh = create_refresh_token(subject=payload["sub"])
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.get("/me", response_model=UserOut)
async def me(current_user=Depends(get_current_user)):
    return UserOut(email=current_user.email, name=current_user.name)
