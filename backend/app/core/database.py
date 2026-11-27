"""Database engine, session management, and portable PostgreSQL/SQLite column types."""
from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from typing import Any, Generator

from pgvector.sqlalchemy import Vector
from sqlalchemy import CHAR, MetaData, Text, create_engine, event, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from .config import Settings, get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base with deterministic constraint naming for Alembic."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class GUID(TypeDecorator):
    """Platform-independent UUID type: native PostgreSQL UUID or CHAR(36) on SQLite."""

    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value if dialect.name == "postgresql" else str(value)
        parsed = uuid.UUID(str(value))
        return parsed if dialect.name == "postgresql" else str(parsed)

    def process_result_value(self, value: Any, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


class JSONBType(TypeDecorator):
    """Platform-independent JSONB: native JSONB on PostgreSQL or JSON-serialized TEXT on SQLite."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.dumps(value, ensure_ascii=False, default=str)

    def process_result_value(self, value: Any, dialect):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        return json.loads(value)


class VectorType(TypeDecorator):
    """Platform-independent embedding vector: pgvector Vector(dim) on PostgreSQL, JSON text on SQLite."""

    impl = Text
    cache_ok = True

    def __init__(self, dim: int = 384):
        super().__init__()
        self.dim = dim

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dim))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect):
        if value is None:
            return None
        vec = [float(x) for x in value]
        if dialect.name == "postgresql":
            return vec
        return json.dumps(vec)

    def process_result_value(self, value: Any, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return [float(x) for x in json.loads(value)]
        return [float(x) for x in value]


_engines: dict[str, Engine] = {}
_sessionmakers: dict[str, sessionmaker[Session]] = {}


def build_engine(settings: Settings | None = None) -> Engine:
    """Create or retrieve a pooled SQLAlchemy Engine for the configured database URL."""
    cfg = settings or get_settings()
    url = cfg.database_url
    if url in _engines:
        return _engines[url]

    kwargs: dict[str, Any] = {"future": True, "echo": cfg.db_echo}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_size"] = cfg.db_pool_size
        kwargs["max_overflow"] = cfg.db_max_overflow

    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    _engines[url] = engine
    _sessionmakers[url] = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        class_=Session,
    )
    return engine


def get_sessionmaker(settings: Settings | None = None) -> sessionmaker[Session]:
    cfg = settings or get_settings()
    build_engine(cfg)
    return _sessionmakers[cfg.database_url]


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a transactional database session."""
    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def transaction_scope(settings: Settings | None = None) -> Generator[Session, None, None]:
    """Context manager committing on success and rolling back on error."""
    SessionLocal = get_sessionmaker(settings)
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database_ready(settings: Settings | None = None) -> tuple[bool, str]:
    """Check whether database responds to SELECT 1."""
    try:
        engine = build_engine(settings)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "ok"
    except Exception as exc:
        return False, str(exc)
