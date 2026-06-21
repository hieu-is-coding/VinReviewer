"""Tests for citation feature extractor."""

from grading_system_src.features.citations import extract_citation_features
from grading_system_src.models import Language, Manuscript


def test_citation_features(en_manuscript: Manuscript) -> None:
    features = extract_citation_features(en_manuscript)
    assert "citation_count" in features
    assert "citation_density" in features
    assert "unique_sources" in features
    assert "self_citation_ratio" in features
    assert "citation_recency_median" in features
    # Should count the inline citations
    assert features["citation_count"].raw_value == len(en_manuscript.inline_citations)
    # Unique sources ≤ total citations
    assert features["unique_sources"].raw_value <= features["citation_count"].raw_value


def test_no_references() -> None:
    ms = Manuscript(
        source_path="test",
        language=Language.EN,
        full_text="A simple text.",
        word_count=3,
    )
    features = extract_citation_features(ms)
    assert features["citation_count"].raw_value == 0.0
    assert features["citation_density"].raw_value == 0.0
