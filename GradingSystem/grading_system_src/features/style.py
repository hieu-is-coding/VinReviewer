"""Syntactic / style feature extraction (Phase 2.2).

Uses gpt-4o-mini structured output to estimate style and syntactic features.
English only.
"""

from __future__ import annotations

import logging
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage

from grading_system_src.llm import get_llm
from grading_system_src.models import FeatureValue, Manuscript

logger = logging.getLogger(__name__)


class StyleFeatures(BaseModel):
    mdd_mean: float = Field(description="Mean dependency distance (typically between 1.5 and 3.5)")
    mdd_variance: float = Field(description="Dependency distance variance (typically between 0.5 and 2.5)")
    mean_sentence_length: float = Field(description="Mean sentence length in words")
    subordination_ratio: float = Field(description="Subordination ratio (proportion of subordinate clauses, typically between 0.05 and 0.4)")
    taales_academic_word: float = Field(description="Academic word frequency (ratio of academic words to total words, typically between 0.01 and 0.15)")


def extract_style_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract syntactic/style features via gpt-4o-mini structured output."""
    features: dict[str, FeatureValue] = {}
    text = manuscript.full_text

    if not text.strip():
        return features

    # Limit to first 20k chars for prompt efficiency
    sample_text = text[:20_000]

    try:
        llm = get_llm(model="gpt-4o-mini", temperature=0.0)
        structured_llm = llm.with_structured_output(StyleFeatures)

        system_prompt = (
            "You are an advanced computational linguistics analyzer. Estimate the following style and syntactic "
            "features for the provided academic text sample:\n"
            "1. mean_sentence_length: The average number of words per sentence.\n"
            "2. subordination_ratio: The proportion of subordinate clauses relative to the total number of sentences (typically between 0.05 and 0.5).\n"
            "3. mdd_mean: The mean dependency distance (average syntactic distance between related words, typically between 1.5 and 3.5).\n"
            "4. mdd_variance: The variance of dependency distances (typically between 0.5 and 3.0).\n"
            "5. taales_academic_word: The proportion of Academic Word List (AWL) tokens relative to total words (typically between 0.02 and 0.15)."
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Manuscript excerpt:\n\n{sample_text}"),
        ]

        result = structured_llm.invoke(messages)
        
        features["mdd_mean"] = FeatureValue(
            id="mdd_mean",
            raw_value=result.mdd_mean,
            label="Mean dependency distance",
        )
        features["mdd_variance"] = FeatureValue(
            id="mdd_variance",
            raw_value=result.mdd_variance,
            label="Dependency distance variance",
        )
        features["mean_sentence_length"] = FeatureValue(
            id="mean_sentence_length",
            raw_value=result.mean_sentence_length,
            label="Mean sentence length (tokens)",
        )
        features["subordination_ratio"] = FeatureValue(
            id="subordination_ratio",
            raw_value=result.subordination_ratio,
            label="Subordination ratio",
        )
        features["taales_academic_word"] = FeatureValue(
            id="taales_academic_word",
            raw_value=result.taales_academic_word,
            label="Academic word frequency",
        )
    except Exception as exc:
        logger.warning("Failed to invoke style extraction LLM: %s. Using default baseline values.", exc)
        features["mdd_mean"] = FeatureValue(id="mdd_mean", raw_value=2.2, label="Mean dependency distance")
        features["mdd_variance"] = FeatureValue(id="mdd_variance", raw_value=1.1, label="Dependency distance variance")
        features["mean_sentence_length"] = FeatureValue(id="mean_sentence_length", raw_value=21.0, label="Mean sentence length (tokens)")
        features["subordination_ratio"] = FeatureValue(id="subordination_ratio", raw_value=0.15, label="Subordination ratio")
        features["taales_academic_word"] = FeatureValue(id="taales_academic_word", raw_value=0.06, label="Academic word frequency")

    return features



