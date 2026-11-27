"""Redis-backed rate limiting and cache helper with local in-memory fallback."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Optional

import redis
from fastapi import Request

from .config import Settings, get_settings
from .exceptions import AppError


class RateLimiter:
    """Fixed/sliding-window rate limiter backed by Redis or local thread-safe memory."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._lock = threading.Lock()
        self._local_buckets: dict[str, deque[float]] = defaultdict(deque)
        self._redis_client: Optional[redis.Redis] = None
        self._redis_checked = False

    def _get_redis(self) -> Optional[redis.Redis]:
        if self._redis_checked:
            return self._redis_client
        self._redis_checked = True
        try:
            client = redis.Redis.from_url(
                self.settings.redis_url,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
                decode_responses=True,
            )
            client.ping()
            self._redis_client = client
        except Exception:
            self._redis_client = None
        return self._redis_client

    def reset_local(self) -> None:
        """Clear local buckets (useful in isolated tests)."""
        with self._lock:
            self._local_buckets.clear()

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        """Enforce `limit` requests per `window_seconds` for `key`."""
        r = self._get_redis()
        if r is not None:
            try:
                redis_key = f"nexus:rl:{key}:{int(time.time() // window_seconds)}"
                count = r.incr(redis_key)
                if count == 1:
                    r.expire(redis_key, window_seconds)
                if count > limit:
                    raise AppError("RATE_LIMIT_EXCEEDED", "Too many requests. Please retry shortly.", status_code=429)
                return
            except AppError:
                raise
            except Exception:
                pass  # Fallback safely if Redis drops mid-flight

        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._local_buckets[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                raise AppError("RATE_LIMIT_EXCEEDED", "Too many requests. Please retry shortly.", status_code=429)
            bucket.append(now)


_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter


def check_redis_ready(settings: Settings | None = None) -> tuple[bool, str]:
    """Check whether Redis responds to PING."""
    cfg = settings or get_settings()
    try:
        client = redis.Redis.from_url(cfg.redis_url, socket_connect_timeout=0.5, socket_timeout=0.5)
        client.ping()
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


def rate_limit_dependency(limit: int | None = None, window_seconds: int = 60):
    """FastAPI dependency enforcing rate limits per client IP and route."""

    def _dep(request: Request) -> None:
        cfg = get_settings()
        max_req = limit if limit is not None else cfg.rate_limit_per_minute
        client_ip = request.client.host if request.client else "unknown"
        key = f"{client_ip}:{request.url.path}"
        get_rate_limiter().check(key, limit=max_req, window_seconds=window_seconds)

    return _dep
