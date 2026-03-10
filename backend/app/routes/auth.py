import shutil

from jose import JWTError
from app.services.email_service import send_email
from fastapi import APIRouter, Depends, HTTPException, status , UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.otp_service import generate_otp, verify_otp
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import decode_token, create_access_token, create_refresh_token, verify_password, hash_password
from app.schemas.user import UserCreate, UserOut, TokenResponse, RefreshRequest
from app.services.auth_service import auth_service
from app.dependencies import get_current_user

import shutil
import os

from app.dependencies import get_current_user
from app.models.user import User
from app.core.database import get_db

class OTPVerifyRequest(BaseModel):
    email: str
    otp: str
    name: str
    password: str

class OTPRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await auth_service.register(db, body)
    return UserOut(email=user.email, name=user.name)

@router.post("/send-otp")
async def send_otp(data: OTPRequest):
    email = data.email
    otp = generate_otp(email)
    print("DEBUG: /send-otp endpoint called")
    print(f"DEBUG: Generated OTP for {email}: {otp}")
    try:
        send_email(email, otp)
        print(f"DEBUG: Email sent to {email}")
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": "OTP sent"}

@router.post("/verify-otp")
async def verify_otp_route(
    data: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db)
):

    email = data.email
    otp = data.otp

    print("DEBUG password:", data.password)
    print("DEBUG length:", len(data.password))

    if not verify_otp(email, otp):
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # create user AFTER OTP verified
    user = await auth_service.register(
        db,
        UserCreate(
            email=data.email,
            name=data.name,
            password=data.password
        )
    )

    from app.services.otp_service import delete_otp
    delete_otp(email)

    return {"message": "User created successfully"}


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

@router.post("/profile-photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    os.makedirs("uploads", exist_ok=True)

    file_path = f"uploads/user_{current_user.id}.jpg"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    current_user.profile_photo = file_path

    await db.commit()
    await db.refresh(current_user)

    return {"profile_photo": file_path}

@router.patch("/update")
async def update_user(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if "name" in data:
        current_user.name = data["name"]

    await db.commit()
    await db.refresh(current_user)

    return {
        "name": current_user.name,
        "email": current_user.email,
        "profile_photo": current_user.profile_photo
    }

@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    # verify current password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )

    # update password
    current_user.hashed_password = hash_password(data.new_password)

    await db.commit()

    return {"message": "Password changed successfully"}

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):

    email = data.email

    # reuse your OTP generator
    otp = generate_otp(email)

    try:
        send_email(email, otp)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Password reset OTP sent"}


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):

    if not verify_otp(data.email, data.otp):
        raise HTTPException(status_code=400, detail="Invalid OTP")

    user = await auth_service.get_user_by_email(db, data.email)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password = auth_service.hash_password(data.new_password)

    await db.commit()

    return {"message": "Password updated successfully"}