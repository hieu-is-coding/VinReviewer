"""Tests for calibration module."""

import numpy as np

from grading_system_src.calibration.calibrator import (
    apply_calibration,
    compute_metrics,
    fit_calibration,
)
from grading_system_src.models import CalibrationParams


def test_fit_calibration_identity() -> None:
    """When predicted ≈ human, slope should be ~1 and intercept ~0."""
    predicted = [0.3, 0.5, 0.7, 0.9]
    human = [0.3, 0.5, 0.7, 0.9]
    params = fit_calibration(predicted, human)
    assert abs(params.slope - 1.0) < 0.1
    assert abs(params.intercept) < 0.1


def test_fit_calibration_positive_bias() -> None:
    """When predicted > human consistently, intercept should be negative."""
    predicted = [0.5, 0.6, 0.7, 0.8]
    human = [0.3, 0.4, 0.5, 0.6]
    params = fit_calibration(predicted, human)
    assert params.intercept < 0, "Positive bias should produce negative intercept"


def test_apply_calibration_clamps() -> None:
    """Calibrated score should always be in [0.4, 0.96]."""
    params = CalibrationParams(slope=2.0, intercept=-0.5)
    assert apply_calibration(0.0, params) == 0.40
    assert apply_calibration(1.0, params) == 0.96


def test_compute_metrics() -> None:
    """Metrics should return pearson, qwk, mean_bias."""
    predicted = [0.3, 0.5, 0.7, 0.9]
    human = [0.35, 0.55, 0.65, 0.85]
    metrics = compute_metrics(predicted, human)
    assert "pearson" in metrics
    assert "qwk" in metrics
    assert "mean_bias" in metrics
    # Pearson should be high for a near-linear relationship
    assert metrics["pearson"] > 0.9


def test_fit_with_too_few_samples() -> None:
    """With <2 samples, should return default params."""
    params = fit_calibration([0.5], [0.5])
    assert params.slope == 1.0
    assert params.intercept == 0.0
