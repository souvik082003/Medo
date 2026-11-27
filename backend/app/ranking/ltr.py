"""Learning-to-Rank models: Baseline Weighted, Pointwise, Pairwise, and XGBoost/LightGBM Rankers."""
from __future__ import annotations

import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import numpy as np
import torch
import torch.nn as nn
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression

from ..ml.compatibility import group_train_val_test_split
from ..ml.features import FEATURE_NAMES
from .metrics import evaluate_ranking_groups


@dataclass
class RankingModelReport:
    model_name: str
    provenance: str
    ndcg_at_5: float
    ndcg_at_10: float
    precision_at_5: float
    recall_at_5: float
    mrr: float
    map_score: float


class BaselineWeightedRanker:
    """Interpretable deterministic baseline weighted ranking algorithm."""

    WEIGHTS: dict[str, float] = {
        "required_skill_coverage": 0.25,
        "semantic_similarity": 0.22,
        "skill_coverage": 0.10,
        "experience_fit": 0.12,
        "seniority_fit": 0.08,
        "location_fit": 0.08,
        "work_mode_fit": 0.05,
        "salary_fit": 0.05,
        "recency_score": 0.03,
        "interaction_affinity": 0.02,
    }

    def predict(self, X: np.ndarray) -> np.ndarray:
        idx_map = {name: i for i, name in enumerate(FEATURE_NAMES)}
        scores = np.zeros(len(X), dtype=np.float32)
        for feat, w in self.WEIGHTS.items():
            scores += w * X[:, idx_map[feat]]
        return scores


class PairwiseLinearRanker:
    """Pairwise ranking trained on within-group feature differences (x_i - x_j)."""

    def __init__(self, seed: int = 42) -> None:
        self.clf = LogisticRegression(max_iter=1000, random_state=seed)

    def fit(self, X: np.ndarray, y_rel: np.ndarray, groups: np.ndarray) -> "PairwiseLinearRanker":
        diffs, targets = [], []
        for g in np.unique(groups):
            mask = groups == g
            Xg, yg = X[mask], y_rel[mask]
            n = len(Xg)
            for i in range(n):
                for j in range(i + 1, n):
                    if yg[i] == yg[j]:
                        continue
                    diffs.append(Xg[i] - Xg[j])
                    targets.append(1 if yg[i] > yg[j] else 0)
                    diffs.append(Xg[j] - Xg[i])
                    targets.append(1 if yg[j] > yg[i] else 0)
        self.clf.fit(np.asarray(diffs, dtype=np.float32), np.asarray(targets, dtype=np.int64))
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.clf.decision_function(X)


class PairwiseTorchRanker:
    """PyTorch neural pairwise Learning-to-Rank scorer trained with pairwise margin BCE loss."""

    def __init__(self, input_dim: int = len(FEATURE_NAMES), hidden_dim: int = 24, seed: int = 42) -> None:
        torch.manual_seed(seed)
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def fit(
        self, X: np.ndarray, y_rel: np.ndarray, groups: np.ndarray, *, epochs: int = 40, lr: float = 0.02
    ) -> "PairwiseTorchRanker":
        pairs_i, pairs_j = [], []
        for g in np.unique(groups):
            idxs = np.where(groups == g)[0]
            for a in range(len(idxs)):
                for b in range(a + 1, len(idxs)):
                    ia, ib = idxs[a], idxs[b]
                    if y_rel[ia] > y_rel[ib]:
                        pairs_i.append(ia)
                        pairs_j.append(ib)
                    elif y_rel[ib] > y_rel[ia]:
                        pairs_i.append(ib)
                        pairs_j.append(ia)

        if not pairs_i:
            return self

        xi = torch.tensor(X[pairs_i], dtype=torch.float32)
        xj = torch.tensor(X[pairs_j], dtype=torch.float32)
        target = torch.ones((len(pairs_i), 1), dtype=torch.float32)

        opt = torch.optim.Adam(self.net.parameters(), lr=lr, weight_decay=1e-4)
        loss_fn = nn.BCEWithLogitsLoss()
        self.net.train()
        for _ in range(epochs):
            opt.zero_grad()
            diff = self.net(xi) - self.net(xj)
            loss = loss_fn(diff, target)
            loss.backward()
            opt.step()
        self.net.eval()
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        self.net.eval()
        with torch.no_grad():
            t = torch.tensor(X, dtype=torch.float32)
            return self.net(t).squeeze(-1).numpy()


