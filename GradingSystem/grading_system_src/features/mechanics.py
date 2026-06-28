"""Mechanics feature extraction (Phase 2.4).

Uses gpt-4o-mini structured output to count grammar/spelling/punctuation errors.
English only.
"""

from __future__ import annotations

import logging
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage

from grading_system_src.llm import get_llm
from grading_system_src.models import FeatureValue, Manuscript

logger = logging.getLogger(__name__)


class MechanicsCounts(BaseModel):
    grammar_errors: int = Field(description="Count of grammatical errors in the text snippet")
    spelling_errors: int = Field(description="Count of spelling errors/typos in the text snippet")
    punctuation_errors: int = Field(description="Count of punctuation errors in the text snippet")
    style_suggestions: int = Field(description="Count of style suggestion flags in the text snippet")


def extract_mechanics_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract mechanics features via gpt-4o-mini structured output."""
    features: dict[str, FeatureValue] = {}
    text = manuscript.full_text

    if not text.strip():
        return features

    # Limit to first 20k chars for prompt efficiency (approx 3,000 words)
    sample_text = text[:20_000]

    try:
        llm = get_llm(model="gpt-4o-mini", temperature=0.0)
        structured_llm = llm.with_structured_output(MechanicsCounts)
        
        system_prompt = (
            "You are an expert academic copyeditor. Analyze the provided manuscript excerpt "
            "and count the occurrences of errors in grammar, spelling/typos, punctuation, "
            "and style suggestions. Be realistic and precise."
        )
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Manuscript excerpt:\n\n{sample_text}"),
        ]
        
        result = structured_llm.invoke(messages)
        counts = {
            "grammar_errors": result.grammar_errors,
            "spelling_errors": result.spelling_errors,
            "punctuation_errors": result.punctuation_errors,
            "style_suggestions": result.style_suggestions,
        }
    except Exception as exc:
        logger.warning("Failed to invoke mechanics extraction LLM: %s. Using default 0s.", exc)
        counts = {
            "grammar_errors": 0,
            "spelling_errors": 0,
            "punctuation_errors": 0,
            "style_suggestions": 0,
        }

    sample_word_count = max(len(sample_text.split()), 1)
    total_errors = sum(counts.values())
    errors_per_100w = (total_errors / sample_word_count) * 100

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

    full_word_count = max(manuscript.word_count, 1)
    scale_factor = full_word_count / sample_word_count

    for fid, count in counts.items():
        scaled_count = float(round(count * scale_factor))
        features[fid] = FeatureValue(
            id=fid,
            raw_value=scaled_count,
            label=label_map[fid],
        )

    return features

