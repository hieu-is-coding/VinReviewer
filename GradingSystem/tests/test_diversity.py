"""Tests for lexical diversity feature extractor."""

from src.features.diversity import extract_diversity_features
from src.models import Language, Manuscript


def test_diversity_features(en_manuscript: Manuscript) -> None:
    features = extract_diversity_features(en_manuscript)
    # Should produce MTLD, HD-D, Maas, Yule's K
    assert "mtld" in features
    assert "hdd" in features
    assert "maas" in features
    assert "yulek" in features
    # MTLD is typically > 0
    assert features["mtld"].raw_value > 0


def test_short_text_returns_empty() -> None:
    ms = Manuscript(
        source_path="test",
        language=Language.EN,
        full_text="Too short for analysis.",
    )
    features = extract_diversity_features(ms)
    # Less than 50 words → skip
    assert len(features) == 0
