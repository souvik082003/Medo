"""Unified LLM provider abstraction (Anthropic, DeepSeek/OpenAI-compatible, and deterministic Mock)."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Optional

from ..core.config import Settings, get_settings
from ..core.observability import get_metrics, trace_stage


@dataclass
class LLMResponse:
    text: str
    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    tool_input: Optional[dict[str, Any]] = None


class LLMProvider:
    """Provider abstraction with timeouts, retries, token metrics, and offline mock mode."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 1024,
        json_schema_hint: str | None = None,
    ) -> LLMResponse:
        provider = self.settings.llm_provider.lower()
        t0 = time.perf_counter()

        if (
            provider == "mock"
            or (provider == "anthropic" and not self.settings.anthropic_api_key)
            or (provider == "deepseek" and not self.settings.deepseek_api_key)
            or (provider == "openai" and not self.settings.openai_api_key)
            or (provider == "openai_compat" and not (self.settings.openai_api_key and self.settings.llm_base_url))
        ):
            with trace_stage("llm.mock", llm_provider="mock"):
                text = self._mock_response(prompt, json_schema_hint=json_schema_hint)
            resp = LLMResponse(
                text=text,
                model="mock-deterministic-v1",
                provider="mock",
                input_tokens=max(1, len(prompt) // 4),
                output_tokens=max(1, len(text) // 4),
                latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            )
            get_metrics().record_tokens(resp.input_tokens, resp.output_tokens)
            return resp

        last_err: Exception | None = None
        for attempt in range(self.settings.llm_max_retries + 1):
            try:
                with trace_stage(f"llm.{provider}", llm_provider=provider, attempt=attempt):
                    if provider == "anthropic":
                        resp = self._call_anthropic(prompt, system=system, max_tokens=max_tokens, t0=t0)
                    elif provider in {"deepseek", "openai", "ollama", "openai_compat"}:
                        resp = self._call_openai_compat(provider, prompt, system=system, max_tokens=max_tokens, t0=t0)
                    else:
                        raise ValueError(f"Unsupported LLM_PROVIDER: {provider}")
                get_metrics().record_tokens(resp.input_tokens, resp.output_tokens)
                return resp
            except Exception as exc:
                last_err = exc
                if attempt < self.settings.llm_max_retries:
                    time.sleep(0.4 * (2**attempt))
        raise RuntimeError(f"LLM completion failed after retries: {last_err}") from last_err

    def _call_anthropic(self, prompt: str, *, system: str | None, max_tokens: int, t0: float) -> LLMResponse:
        from anthropic import Anthropic

        client = Anthropic(api_key=self.settings.anthropic_api_key, timeout=self.settings.llm_timeout_seconds)
        kwargs: dict[str, Any] = {
            "model": "claude-3-5-sonnet-latest",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        resp = client.messages.create(**kwargs)
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        usage = getattr(resp, "usage", None)
        return LLMResponse(
            text=text,
            model=kwargs["model"],
            provider="anthropic",
            input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
            output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    def _call_openai_compat(
        self, provider: str, prompt: str, *, system: str | None, max_tokens: int, t0: float
    ) -> LLMResponse:
        from openai import OpenAI

        if provider == "deepseek":
            client = OpenAI(
                api_key=self.settings.deepseek_api_key,
                base_url=self.settings.llm_base_url or "https://api.deepseek.com/v1",
                timeout=self.settings.llm_timeout_seconds,
            )
            model = self.settings.llm_model or "deepseek-chat"
        elif provider == "ollama":
            client = OpenAI(
                api_key="ollama",
                base_url=self.settings.llm_base_url or self.settings.ollama_base_url,
                timeout=self.settings.llm_timeout_seconds,
            )
            model = self.settings.llm_model or self.settings.ollama_model
        elif provider == "openai_compat":
            client = OpenAI(
                api_key=self.settings.openai_api_key,
                base_url=self.settings.llm_base_url,
                timeout=self.settings.llm_timeout_seconds,
            )
            model = self.settings.llm_model or "gpt-4o-mini"
        else:
            client = OpenAI(
                api_key=self.settings.openai_api_key,
                timeout=self.settings.llm_timeout_seconds,
            )
            model = self.settings.llm_model or "gpt-4o-mini"

        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = client.chat.completions.create(model=model, max_tokens=max_tokens, messages=messages)
        text = (resp.choices[0].message.content or "").strip()
        usage = getattr(resp, "usage", None)
        return LLMResponse(
            text=text,
            model=model,
            provider=provider,
            input_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
            output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    @staticmethod
    def _mock_response(prompt: str, json_schema_hint: str | None = None) -> str:
        if json_schema_hint == "skills":
            return json.dumps({"skills": []})
        if json_schema_hint == "query_understanding":
            return json.dumps({"intent": "career_qa", "rewritten_query": prompt[:200], "sub_queries": [prompt[:120]]})
        return "Grounded mock response based strictly on provided context."
