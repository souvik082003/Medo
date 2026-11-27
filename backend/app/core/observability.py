"""Structured PII-safe JSON logging, OpenTelemetry spans, and latency/token metrics."""
from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Iterator

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .security import redact_mapping, redact_pii

_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
_trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="-")

_OTEL_SDK_AVAILABLE = False
_span_exporter = None
_tracer_configured = False
_tracer_lock = threading.Lock()
_fallback_spans: deque[dict[str, Any]] = deque(maxlen=250)

try:
    from opentelemetry import trace as _otel_trace
    from opentelemetry.sdk.resources import Resource as _OtelResource
    from opentelemetry.sdk.trace import TracerProvider as _OtelTracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor as _OtelSimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter as _OtelInMemorySpanExporter,
    )

    _OTEL_SDK_AVAILABLE = True
    _span_exporter = _OtelInMemorySpanExporter()
except Exception:
    _otel_trace = None  # type: ignore[assignment]


class _LocalSpanContext:
    def __init__(self, trace_id: int, span_id: int) -> None:
        self.trace_id = trace_id
        self.span_id = span_id


class _LocalSpan:
    def __init__(self, name: str, trace_id: int) -> None:
        self.name = name
        self._ctx = _LocalSpanContext(trace_id=trace_id, span_id=uuid.uuid4().int & ((1 << 64) - 1))
        self.attributes: dict[str, Any] = {}
        self._t0 = time.perf_counter()

    def get_span_context(self) -> _LocalSpanContext:
        return self._ctx

    def set_attribute(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def finish(self) -> None:
        dur_ms = round((time.perf_counter() - self._t0) * 1000.0, 2)
        with _tracer_lock:
            _fallback_spans.append(
                {
                    "name": self.name,
                    "trace_id": format(self._ctx.trace_id, "032x"),
                    "span_id": format(self._ctx.span_id, "016x"),
                    "duration_ms": dur_ms,
                    "attributes": redact_mapping(dict(self.attributes)),
                }
            )


class _LocalTracer:
    @contextlib.contextmanager
    def start_as_current_span(self, name: str) -> Iterator[_LocalSpan]:
        cur_trace = _trace_id_var.get()
        try:
            trace_int = int(cur_trace, 16) if cur_trace and cur_trace != "-" else uuid.uuid4().int
        except ValueError:
            trace_int = uuid.uuid4().int
        span = _LocalSpan(name=name, trace_id=trace_int)
        try:
            yield span
        finally:
            span.finish()


_local_tracer = _LocalTracer()


def get_tracer(service_name: str = "nexus-ai"):
    """Return OpenTelemetry SDK tracer when installed, else lightweight OTel-compatible span recorder."""
    global _tracer_configured
    if _OTEL_SDK_AVAILABLE and _otel_trace is not None and _span_exporter is not None:
        with _tracer_lock:
            if not _tracer_configured:
                provider = _OtelTracerProvider(resource=_OtelResource.create({"service.name": service_name}))
                provider.add_span_processor(_OtelSimpleSpanProcessor(_span_exporter))
                _otel_trace.set_tracer_provider(provider)
                _tracer_configured = True
        return _otel_trace.get_tracer(service_name)
    return _local_tracer


def get_recent_spans(limit: int = 50) -> list[dict[str, Any]]:
    """Return recent completed spans with PII-redacted attributes."""
    if _OTEL_SDK_AVAILABLE and _span_exporter is not None:
        spans = _span_exporter.get_finished_spans()[-limit:]
        out: list[dict[str, Any]] = []
        for sp in spans:
            attrs = redact_mapping(dict(sp.attributes or {}))
            dur_ms = 0.0
            if sp.start_time and sp.end_time:
                dur_ms = round((sp.end_time - sp.start_time) / 1_000_000.0, 2)
            out.append(
                {
                    "name": sp.name,
                    "trace_id": format(sp.context.trace_id, "032x"),
                    "span_id": format(sp.context.span_id, "016x"),
                    "duration_ms": dur_ms,
                    "attributes": attrs,
                }
            )
        return out
    with _tracer_lock:
        return list(_fallback_spans)[-limit:]


class JsonLogFormatter(logging.Formatter):
    """Structured JSON formatter that strips PII, API keys, JWTs, and raw secrets."""

    _RESERVED = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "asctime",
    }

    def format(self, record: logging.LogRecord) -> str:
        msg = redact_pii(record.getMessage())
        extra_fields = {
            k: v
            for k, v in record.__dict__.items()
            if k not in self._RESERVED and not k.startswith("_")
        }
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": _request_id_var.get(),
            "trace_id": _trace_id_var.get(),
            "message": msg,
        }
        if extra_fields:
            payload["context"] = redact_mapping(extra_fields)
        if record.exc_info:
            payload["exception"] = redact_pii(self.formatException(record.exc_info))
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> logging.Logger:
    """Configure the `nexus_ai` structured JSON logger cleanly without clobbering pytest."""
    logger = logging.getLogger("nexus_ai")
    logger.setLevel(getattr(logging, (level or "INFO").upper(), logging.INFO))
    if not any(isinstance(getattr(h, "formatter", None), JsonLogFormatter) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonLogFormatter())
        logger.addHandler(handler)
    return logger


