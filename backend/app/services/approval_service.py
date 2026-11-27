"""Human-in-the-Loop approval gate service for sensitive or irreversible actions."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.exceptions import AppError
from ..models import Application, ApplicationStatus, ApprovalRequest, AuditLog, User
from ..repositories.application_repo import ApplicationRepository

SENSITIVE_ACTION_TYPES = {
    "submit_application",
    "send_email",
    "upload_external",
    "irreversible_change",
    "share_pii",
}


def list_approvals(db: Session, user_id: uuid.UUID, *, status: Optional[str] = None) -> list[ApprovalRequest]:
    stmt = select(ApprovalRequest).where(ApprovalRequest.user_id == user_id)
    if status:
        stmt = stmt.where(ApprovalRequest.status == status)
    return list(db.scalars(stmt.order_by(ApprovalRequest.created_at.desc())).all())


def decide_approval(
    db: Session,
    user: User,
    approval_id: uuid.UUID,
    *,
    decision: Literal["approved", "rejected"],
    decision_note: Optional[str] = None,
) -> ApprovalRequest:
    req = db.scalar(
        select(ApprovalRequest).where(
            ApprovalRequest.id == approval_id,
            ApprovalRequest.user_id == user.id,
        )
    )
    if req is None:
        raise AppError("APPROVAL_NOT_FOUND", "Approval request not found.", status_code=404)
    if req.status != "pending":
        raise AppError("APPROVAL_ALREADY_DECIDED", f"Approval request is already '{req.status}'.", status_code=409)

    req.status = decision
    req.decision_note = decision_note
    req.decided_at = datetime.now(timezone.utc)
    db.add(req)

    # If approving an application submission gate, mark internal Application draft as 'approved'
    if decision == "approved" and req.action_type == "submit_application":
        job_id_str = (req.payload_json or {}).get("job_id")
        if job_id_str:
            job_uuid = uuid.UUID(str(job_id_str))
            app_repo = ApplicationRepository(db)
            app = app_repo.get_by_job(job_uuid, user.id)
            if app is None:
                app = app_repo.create(user.id, job_uuid, notes="Approved via human-in-the-loop gate")
            app_repo.update_status(
                app,
                status=ApplicationStatus.APPROVED.value,
                event_details=f"Human approved external submission ({decision_note or 'confirmed'}).",
            )

    db.add(
        AuditLog(
            user_id=user.id,
            action=f"approval.{decision}",
            resource_type="approval_request",
            resource_id=str(req.id),
            metadata_json={"action_type": req.action_type},
        )
    )
    db.commit()
    db.refresh(req)
    return req
