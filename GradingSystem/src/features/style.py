"""Syntactic / style feature extraction (Phase 2.2).

EN → linguaf MDD (mean dependency distance), sentence length, subordination,
    TAALES academic word frequency proxy.
"""

from __future__ import annotations

import re

import spacy

from src.models import FeatureValue, Language, Manuscript

_NLP_CACHE: dict[str, spacy.language.Language] = {}


def _get_nlp(lang: Language) -> spacy.language.Language:
    if "en_core_web_sm" not in _NLP_CACHE:
        _NLP_CACHE["en_core_web_sm"] = spacy.load("en_core_web_sm")
    return _NLP_CACHE["en_core_web_sm"]


def extract_style_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract syntactic/style features, gated by language."""
    features: dict[str, FeatureValue] = {}
    nlp = _get_nlp(manuscript.language)

    # Process with spaCy (limit to first 100k chars for performance)
    doc = nlp(manuscript.full_text[:100_000])
    sents = list(doc.sents)

    if not sents:
        return features

    # Mean Dependency Distance (MDD) — linguaf-style
    mdd_values = []
    for sent in sents:
        distances = []
        for token in sent:
            if token.head != token:
                distances.append(abs(token.i - token.head.i))
        if distances:
            mdd_values.append(sum(distances) / len(distances))

    if mdd_values:
        import numpy as np
        features["mdd_mean"] = FeatureValue(
            id="mdd_mean",
            raw_value=float(np.mean(mdd_values)),
            label="Mean dependency distance",
        )
        features["mdd_variance"] = FeatureValue(
            id="mdd_variance",
            raw_value=float(np.var(mdd_values)),
            label="Dependency distance variance",
        )

    # Mean sentence length (tokens)
    sent_lengths = [len(sent) for sent in sents]
    import numpy as np
    features["mean_sentence_length"] = FeatureValue(
        id="mean_sentence_length",
        raw_value=float(np.mean(sent_lengths)),
        label="Mean sentence length (tokens)",
    )

    # Subordination ratio — proportion of subordinate clauses
    sub_count = sum(1 for token in doc if token.dep_ in {"advcl", "relcl", "csubj", "ccomp", "acl"})
    total_clauses = max(len(sents), 1)
    features["subordination_ratio"] = FeatureValue(
        id="subordination_ratio",
        raw_value=sub_count / total_clauses,
        label="Subordination ratio",
    )

    # Language-specific features
    features.update(_english_style_features(doc))

    return features


# AWL (Academic Word List) — simplified subset of Coxhead (2000)
_AWL_SAMPLE = {
    "analysis", "approach", "area", "assess", "assume", "authority", "available",
    "benefit", "concept", "consistent", "constitute", "context", "contract",
    "create", "data", "define", "derive", "distribute", "economy", "environment",
    "establish", "estimate", "evident", "export", "factor", "finance", "formula",
    "function", "identify", "income", "indicate", "individual", "interpret",
    "involve", "issue", "labour", "legal", "legislate", "major", "method",
    "occur", "percent", "period", "policy", "principle", "proceed", "process",
    "require", "research", "respond", "role", "section", "sector", "significant",
    "similar", "source", "specific", "structure", "theory", "vary",
}


def _english_style_features(doc: spacy.tokens.Doc) -> dict[str, FeatureValue]:
    """TAALES-proxy: academic word frequency."""
    tokens = [t.lemma_.lower() for t in doc if t.is_alpha]
    if not tokens:
        return {}
    awl_count = sum(1 for t in tokens if t in _AWL_SAMPLE)
    return {
        "taales_academic_word": FeatureValue(
            id="taales_academic_word",
            raw_value=awl_count / len(tokens),
            label="Academic word frequency",
        )
    }


