"""Security primitives: Argon2 password hashing, JWT auth, upload & path validation, PII redaction."""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import Settings, get_settings
from .exceptions import AppError

_password_hasher = PasswordHasher()

ALLOWED_RESUME_EXTENSIONS = {".pdf", ".docx", ".md", ".txt"}
ALLOWED_RESUME_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
    "application/octet-stream",  # Browser fallback when .md uploaded
}


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    if len(password) < 8:
        raise AppError("WEAK_PASSWORD", "Password must be at least 8 characters long.", status_code=422)
    return _password_hasher.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plaintext password against an Argon2 hash."""
    try:
        return _password_hasher.verify(password_hash, plain_password)
    except (VerifyMismatchError, Exception):
        return False


def create_access_token(
    subject: str | uuid.UUID,
    role: str,
    settings: Settings | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Issue a signed JWT access token."""
    cfg = settings or get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=cfg.access_token_expire_minutes))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, cfg.secret_key, algorithm=cfg.jwt_algorithm)


def decode_access_token(token: str, settings: Settings | None = None) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    cfg = settings or get_settings()
    try:
        return jwt.decode(token, cfg.secret_key, algorithms=[cfg.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise AppError("TOKEN_EXPIRED", "Authentication token has expired.", status_code=401) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError("INVALID_TOKEN", "Invalid authentication token.", status_code=401) from exc


def sanitize_filename(filename: str) -> str:
    """Validate and sanitize an uploaded filename to prevent path traversal."""
    raw = (filename or "").strip()
    if not raw or Path(raw).name != raw or "/" in raw or "\\" in raw:
        raise AppError("INVALID_FILENAME", "Filename must not contain directory separators.", status_code=400)
    if raw.startswith(".") or raw.startswith("_"):
        raise AppError("INVALID_FILENAME", "Filename cannot start with '.' or '_'.", status_code=400)
    ext = Path(raw).suffix.lower()
    if ext not in ALLOWED_RESUME_EXTENSIONS:
        raise AppError(
            "UNSUPPORTED_FILE_TYPE",
            f"Unsupported file extension '{ext}'. Allowed: {sorted(ALLOWED_RESUME_EXTENSIONS)}.",
            status_code=400,
        )
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(raw).stem).strip("._") or "document"
    return f"{stem[:80]}{ext}"


def validate_upload_bytes(
    content: bytes,
    filename: str,
    content_type: str | None = None,
    max_bytes: int | None = None,
) -> tuple[str, str, str]:
    """Validate uploaded file bytes, size, MIME type, and signature. Returns (safe_name, mime, sha256)."""
    cfg = get_settings()
    limit = max_bytes or cfg.max_upload_size_bytes
    safe_name = sanitize_filename(filename)

    if not content:
        raise AppError("EMPTY_FILE", "Uploaded file is empty.", status_code=400)
    if len(content) > limit:
        raise AppError(
            "FILE_TOO_LARGE",
            f"File exceeds maximum allowed size of {limit // (1024 * 1024)} MB.",
            status_code=413,
        )

    ext = Path(safe_name).suffix.lower()
    mime = (content_type or "application/octet-stream").split(";")[0].strip().lower()
    if mime not in ALLOWED_RESUME_MIMES:
        raise AppError("UNSUPPORTED_MIME_TYPE", f"Unsupported MIME type '{mime}'.", status_code=400)

    # Lightweight magic-byte checks for PDF and DOCX (ZIP container)
    if ext == ".pdf" and not content.startswith(b"%PDF"):
        raise AppError("INVALID_FILE_CONTENT", "File extension is .pdf but content is not a valid PDF.", status_code=400)
    if ext == ".docx" and not content.startswith(b"PK"):
        raise AppError("INVALID_FILE_CONTENT", "File extension is .docx but content is not a valid DOCX archive.", status_code=400)

    digest = hashlib.sha256(content).hexdigest()
    return safe_name, mime, digest


def sanitize_http_url(url: str | None) -> str | None:
    """Allow only http/https URLs to prevent javascript:/data: XSS vectors."""
    if not url:
        return None
    cleaned = url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise AppError("INVALID_URL", "URL must use http:// or https:// with a valid host.", status_code=422)
    return cleaned


_PII_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PII_PHONE_RE = re.compile(r"\+?\d[\d\s\-().]{7,}\d")
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*")
_API_KEY_RE = re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b")
_SECRET_KV_RE = re.compile(
    r"(?i)\b(password|passwd|secret_key|secret|api_key|apikey|authorization|access_token|refresh_token)\s*([:=])\s*([^\s,;'\"]+)"
)
_SENSITIVE_DICT_KEYS = {
    "password",
    "passwd",
    "password_hash",
    "secret",
    "secret_key",
    "api_key",
    "apikey",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
    "raw_text",
    "resume_text",
    "content_bytes",
}


def redact_pii(text: str) -> str:
    """Redact emails, phone numbers, JWTs, API keys, and inline secrets before logging."""
    if not text:
        return text
    masked = _PII_EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    masked = _PII_PHONE_RE.sub("[REDACTED_PHONE]", masked)
    masked = re.sub(r"Bearer\s+[A-Za-z0-9._\-]+", "Bearer [REDACTED_TOKEN]", masked)
    masked = _JWT_RE.sub("[REDACTED_JWT]", masked)
    masked = _API_KEY_RE.sub("[REDACTED_API_KEY]", masked)
    masked = _SECRET_KV_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", masked)
    return masked


def redact_mapping(payload: dict[str, Any]) -> dict[str, Any]:
    """Recursively redact sensitive keys and PII string values in structured telemetry."""
    cleaned: dict[str, Any] = {}
    for k, v in payload.items():
        if str(k).lower() in _SENSITIVE_DICT_KEYS:
            cleaned[k] = "[REDACTED]"
        elif isinstance(v, dict):
            cleaned[k] = redact_mapping(v)
        elif isinstance(v, list):
            cleaned[k] = [
                redact_mapping(item) if isinstance(item, dict) else (redact_pii(item) if isinstance(item, str) else item)
                for item in v
            ]
        elif isinstance(v, str):
            cleaned[k] = redact_pii(v)
        else:
            cleaned[k] = v
    return cleaned
