"""Tests for style feature extractor."""

from grading_system_src.features.style import extract_style_features
from grading_system_src.models import Language, Manuscript


def test_en_style_features(en_manuscript: Manuscript) -> None:
    features = extract_style_features(en_manuscript)
    assert "mdd_mean" in features
    assert "mdd_variance" in features
    assert "mean_sentence_length" in features
    assert "subordination_ratio" in features
    assert "taales_academic_word" in features
    # MDD should be positive
    assert features["mdd_mean"].raw_value > 0
    # Sentence length should be positive
    assert features["mean_sentence_length"].raw_value > 0
    # Academic word freq should be between 0 and 1
    assert 0.0 <= features["taales_academic_word"].raw_value <= 1.0


def test_empty_text_returns_empty() -> None:
    ms = Manuscript(source_path="test", language=Language.EN, full_text="")
    features = extract_style_features(ms)
    assert len(features) == 0
