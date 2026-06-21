"""Citation feature extraction (Phase 2.5).

Derived from GROBID-extracted references and inline citations.
Works for both EN and ES.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from grading_system_src.models import FeatureValue, Manuscript


def extract_citation_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract citation-related features from the manuscript."""
    features: dict[str, FeatureValue] = {}
    refs = manuscript.references
    inline = manuscript.inline_citations
    word_count = max(manuscript.word_count, 1)

    # Total citations (inline count)
    features["citation_count"] = FeatureValue(
        id="citation_count",
        raw_value=float(len(inline)),
        label="Total citations",
    )

    # Citations per 1000 words
    features["citation_density"] = FeatureValue(
        id="citation_density",
        raw_value=(len(inline) / word_count) * 1000,
        label="Citations per 1000 words",
    )

    # Unique sources cited
    unique = set(inline)
    features["unique_sources"] = FeatureValue(
        id="unique_sources",
        raw_value=float(len(unique)),
        label="Unique sources cited",
    )

    # Self-citation ratio — heuristic: references where an author appears in the
    # manuscript title or first section (proxy for self-citation).
    # Simplified: count refs with ≥1 author name appearing in the abstract.
    self_cite_count = 0
    abstract_lower = manuscript.abstract.lower()
    for ref in refs:
        for author in ref.authors:
            surname = author.split()[-1].lower() if author else ""
            if surname and len(surname) > 2 and surname in abstract_lower:
                self_cite_count += 1
                break
    features["self_citation_ratio"] = FeatureValue(
        id="self_citation_ratio",
        raw_value=self_cite_count / max(len(refs), 1),
        label="Self-citation ratio",
    )

    # Median citation recency (years since publication)
    current_year = datetime.now().year
    years_ago: list[float] = []
    for ref in refs:
        if ref.year and ref.year > 1900:
            years_ago.append(current_year - ref.year)
    if years_ago:
        features["citation_recency_median"] = FeatureValue(
            id="citation_recency_median",
            raw_value=float(np.median(years_ago)),
            label="Median citation recency (years)",
        )
    else:
        features["citation_recency_median"] = FeatureValue(
            id="citation_recency_median",
            raw_value=0.0,
            label="Median citation recency (years)",
        )

    return features
