"""3-Tier Memory Architecture: Conversation, User Profile, and Long-Term Semantic Memory."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..ml.embeddings import EmbeddingService, cosine_similarity
from ..models import AgentMemory, AuditLog, Conversation, Message, User


class MemoryService:
    """Manages durable, tenant-isolated, conflict-aware memory with explicit confirmation."""

    def __init__(self, db: Session, *, settings: Settings | None = None) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.emb = EmbeddingService(self.settings)

    # ── Tier 1: Conversation Memory & Rolling Summary ─────────────────────────
    def get_recent_conversation_context(self, conversation_id: uuid.UUID, user_id: uuid.UUID, limit: int = 8) -> dict[str, Any]:
        conv = self.db.scalar(
            select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
        if conv is None:
            return {"summary": None, "recent_messages": []}
        msgs = list(
            self.db.scalars(
                select(Message)
                .where(Message.conversation_id == conv.id, Message.user_id == user_id)
                .order_by(Message.created_at.desc())
                .limit(limit)
            ).all()
        )
        msgs.reverse()
        return {
            "summary": conv.summary,
            "recent_messages": [{"role": m.role, "content": m.content} for m in msgs],
        }

    # ── Tier 3: Long-Term Semantic Memory ─────────────────────────────────────
    def extract_and_store_memory(
        self,
        user: User,
        *,
        memory_type: str,
        key: str,
        value_text: str,
        value_json: Optional[dict[str, Any]] = None,
        confirmed_by_user: bool = False,
        confidence: float = 0.7,
        source_conversation_id: Optional[uuid.UUID] = None,
    ) -> tuple[AgentMemory, Optional[str]]:
        """Store or update memory with conflict detection.

        Never treats LLM inference as confirmed user preference unless `confirmed_by_user=True`.
        """
        norm_key = key.strip().lower()[:128]
        existing = self.db.scalar(
            select(AgentMemory).where(
                AgentMemory.user_id == user.id,
                AgentMemory.key == norm_key,
                AgentMemory.is_deleted.is_(False),
            )
        )

        conflict_note: Optional[str] = None
        if existing is not None:
            if existing.value_text != value_text.strip():
                conflict_note = (
                    f"Conflict detected for '{norm_key}': prior='{existing.value_text}' vs new='{value_text.strip()}'."
                )
                # Do not silently overwrite a confirmed preference with an unconfirmed inference!
                if existing.confirmation_status == "confirmed" and not confirmed_by_user:
                    return existing, f"{conflict_note} Kept confirmed preference pending explicit user update."
            existing.value_text = value_text.strip()
            existing.value_json = value_json or {}
            existing.confirmation_status = "confirmed" if confirmed_by_user else "inferred"
            existing.confidence = 1.0 if confirmed_by_user else confidence
            existing.embedding = self.emb.encode_one(f"{norm_key}: {value_text}", kind="document")
            self.db.add(existing)
            self.db.commit()
            self.db.refresh(existing)
            return existing, conflict_note

        mem = AgentMemory(
            user_id=user.id,
            memory_type=memory_type,
            key=norm_key,
            value_text=value_text.strip(),
            value_json=value_json or {},
            confirmation_status="confirmed" if confirmed_by_user else "inferred",
            confidence=1.0 if confirmed_by_user else confidence,
            source_conversation_id=source_conversation_id,
            embedding=self.emb.encode_one(f"{norm_key}: {value_text}", kind="document"),
        )
        self.db.add(mem)
        self.db.commit()
        self.db.refresh(mem)
        return mem, None

    def list_memories(self, user_id: uuid.UUID, *, include_deleted: bool = False) -> list[AgentMemory]:
        stmt = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if not include_deleted:
            stmt = stmt.where(AgentMemory.is_deleted.is_(False))
        return list(self.db.scalars(stmt.order_by(AgentMemory.updated_at.desc())).all())

    def retrieve_relevant_memories(self, user_id: uuid.UUID, query: str, *, top_k: int = 5) -> list[tuple[AgentMemory, float]]:
        memories = self.list_memories(user_id)
        if not memories:
            return []
        q_vec = self.emb.encode_one(query, kind="query")
        scored = [
            (m, cosine_similarity(q_vec, m.embedding) if m.embedding else 0.0)
            for m in memories
        ]
        scored.sort(key=lambda x: -x[1])
        return scored[:top_k]

    def update_memory(
        self,
        user_id: uuid.UUID,
        memory_id: uuid.UUID,
        *,
        value_text: Optional[str] = None,
        confirmation_status: Optional[str] = None,
    ) -> Optional[AgentMemory]:
        mem = self.db.scalar(
            select(AgentMemory).where(
                AgentMemory.id == memory_id,
                AgentMemory.user_id == user_id,
                AgentMemory.is_deleted.is_(False),
            )
        )
        if mem is None:
            return None
        if value_text is not None:
            mem.value_text = value_text.strip()
            mem.embedding = self.emb.encode_one(f"{mem.key}: {mem.value_text}", kind="document")
        if confirmation_status in {"confirmed", "rejected", "inferred"}:
            mem.confirmation_status = confirmation_status
            if confirmation_status == "confirmed":
                mem.confidence = 1.0
        self.db.add(mem)
        self.db.commit()
        self.db.refresh(mem)
        return mem

    def delete_memory(self, user_id: uuid.UUID, memory_id: uuid.UUID) -> bool:
        mem = self.db.scalar(select(AgentMemory).where(AgentMemory.id == memory_id, AgentMemory.user_id == user_id))
        if mem is None:
            return False
        self.db.delete(mem)
        self.db.add(
            AuditLog(
                user_id=user_id,
                action="memory.delete",
                resource_type="agent_memory",
                resource_id=str(memory_id),
                metadata_json={},
            )
        )
        self.db.commit()
        return True
