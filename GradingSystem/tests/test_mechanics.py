"""Tests for mechanics feature extractor."""

from src.features.mechanics import extract_mechanics_features
from src.models import Language, Manuscript


def test_mechanics_features(en_manuscript: Manuscript) -> None:
    features = extract_mechanics_features(en_manuscript)
    assert "errors_per_100w" in features
    assert "grammar_errors" in features
    assert "spelling_errors" in features
    assert "punctuation_errors" in features
    assert "style_suggestions" in features
    # Errors per 100w should be non-negative
    assert features["errors_per_100w"].raw_value >= 0.0


def test_empty_text_returns_empty() -> None:
    ms = Manuscript(source_path="test", language=Language.EN, full_text="")
    features = extract_mechanics_features(ms)
    assert len(features) == 0
