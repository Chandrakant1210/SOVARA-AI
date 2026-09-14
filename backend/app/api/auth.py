from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User, UserRole

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    # role intentionally omitted — every self-registered account is
    # created as ENGINEER (lowest privilege). Promoting someone to
    # ADMIN/MANAGER must go through a separate, authenticated,
    # admin-only endpoint (not built yet).


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    role: UserRole

    class Config:
        from_attributes = True


@router.post("/auth/register", response_model=UserResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
        role=UserRole.ENGINEER,  # hardcoded, never client-supplied
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(id=str(user.id), email=user.email, role=user.role)


@router.post("/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token)