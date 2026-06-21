"""Tests for the feature normalization module."""

from unittest.mock import patch
from grading_system_src.features.normalize import normalize_features
from grading_system_src.models import Features, FeatureValue


def test_normalize_with_no_baselines() -> None:
    """With empty baselines, z_score remains None."""
    features = Features(values={
        "mtld": FeatureValue(id="mtld", raw_value=80.0, label="MTLD"),
    })
    
    with patch("grading_system_src.features.normalize._load_baselines", return_value={}):
        result = normalize_features(features)
        assert result.values["mtld"].z_score is None


def test_normalize_clips() -> None:
    """Z-scores should be clipped to [-3, 3]."""
    features = Features(values={
        "mtld": FeatureValue(id="mtld", raw_value=200.0, label="MTLD"),
    })
    
    mock_baselines = {
        "mtld": {"mean": 100.0, "std": 10.0}  # z = (200 - 100)/10 = 10, clipped to 3
    }
    
    with patch("grading_system_src.features.normalize._load_baselines", return_value=mock_baselines):
        result = normalize_features(features)
        assert result.values["mtld"].z_score == 3.0
