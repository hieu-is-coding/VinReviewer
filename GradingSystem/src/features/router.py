"""Language-gated feature routing — dispatches to the correct extractors per language."""

from __future__ import annotations

from src.models import Features, FeatureValue, Language, Manuscript

from .cohesion import extract_cohesion_features
from .diversity import extract_diversity_features
from .mechanics import extract_mechanics_features
from .style import extract_style_features
from .citations import extract_citation_features


def extract_all_features(manuscript: Manuscript) -> Features:
    """Run all feature extractors (language-routed) and return a flat Features dict."""
    values: dict[str, FeatureValue] = {}

    extractors = [
        extract_cohesion_features,
        extract_style_features,
        extract_diversity_features,
        extract_mechanics_features,
        extract_citation_features,
    ]

    for extractor in extractors:
        result = extractor(manuscript)
        values.update(result)

    return Features(values=values)
