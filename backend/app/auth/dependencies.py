"""FastAPI authentication and RBAC dependencies."""
from __future__ import annotations

import uuid
from typing import Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.exceptions import AppError
from ..core.security import decode_access_token
from ..models import User, UserRole

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve authenticated user from Bearer JWT token."""
    if credentials is None or not credentials.credentials:
        raise AppError("NOT_AUTHENTICATED", "Authentication credentials were not provided.", status_code=401)

    payload = decode_access_token(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise AppError("INVALID_TOKEN", "Token missing subject claim.", status_code=401)

    try:
        user_id = uuid.UUID(str(sub))
    except ValueError as exc:
        raise AppError("INVALID_TOKEN", "Malformed subject UUID in token.", status_code=401) from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError("INVALID_TOKEN", "User account not found or inactive.", status_code=401)
    return user


def require_role(*roles: UserRole) -> Callable[[User], User]:
    """Dependency enforcing role-based authorization."""
    allowed = {r.value for r in roles}

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise AppError("FORBIDDEN", "Insufficient permissions for this operation.", status_code=403)
        return current_user

    return _checker


def require_llm_consent(current_user: User = Depends(get_current_user)) -> User:
    """Enforce explicit user consent before transmitting private resume/PII to external LLMs."""
    if not current_user.llm_consent_granted:
        raise AppError(
            "LLM_CONSENT_REQUIRED",
            "Explicit user consent is required before sending resume or personal data to external LLM services.",
            status_code=403,
        )
    return current_user
