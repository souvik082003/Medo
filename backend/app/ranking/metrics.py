"""ML ranking and probability calibration metrics (NDCG@K, Precision@K, Recall@K, MRR, MAP, ECE)."""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np


def dcg_at_k(relevances: Sequence[float], k: int) -> float:
    rel = list(relevances)[:k]
    return sum((2.0**float(r) - 1.0) / math.log2(idx + 2) for idx, r in enumerate(rel))


def ndcg_at_k(relevances_ranked: Sequence[float], k: int) -> float:
    actual = dcg_at_k(relevances_ranked, k)
    ideal = dcg_at_k(sorted(relevances_ranked, reverse=True), k)
    return round(actual / ideal, 4) if ideal > 0 else 0.0


def precision_at_k(binary_relevances_ranked: Sequence[int], k: int) -> float:
    top_k = list(binary_relevances_ranked)[:k]
    if not top_k:
        return 0.0
    return round(sum(1 for r in top_k if r > 0) / len(top_k), 4)


def recall_at_k(binary_relevances_ranked: Sequence[int], k: int) -> float:
    total_rel = sum(1 for r in binary_relevances_ranked if r > 0)
    if total_rel == 0:
        return 0.0
    hits = sum(1 for r in list(binary_relevances_ranked)[:k] if r > 0)
    return round(hits / total_rel, 4)


def reciprocal_rank(binary_relevances_ranked: Sequence[int]) -> float:
    for idx, r in enumerate(binary_relevances_ranked, start=1):
        if r > 0:
            return 1.0 / idx
    return 0.0


def average_precision(binary_relevances_ranked: Sequence[int]) -> float:
    total_rel = sum(1 for r in binary_relevances_ranked if r > 0)
    if total_rel == 0:
        return 0.0
    hits = 0
    prec_sum = 0.0
    for idx, r in enumerate(binary_relevances_ranked, start=1):
        if r > 0:
            hits += 1
            prec_sum += hits / idx
    return prec_sum / total_rel


def expected_calibration_error(y_true: Sequence[int], y_prob: Sequence[float], n_bins: int = 10) -> float:
    yt = np.asarray(y_true, dtype=np.float64)
    yp = np.asarray(y_prob, dtype=np.float64)
    if len(yt) == 0:
        return 0.0
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (yp >= lo) & (yp <= hi if i == n_bins - 1 else yp < hi)
        if np.any(mask):
            ece += (np.sum(mask) / len(yt)) * abs(float(np.mean(yt[mask])) - float(np.mean(yp[mask])))
    return round(float(ece), 4)


def evaluate_ranking_groups(
    groups: Sequence[tuple[Sequence[float], Sequence[float]]],
    *,
    relevance_threshold: float = 1.0,
) -> dict[str, float]:
    """Compute mean NDCG@5, NDCG@10, Precision@5, Recall@5, MRR, and MAP across query groups.

    Each group is (predicted_scores, true_relevances).
    """
    ndcg5, ndcg10, p5, r5, mrrs, aps = [], [], [], [], [], []
    for preds, rels in groups:
        order = sorted(range(len(preds)), key=lambda i: -float(preds[i]))
        ranked_rels = [float(rels[i]) for i in order]
        ranked_bin = [1 if r >= relevance_threshold else 0 for r in ranked_rels]
        ndcg5.append(ndcg_at_k(ranked_rels, 5))
        ndcg10.append(ndcg_at_k(ranked_rels, 10))
        p5.append(precision_at_k(ranked_bin, 5))
        r5.append(recall_at_k(ranked_bin, 5))
        mrrs.append(reciprocal_rank(ranked_bin))
        aps.append(average_precision(ranked_bin))

    n = max(1, len(groups))
    return {
        "ndcg@5": round(sum(ndcg5) / n, 4),
        "ndcg@10": round(sum(ndcg10) / n, 4),
        "precision@5": round(sum(p5) / n, 4),
        "recall@5": round(sum(r5) / n, 4),
        "mrr": round(sum(mrrs) / n, 4),
        "map": round(sum(aps) / n, 4),
    }
