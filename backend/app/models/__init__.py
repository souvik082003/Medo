"""Export all ORM models so Alembic metadata discovery is complete."""
from .agent import (
    AgentMemory,
    ApprovalRequest,
    Conversation,
    KnowledgeChunk,
    KnowledgeDocument,
    Message,
)
from .base import Base
from .evaluation import EvaluationRun, ModelVersion
from .job import (
    Application,
    ApplicationEvent,
    ApplicationStatus,
    Feedback,
    Job,
    JobEmbedding,
    JobMatch,
    JobSkill,
    JobSource,
    JobVersion,
    SavedJob,
)
from .profile import (
    CandidateProfile,
    CandidateSkill,
    ResumeVersion,
    Skill,
    SkillAlias,
    UserPreference,
)
from .user import AuditLog, User, UserRole

__all__ = [
    "Base",
    "User",
    "UserRole",
    "AuditLog",
    "CandidateProfile",
    "ResumeVersion",
    "Skill",
    "SkillAlias",
    "CandidateSkill",
    "UserPreference",
    "JobSource",
    "Job",
    "JobVersion",
    "JobSkill",
    "JobEmbedding",
    "JobMatch",
    "SavedJob",
    "Application",
    "ApplicationEvent",
    "ApplicationStatus",
    "Feedback",
    "Conversation",
    "Message",
    "AgentMemory",
    "ApprovalRequest",
    "KnowledgeDocument",
    "KnowledgeChunk",
    "ModelVersion",
    "EvaluationRun",
]