class LearnedRankerWrapper:
    """Persisted Learning-to-Rank model wrapper."""

    def __init__(self, model: Any, model_name: str, provenance: str, metrics: dict[str, float]) -> None:
        self.model = model
        self.model_name = model_name
        self.provenance = provenance
        self.metrics = metrics

    def score(self, feature_vectors: list[list[float]]) -> list[float]:
        if not feature_vectors:
            return []
        arr = np.asarray(feature_vectors, dtype=np.float32)
        raw = self.model.predict(arr)
        return [round(float(v), 6) for v in raw]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            pickle.dump(self, f)

    @classmethod
    def load(cls, path: Path) -> "LearnedRankerWrapper":
        with path.open("rb") as f:
            return pickle.load(f)


def _group_counts(groups: np.ndarray) -> list[int]:
    """Return contiguous group sizes ordered by appearance."""
    counts: list[int] = []
    if len(groups) == 0:
        return counts
    cur = groups[0]
    cnt = 0
    for g in groups:
        if g == cur:
            cnt += 1
        else:
            counts.append(cnt)
            cur = g
            cnt = 1
    counts.append(cnt)
    return counts


def train_and_compare_rankers(
    X: np.ndarray,
    y_rel: np.ndarray,
    groups: np.ndarray,
    *,
    provenance: str = "synthetic_dev",
    seed: int = 42,
) -> tuple[LearnedRankerWrapper, list[RankingModelReport]]:
    """Compare Baseline Weighted vs Pointwise GBR vs Pairwise Linear vs XGBRanker/LGBMRanker."""
    (X_tr, y_tr, g_tr), (X_val, y_val, g_val), (X_te, y_te, g_te) = group_train_val_test_split(X, y_rel, groups, seed=seed)

    # Sort each split by group_id so group sizes are contiguous for XGBRanker / LGBMRanker
    tr_order = np.argsort(g_tr, kind="stable")
    X_tr, y_tr, g_tr = X_tr[tr_order], y_tr[tr_order], g_tr[tr_order]
    te_order = np.argsort(g_te, kind="stable")
    X_te, y_te, g_te = X_te[te_order], y_te[te_order], g_te[te_order]

    models: dict[str, Any] = {}

    baseline = BaselineWeightedRanker()
    models["baseline_weighted"] = baseline

    pointwise = GradientBoostingRegressor(n_estimators=120, max_depth=3, learning_rate=0.08, random_state=seed)
    pointwise.fit(X_tr, y_tr)
    models["pointwise_gbr"] = pointwise

    pairwise = PairwiseLinearRanker(seed=seed).fit(X_tr, y_tr, g_tr)
    models["pairwise_linear"] = pairwise

    torch_ranker = PairwiseTorchRanker(input_dim=X_tr.shape[1], seed=seed).fit(X_tr, y_tr, g_tr)
    models["pairwise_pytorch"] = torch_ranker

    XGBR = None
    try:
        from xgboost import XGBRanker

        XGBR = XGBRanker
    except Exception:
        pass
    if XGBR is not None:
        xgb_ranker = XGBR(
            objective="rank:ndcg",
            n_estimators=120,
            max_depth=4,
            learning_rate=0.08,
            random_state=seed,
        )
        xgb_ranker.fit(X_tr, y_tr, group=_group_counts(g_tr))
        models["xgboost_rank_ndcg"] = xgb_ranker

    LGBMR = None
    try:
        from lightgbm import LGBMRanker

        LGBMR = LGBMRanker
    except Exception:
        pass
    if LGBMR is not None:
        lgb_ranker = LGBMR(
            objective="lambdarank",
            n_estimators=120,
            max_depth=4,
            learning_rate=0.08,
            random_state=seed,
            verbose=-1,
        )
        lgb_ranker.fit(X_tr, y_tr, group=_group_counts(g_tr))
        models["lightgbm_lambdamart"] = lgb_ranker

    reports: list[RankingModelReport] = []
    best_wrapper: Optional[LearnedRankerWrapper] = None
    best_ndcg10 = -1.0

    for name, mdl in models.items():
        preds_te = mdl.predict(X_te)
        eval_groups = []
        for g in np.unique(g_te):
            mask = g_te == g
            eval_groups.append((preds_te[mask], y_te[mask]))

        metrics = evaluate_ranking_groups(eval_groups, relevance_threshold=2.0)
        rep = RankingModelReport(
            model_name=name,
            provenance=provenance,
            ndcg_at_5=metrics["ndcg@5"],
            ndcg_at_10=metrics["ndcg@10"],
            precision_at_5=metrics["precision@5"],
            recall_at_5=metrics["recall@5"],
            mrr=metrics["mrr"],
            map_score=metrics["map"],
        )
        reports.append(rep)

        if name != "baseline_weighted" and metrics["ndcg@10"] > best_ndcg10:
            best_ndcg10 = metrics["ndcg@10"]
            best_wrapper = LearnedRankerWrapper(
                mdl,
                model_name=name,
                provenance=provenance,
                metrics=metrics,
            )

    assert best_wrapper is not None
    return best_wrapper, reports
