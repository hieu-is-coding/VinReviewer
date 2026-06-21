"""Tests for cohesion feature extractor."""

from grading_system_src.features.cohesion import extract_cohesion_features
from grading_system_src.models import Language, Manuscript


def test_en_cohesion_features(en_manuscript: Manuscript) -> None:
    features = extract_cohesion_features(en_manuscript)
    # EN should produce lsa_coherence, taaco_adjacent_overlap, taaco_paragraph_overlap
    assert "lsa_coherence" in features
    assert "taaco_adjacent_overlap" in features
    assert "taaco_paragraph_overlap" in features
    # Values should be between -1 and 1 (cosine similarity)
    assert -1.0 <= features["lsa_coherence"].raw_value <= 1.0
    assert -1.0 <= features["taaco_adjacent_overlap"].raw_value <= 1.0


def test_empty_text_returns_empty() -> None:
    ms = Manuscript(
        source_path="test",
        language=Language.EN,
        full_text="Short.",
    )
    features = extract_cohesion_features(ms)
    assert len(features) == 0
