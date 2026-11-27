"""Cross-encoder reranking module with local deterministic test fallback."""
from __future__ import annotations

import math
import re
import threading
from typing import Sequence

from ..core.config import Settings, get_settings


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9+#.]+", (text or "").lower())


class CrossEncoderReranker:
    """Reranks (query, passage) pairs with Sentence-Transformers CrossEncoder."""

    _model_cache: dict[str, object] = {}
    _lock = threading.Lock()

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.model_name = self.settings.cross_encoder_model_name

    def _load_model(self):
        with self._lock:
            if self.model_name not in self._model_cache:
                from sentence_transformers import CrossEncoder

                self._model_cache[self.model_name] = CrossEncoder(self.model_name)
            return self._model_cache[self.model_name]

    def score_pairs(self, query: str, documents: Sequence[str]) -> list[float]:
        """Return relevance scores in [0, 1] for each (query, doc) pair."""
        if not documents:
            return []

        if self.settings.use_stub_embeddings:
            q_toks = set(_tokenize(query))
            q_bigrams = set(zip(_tokenize(query), _tokenize(query)[1:]))
            scores: list[float] = []
            for doc in documents:
                d_toks = _tokenize(doc)
                d_set = set(d_toks)
                if not q_toks or not d_set:
                    scores.append(0.0)
                    continue
                unigram_overlap = len(q_toks & d_set) / len(q_toks)
                d_bigrams = set(zip(d_toks, d_toks[1:]))
                bigram_overlap = (len(q_bigrams & d_bigrams) / len(q_bigrams)) if q_bigrams else 0.0
                # Exact phrase boost if query substring appears in title/first line
                first_line = (doc or "").splitlines()[0].lower()
                title_hit = sum(1 for t in q_toks if t in first_line) / len(q_toks)
                logit = -2.0 + 3.0 * unigram_overlap + 2.0 * bigram_overlap + 1.5 * title_hit
                scores.append(round(1.0 / (1.0 + math.exp(-logit)), 4))
            return scores

        model = self._load_model()
        pairs = [(query, d) for d in documents]
        raw_scores = model.predict(pairs)
        return [round(1.0 / (1.0 + math.exp(-float(s))), 4) for s in raw_scores]
