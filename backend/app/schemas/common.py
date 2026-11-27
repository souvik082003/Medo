"""Common Pydantic v2 schemas (pagination, errors, health)."""
from __future__ import annotations

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response wrapper."""

    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[object] = None


class ErrorEnvelope(BaseModel):
    error: ErrorDetail


class HealthStatus(BaseModel):
    status: str
    app: str
    version: str
    environment: str


class ReadinessStatus(BaseModel):
    status: str
    database: str
    redis: str
    details: dict[str, str] = Field(default_factory=dict)
