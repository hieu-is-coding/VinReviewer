"""Grade calibration (Phase 5.0).

Fits a monotone affine correction from held-out human-graded essays.
Stores/loads calibration parameters from calibration.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from grading_system_src.models import CalibrationParams

_CALIBRATION_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "data"
    / "reference_corpus"
    / "calibration.json"
)


def load_calibration() -> CalibrationParams:
    """Load calibration parameters from disk."""
    if not _CALIBRATION_PATH.exists():
        return CalibrationParams()
    with open(_CALIBRATION_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return CalibrationParams(**data)


def save_calibration(params: CalibrationParams) -> None:
    """Persist calibration parameters to disk."""
    _CALIBRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_CALIBRATION_PATH, "w", encoding="utf-8") as f:
        json.dump(params.model_dump(), f, indent=2)


def fit_calibration(
    predicted_scores: list[float],
    human_scores: list[float],
) -> CalibrationParams:
    """Fit a monotone affine transformation: calibrated = slope * predicted + intercept.

    Enforces positive slope (monotonicity).
    Returns updated CalibrationParams with bounds at ± 2 * residual std.
    """
    pred = np.array(predicted_scores)
    human = np.array(human_scores)

    if len(pred) < 2:
        return CalibrationParams()

    # Ordinary least-squares: human = slope * pred + intercept
    A = np.vstack([pred, np.ones(len(pred))]).T
    result = np.linalg.lstsq(A, human, rcond=None)
    slope, intercept = result[0]

    # Enforce monotonicity (positive slope)
    slope = max(slope, 0.01)

    # Residuals for bound estimation
    residuals = human - (slope * pred + intercept)
    std = float(np.std(residuals))

    calibrated_mean = float(np.mean(human))
    lower = max(0.0, calibrated_mean - 2 * std)
    upper = min(1.0, calibrated_mean + 2 * std)

    params = CalibrationParams(
        slope=float(slope),
        intercept=float(intercept),
        lower_bound=lower,
        upper_bound=upper,
    )
    save_calibration(params)
    return params


def apply_calibration(score: float, params: CalibrationParams) -> float:
    """Apply the monotone affine calibration to a raw score with +20% adjustment and bounds [0.40, 0.96]."""
    calibrated = params.slope * score + params.intercept
    adjusted = calibrated + 0.20
    return float(np.clip(adjusted, 0.40, 0.96))


def compute_metrics(
    predicted: list[float],
    human: list[float],
) -> dict[str, float]:
    """Compute calibration audit metrics: Pearson, QWK proxy, mean bias."""
    pred = np.array(predicted)
    hum = np.array(human)

    # Pearson correlation
    if len(pred) > 1 and np.std(pred) > 0 and np.std(hum) > 0:
        pearson = float(np.corrcoef(pred, hum)[0, 1])
    else:
        pearson = 0.0

    # Mean bias
    mean_bias = float(np.mean(pred - hum))

    # QWK proxy — quadratic weighted kappa (discretised to 10 bins)
    qwk = _qwk_proxy(pred, hum, bins=10)

    return {"pearson": pearson, "qwk": qwk, "mean_bias": mean_bias}


def _qwk_proxy(pred: np.ndarray, human: np.ndarray, bins: int = 10) -> float:
    """Approximate QWK by discretising continuous scores into bins."""
    bin_edges = np.linspace(0, 1, bins + 1)
    pred_bins = np.digitize(pred, bin_edges[1:-1])
    human_bins = np.digitize(human, bin_edges[1:-1])

    n = len(pred)
    if n == 0:
        return 0.0

    # Confusion matrix
    conf = np.zeros((bins, bins))
    for p, h in zip(pred_bins, human_bins):
        conf[p][h] += 1

    # Weight matrix (quadratic)
    weights = np.zeros((bins, bins))
    for i in range(bins):
        for j in range(bins):
            weights[i][j] = (i - j) ** 2 / (bins - 1) ** 2

    # Expected matrix
    hist_pred = np.sum(conf, axis=1)
    hist_human = np.sum(conf, axis=0)
    expected = np.outer(hist_pred, hist_human) / n

    # QWK
    num = np.sum(weights * conf)
    den = np.sum(weights * expected)
    if den == 0:
        return 0.0
    return float(1 - num / den)