class ObservabilityMetrics:
    """Thread-safe latency, error, stage timing, and token usage collector."""

    def __init__(self, max_samples: int = 500) -> None:
        self._lock = threading.Lock()
        self._max_samples = max_samples
        self.request_count = 0
        self.error_count = 0
        self.status_counts: dict[str, int] = defaultdict(int)
        self.route_latencies_ms: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=max_samples))
        self.stage_latencies_ms: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=max_samples))
        self.token_totals: dict[str, int] = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

    def reset(self) -> None:
        with self._lock:
            self.request_count = 0
            self.error_count = 0
            self.status_counts.clear()
            self.route_latencies_ms.clear()
            self.stage_latencies_ms.clear()
            for key in self.token_totals:
                self.token_totals[key] = 0

    def record_request(self, route: str, status_code: int, latency_ms: float) -> None:
        with self._lock:
            self.request_count += 1
            self.status_counts[str(status_code)] += 1
            if status_code >= 400:
                self.error_count += 1
            self.route_latencies_ms[route].append(float(latency_ms))

    def record_stage(self, stage: str, latency_ms: float) -> None:
        with self._lock:
            self.stage_latencies_ms[stage].append(float(latency_ms))

    def record_tokens(self, prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
        with self._lock:
            self.token_totals["prompt_tokens"] += max(0, int(prompt_tokens))
            self.token_totals["completion_tokens"] += max(0, int(completion_tokens))
            self.token_totals["total_tokens"] += max(0, int(prompt_tokens)) + max(0, int(completion_tokens))

    @staticmethod
    def _summarize(values: deque[float]) -> dict[str, float]:
        if not values:
            return {"count": 0, "avg_ms": 0.0, "p50_ms": 0.0, "p95_ms": 0.0, "max_ms": 0.0}
        ordered = sorted(values)
        n = len(ordered)
        p50 = ordered[int(0.50 * (n - 1))]
        p95 = ordered[int(0.95 * (n - 1))]
        return {
            "count": n,
            "avg_ms": round(sum(ordered) / n, 2),
            "p50_ms": round(p50, 2),
            "p95_ms": round(p95, 2),
            "max_ms": round(ordered[-1], 2),
        }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "request_count": self.request_count,
                "error_count": self.error_count,
                "error_rate": round(self.error_count / max(1, self.request_count), 4),
                "status_counts": dict(self.status_counts),
                "token_usage": dict(self.token_totals),
                "routes": {k: self._summarize(v) for k, v in sorted(self.route_latencies_ms.items())},
                "stages": {k: self._summarize(v) for k, v in sorted(self.stage_latencies_ms.items())},
            }


_metrics = ObservabilityMetrics()


def get_metrics() -> ObservabilityMetrics:
    return _metrics


@contextlib.contextmanager
def trace_stage(stage_name: str, **attributes: Any) -> Iterator[None]:
    """Measure latency and emit a redacted OpenTelemetry span for an internal pipeline stage."""
    tracer = get_tracer()
    t0 = time.perf_counter()
    clean_attrs = redact_mapping({k: v for k, v in attributes.items() if v is not None})
    with tracer.start_as_current_span(stage_name) as span:
        for k, v in clean_attrs.items():
            if isinstance(v, (str, bool, int, float)):
                span.set_attribute(k, v)
        try:
            yield
        finally:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            get_metrics().record_stage(stage_name, elapsed_ms)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Inject correlation IDs, emit OpenTelemetry HTTP spans, redact logs, and add security headers."""

    def __init__(self, app, logger_name: str = "nexus_ai") -> None:
        super().__init__(app)
        self.logger = logging.getLogger(logger_name)

    async def dispatch(self, request: Request, call_next) -> Response:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        tracer = get_tracer()
        t0 = time.perf_counter()

        req_token = _request_id_var.set(req_id)
        trace_id_hex = "-"
        with tracer.start_as_current_span(f"{request.method} {request.url.path}") as span:
            trace_id_hex = format(span.get_span_context().trace_id, "032x")
            tr_token = _trace_id_var.set(trace_id_hex)
            span.set_attribute("http.method", request.method)
            span.set_attribute("http.target", redact_pii(request.url.path))
            try:
                response = await call_next(request)
                status = response.status_code
            except Exception as exc:
                status = 500
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                get_metrics().record_request(f"{request.method} {request.url.path}", status, latency_ms)
                self.logger.exception(
                    "Unhandled request failure",
                    extra={"method": request.method, "path": request.url.path, "status_code": status, "latency_ms": latency_ms},
                )
                raise exc
            finally:
                _trace_id_var.reset(tr_token)
                _request_id_var.reset(req_token)

            latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            span.set_attribute("http.status_code", status)
            get_metrics().record_request(f"{request.method} {request.url.path}", status, latency_ms)
            self.logger.info(
                "HTTP request completed",
                extra={"method": request.method, "path": request.url.path, "status_code": status, "latency_ms": latency_ms},
            )

            # Security & correlation headers
            response.headers["X-Request-ID"] = req_id
            response.headers["X-Trace-ID"] = trace_id_hex
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            if request.url.path.startswith(("/api/v1/auth", "/api/v1/privacy", "/api/v1/memory", "/api/v1/approvals")):
                response.headers["Cache-Control"] = "no-store"
            return response
