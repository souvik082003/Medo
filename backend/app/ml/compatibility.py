"""ML Job Compatibility Prediction (baselines vs calibrated Gradient Boosting / XGBoost / LightGBM)."""
from __future__ import annotations

import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score, log_loss, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .features import FEATURE_NAMES
from ..ranking.metrics import expected_calibration_error


def _optional_xgb():
    try:
        from xgboost import XGBClassifier

        return XGBClassifier
    except Exception:
        return None


def _optional_lgbm():
    try:
        from lightgbm import LGBMClassifier

        return LGBMClassifier
    except Exception:
        return None


@dataclass
class CompatibilityModelReport:
    model_name: str
    provenance: str
    train_size: int
    val_size: int
    test_size: int
    roc_auc: float
    f1: float
    brier_score: float
    log_loss_val: float
    ece: float


def generate_synthetic_compatibility_dataset(
    n_candidates: int = 80,
    jobs_per_candidate: int = 15,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Generate a clearly labeled synthetic development dataset for compatibility & LTR.

    Returns (X, y_binary, y_relevance_grade, group_ids).
    """
    rng = np.random.default_rng(seed)
    rows: list[list[float]] = []
    labels: list[int] = []
    grades: list[int] = []
    groups: list[int] = []

    for cid in range(n_candidates):
        for _ in range(jobs_per_candidate):
            sem = float(rng.beta(2.2, 2.0))
            req_cov = float(np.clip(sem * 0.6 + rng.normal(0.2, 0.2), 0.0, 1.0))
            skill_cov = float(np.clip(req_cov * 0.85 + rng.uniform(-0.1, 0.15), 0.0, 1.0))
            exp_fit = float(rng.uniform(0.2, 1.0))
            sen_fit = float(rng.choice([0.25, 0.5, 0.75, 1.0], p=[0.1, 0.2, 0.3, 0.4]))
            edu_fit = float(rng.choice([0.3, 0.65, 1.0], p=[0.15, 0.25, 0.6]))
            loc_fit = float(rng.choice([0.2, 0.75, 1.0], p=[0.2, 0.3, 0.5]))
            wm_fit = float(rng.choice([0.15, 0.55, 1.0], p=[0.15, 0.25, 0.6]))
            jt_fit = float(rng.choice([0.1, 1.0], p=[0.1, 0.9]))
            sal_fit = float(rng.uniform(0.3, 1.0))
            recency = float(rng.uniform(0.15, 1.0))
            affinity = float(rng.uniform(0.2, 0.85))

            latent = (
                2.8 * req_cov
                + 2.1 * sem
                + 1.3 * exp_fit
                + 1.1 * loc_fit
                + 0.8 * sen_fit
                + 0.6 * sal_fit
                + 0.5 * wm_fit
                + 0.4 * jt_fit
                - 4.6
                + float(rng.normal(0.0, 0.35))
            )
            prob = 1.0 / (1.0 + np.exp(-latent))
            y_bin = 1 if prob >= 0.5 else 0
            # 0=irrelevant, 1=save, 2=shortlist, 3=apply/interview
            grade = 3 if prob >= 0.8 else (2 if prob >= 0.62 else (1 if prob >= 0.42 else 0))

            rows.append([sem, skill_cov, req_cov, exp_fit, sen_fit, edu_fit, loc_fit, wm_fit, jt_fit, sal_fit, recency, affinity])
            labels.append(y_bin)
            grades.append(grade)
            groups.append(cid)

    return (
        np.asarray(rows, dtype=np.float32),
        np.asarray(labels, dtype=np.int64),
        np.asarray(grades, dtype=np.int64),
        np.asarray(groups, dtype=np.int64),
    )


def group_train_val_test_split(
    X: np.ndarray,
    y: np.ndarray,
    groups: np.ndarray,
    *,
    seed: int = 42,
) -> tuple[tuple[np.ndarray, np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Split by group_id so no candidate group leaks across train/val/test."""
    gss1 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    train_val_idx, test_idx = next(gss1.split(X, y, groups))

    gss2 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    tr_rel, val_rel = next(gss2.split(X[train_val_idx], y[train_val_idx], groups[train_val_idx]))
    train_idx = train_val_idx[tr_rel]
    val_idx = train_val_idx[val_rel]

    return (
        (X[train_idx], y[train_idx], groups[train_idx]),
        (X[val_idx], y[val_idx], groups[val_idx]),
        (X[test_idx], y[test_idx], groups[test_idx]),
    )


class CompatibilityModelWrapper:
    """Calibrated ML compatibility predictor with confidence estimation."""

    def __init__(self, estimator: Any, model_name: str, provenance: str, metrics: dict[str, float]) -> None:
        self.estimator = estimator
        self.model_name = model_name
        self.provenance = provenance
        self.metrics = metrics
        self.feature_names = list(FEATURE_NAMES)

    def predict_probability(self, feature_vector: list[float]) -> tuple[float, float]:
        """Return (compatibility_probability, confidence_score)."""
        arr = np.asarray([feature_vector], dtype=np.float32)
        probs = self.estimator.predict_proba(arr)[0]
        p1 = float(probs[1])
        # Distance from 0.5 decision boundary scaled to [0, 1] as prediction certainty
        margin_conf = min(1.0, abs(p1 - 0.5) * 2.0)
        return round(p1, 4), round(0.5 + 0.5 * margin_conf, 4)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            pickle.dump(self, f)

    @classmethod
    def load(cls, path: Path) -> "CompatibilityModelWrapper":
        with path.open("rb") as f:
            return pickle.load(f)


def train_and_compare_compatibility_models(
    X: np.ndarray,
    y: np.ndarray,
    groups: np.ndarray,
    *,
    provenance: str = "synthetic_dev",
    seed: int = 42,
) -> tuple[CompatibilityModelWrapper, list[CompatibilityModelReport]]:
    """Train LogisticRegression, RandomForest, GradientBoosting, and XGBoost/LightGBM; calibrate & evaluate."""
    (X_tr, y_tr, _), (X_val, y_val, _), (X_te, y_te, _) = group_train_val_test_split(X, y, groups, seed=seed)

    candidates: dict[str, Any] = {
        "logistic_regression": Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression(max_iter=1000, random_state=seed))]),
        "random_forest": RandomForestClassifier(n_estimators=120, max_depth=8, random_state=seed),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=120, max_depth=3, learning_rate=0.08, random_state=seed),
    }

    XGB = _optional_xgb()
    if XGB is not None:
        candidates["xgboost"] = XGB(
            n_estimators=150, max_depth=4, learning_rate=0.08, eval_metric="logloss", random_state=seed
        )
    LGBM = _optional_lgbm()
    if LGBM is not None:
        candidates["lightgbm"] = LGBM(n_estimators=150, max_depth=4, learning_rate=0.08, random_state=seed, verbose=-1)

    reports: list[CompatibilityModelReport] = []
    best_wrapper: Optional[CompatibilityModelWrapper] = None
    best_brier = float("inf")

    for name, base_est in candidates.items():
        # Calibrate using 3-fold CV on train+val (strictly excluding test split!)
        X_tr_val = np.vstack([X_tr, X_val])
        y_tr_val = np.concatenate([y_tr, y_val])
        cal = CalibratedClassifierCV(estimator=base_est, method="sigmoid", cv=3)
        cal.fit(X_tr_val, y_tr_val)

        probs_te = cal.predict_proba(X_te)[:, 1]
        preds_te = (probs_te >= 0.5).astype(int)

        auc = round(float(roc_auc_score(y_te, probs_te)), 4)
        f1 = round(float(f1_score(y_te, preds_te)), 4)
        brier = round(float(brier_score_loss(y_te, probs_te)), 4)
        ll = round(float(log_loss(y_te, probs_te)), 4)
        ece = expected_calibration_error(y_te, probs_te)

        rep = CompatibilityModelReport(
            model_name=name,
            provenance=provenance,
            train_size=len(X_tr),
            val_size=len(X_val),
            test_size=len(X_te),
            roc_auc=auc,
            f1=f1,
            brier_score=brier,
            log_loss_val=ll,
            ece=ece,
        )
        reports.append(rep)

        if brier < best_brier:
            best_brier = brier
            best_wrapper = CompatibilityModelWrapper(
                cal,
                model_name=f"{name}_calibrated",
                provenance=provenance,
                metrics={"roc_auc": auc, "f1": f1, "brier_score": brier, "log_loss": ll, "ece": ece},
            )

    assert best_wrapper is not None
    return best_wrapper, reports
