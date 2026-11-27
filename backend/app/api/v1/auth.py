"""Authentication API endpoints (/api/v1/auth)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...auth.service import demo_login_user, login_user, register_user, update_llm_consent
from ...core.config import get_settings
from ...core.database import get_db
from ...core.rate_limit import rate_limit_dependency
from ...models import User
from ...schemas.auth import (
    LLMConsentRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    dependencies=[Depends(rate_limit_dependency(limit=20, window_seconds=60))],
)
def register(payload: UserRegisterRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    ip = request.client.host if request.client else None
    return register_user(db, payload, ip_address=ip)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit_dependency(limit=30, window_seconds=60))],
)
def login(payload: UserLoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    ip = request.client.host if request.client else None
    return login_user(db, payload, ip_address=ip)


@router.post(
    "/demo",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit_dependency(limit=20, window_seconds=60))],
)
def demo_login(request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    ip = request.client.host if request.client else None
    return demo_login_user(db, ip_address=ip, settings=get_settings())


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post("/consent", response_model=UserResponse)
def set_llm_consent(
    payload: LLMConsentRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    ip = request.client.host if request.client else None
    updated = update_llm_consent(db, current_user, payload.granted, ip_address=ip)
    return UserResponse.model_validate(updated)
