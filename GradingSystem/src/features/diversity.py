"""Lexical diversity feature extraction (Phase 2.3).

Uses `lexicalrichness` for MTLD, HD-D, Maas, Yule's K.
"""

from __future__ import annotations

import logging

from lexicalrichness import LexicalRichness

from src.models import FeatureValue, Manuscript

logger = logging.getLogger(__name__)


def extract_diversity_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract lexical diversity features (language-independent)."""
    features: dict[str, FeatureValue] = {}
    text = manuscript.full_text

    if len(text.split()) < 50:
        return features

    lex = LexicalRichness(text)

    # MTLD — Measure of Textual Lexical Diversity
    try:
        mtld_val = lex.mtld(threshold=0.72)
        features["mtld"] = FeatureValue(
            id="mtld", raw_value=float(mtld_val), label="MTLD",
        )
    except Exception as e:
        logger.warning("MTLD extraction failed: %s — feature omitted", e)

    # HD-D — Hypergeometric Distribution D
    try:
        hdd_val = lex.hdd(draws=42)
        features["hdd"] = FeatureValue(
            id="hdd", raw_value=float(hdd_val), label="HD-D",
        )
    except Exception as e:
        logger.warning("HD-D extraction failed: %s — feature omitted", e)

    # Maas
    try:
        maas_val = lex.Maas
        features["maas"] = FeatureValue(
            id="maas", raw_value=float(maas_val), label="Maas index",
        )
    except Exception as e:
        logger.warning("Maas index extraction failed: %s — feature omitted", e)

    # Yule's K
    try:
        yulek_val = lex.yulek
        features["yulek"] = FeatureValue(
            id="yulek", raw_value=float(yulek_val), label="Yule's K",
        )
    except Exception as e:
        logger.warning("Yule's K extraction failed: %s — feature omitted", e)

    return features
