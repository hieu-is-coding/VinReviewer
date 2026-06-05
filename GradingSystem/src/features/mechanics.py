"""Mechanics feature extraction (Phase 2.4).

Uses language-tool-python for grammar/spelling/punctuation error counts.
English only.
"""

from __future__ import annotations

import language_tool_python

from src.models import FeatureValue, Language, Manuscript

_TOOL_CACHE: dict[str, language_tool_python.LanguageTool] = {}


def _get_tool(lang: Language) -> language_tool_python.LanguageTool:
    if "en-US" not in _TOOL_CACHE:
        _TOOL_CACHE["en-US"] = language_tool_python.LanguageTool("en-US")
    return _TOOL_CACHE["en-US"]


# Mapping from LanguageTool categories to our feature IDs
_CATEGORY_MAP = {
    "GRAMMAR": "grammar_errors",
    "TYPOS": "spelling_errors",
    "SPELLING": "spelling_errors",
    "PUNCTUATION": "punctuation_errors",
    "STYLE": "style_suggestions",
}


def extract_mechanics_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract mechanics features via LanguageTool."""
    features: dict[str, FeatureValue] = {}
    text = manuscript.full_text

    if not text.strip():
        return features

    tool = _get_tool(manuscript.language)
    # Limit to first 50k chars for performance
    matches = tool.check(text[:50_000])

    # Count by category
    counts: dict[str, int] = {
        "grammar_errors": 0,
        "spelling_errors": 0,
        "punctuation_errors": 0,
        "style_suggestions": 0,
    }

    for match in matches:
        cat = match.category or ""
        feature_id = _CATEGORY_MAP.get(cat.upper(), "grammar_errors")
        counts[feature_id] += 1

    total_errors = sum(counts.values())
    word_count = max(manuscript.word_count, 1)
    errors_per_100w = (total_errors / word_count) * 100

    features["errors_per_100w"] = FeatureValue(
        id="errors_per_100w",
        raw_value=errors_per_100w,
        label="Errors per 100 words",
    )

    label_map = {
        "grammar_errors": "Grammar error count",
        "spelling_errors": "Spelling error count",
        "punctuation_errors": "Punctuation error count",
        "style_suggestions": "Style suggestion count",
    }

    for fid, count in counts.items():
        features[fid] = FeatureValue(
            id=fid,
            raw_value=float(count),
            label=label_map[fid],
        )

    return features
