"""ML model version registry and evaluation run tracking."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import GUID, JSONBType
from .base import Base, UUIDPrimaryKeyMixin, utcnow


class ModelVersion(Base, UUIDPrimaryKeyMixin):
    """Versioned ML/embedding/ranking model metadata."""

    __tablename__ = "model_versions"

    model_kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    artifact_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    training_data_provenance: Mapped[str] = mapped_column(String(64), default="pretrained", nullable=False)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("model_kind", "name", "version", name="uq_model_versions_kind_name_ver"),)


class EvaluationRun(Base, UUIDPrimaryKeyMixin):
    """Recorded offline/online evaluation benchmark run (synthetic vs real strictly separated)."""

    __tablename__ = "evaluation_runs"

    suite: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    dataset_name: Mapped[str] = mapped_column(String(128), nullable=False)
    dataset_provenance: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    model_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("model_versions.id", ondelete="SET NULL"), nullable=True
    )
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    report_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    git_sha: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
