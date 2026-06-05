"""Perturbation confidence testing — estimate review reliability via input stability."""

from __future__ import annotations

import logging
import random
import re

import numpy as np
from langchain_core.messages import HumanMessage, SystemMessage

from src.features.router import extract_all_features
from src.features.normalize import normalize_features
from src.llm import get_llm, invoke_llm
from src.models import (
    EvidenceAudit,
    Manuscript,
    PerturbationResult,
    RubricTree,
)
from src.synthesis.prompt import generate_review

logger = logging.getLogger(__name__)


def _paraphrase_abstract(abstract: str) -> str:
    """Use LLM to paraphrase the abstract while preserving meaning."""
    llm = get_llm(temperature=0.7)

    response = invoke_llm(llm, [
        SystemMessage(content="Paraphrase the following academic abstract. "
                      "Preserve ALL factual content and meaning. Change only phrasing and word choice."),
        HumanMessage(content=abstract),
    ])
    return response.content


def _shuffle_sections(manuscript: Manuscript) -> Manuscript:
    """Create a copy with mid-sections shuffled (preserve intro/conclusion)."""
    if len(manuscript.sections) <= 3:
        return manuscript

    sections = list(manuscript.sections)
    # Keep first and last section fixed, shuffle middle
    middle = sections[1:-1]
    random.shuffle(middle)
    new_sections = [sections[0]] + middle + [sections[-1]]

    # Rebuild full text
    new_full_text = "\n\n".join(
        f"{s.heading}\n{s.body}" for s in new_sections
    )

    return manuscript.model_copy(update={
        "sections": new_sections,
        "full_text": new_full_text,
    })


def _remove_random_section(manuscript: Manuscript) -> Manuscript:
    """Create a copy with one random mid-section removed."""
    if len(manuscript.sections) <= 3:
        return manuscript

    sections = list(manuscript.sections)
    # Remove a random middle section
    mid_indices = list(range(1, len(sections) - 1))
    remove_idx = random.choice(mid_indices)
    new_sections = sections[:remove_idx] + sections[remove_idx + 1:]

    new_full_text = "\n\n".join(
        f"{s.heading}\n{s.body}" for s in new_sections
    )

    return manuscript.model_copy(update={
        "sections": new_sections,
        "full_text": new_full_text,
        "word_count": len(new_full_text.split()),
    })


def _lightweight_score(
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    evidence_audit: EvidenceAudit,
) -> float:
    """Run a lightweight scoring pass (features + single synthesis) and return overall score."""
    features = extract_all_features(manuscript)
    features = normalize_features(features)
    review = generate_review(manuscript, rubric_tree, features, evidence_audit)
    return review.overall_score


def run_perturbation_test(
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    evidence_audit: EvidenceAudit,
    original_score: float,
    *,
    n_perturbations: int = 3,
) -> PerturbationResult:
    """Test score stability under input perturbations.

    Generates perturbed versions of the manuscript and checks if scores remain stable.

    Args:
        manuscript: Original parsed manuscript.
        rubric_tree: Rubric tree for scoring.
        evidence_audit: Evidence audit from original run.
        original_score: The original review score.
        n_perturbations: Number of perturbations to run.

    Returns:
        PerturbationResult with stability metrics.
    """
    scores = [original_score]
    perturbations_run = 0

    # Perturbation 1: Paraphrase abstract
    try:
        logger.info("Perturbation 1: paraphrasing abstract")
        new_abstract = _paraphrase_abstract(manuscript.abstract)
        perturbed = manuscript.model_copy(update={"abstract": new_abstract})
        score = _lightweight_score(perturbed, rubric_tree, evidence_audit)
        scores.append(score)
        perturbations_run += 1
    except Exception as e:
        logger.warning("Perturbation 1 (paraphrase) failed: %s", e)

    # Perturbation 2: Shuffle sections
    if perturbations_run < n_perturbations:
        try:
            logger.info("Perturbation 2: shuffling sections")
            perturbed = _shuffle_sections(manuscript)
            score = _lightweight_score(perturbed, rubric_tree, evidence_audit)
            scores.append(score)
            perturbations_run += 1
        except Exception as e:
            logger.warning("Perturbation 2 (shuffle) failed: %s", e)

    # Perturbation 3: Remove random section
    if perturbations_run < n_perturbations:
        try:
            logger.info("Perturbation 3: removing random section")
            perturbed = _remove_random_section(manuscript)
            score = _lightweight_score(perturbed, rubric_tree, evidence_audit)
            scores.append(score)
            perturbations_run += 1
        except Exception as e:
            logger.warning("Perturbation 3 (remove section) failed: %s", e)

    # Compute stability metrics
    score_std = float(np.std(scores)) if len(scores) > 1 else 0.0
    confidence = max(0.0, 1.0 - min(score_std / 0.15, 1.0))

    # Determine confidence label
    if confidence >= 0.7:
        label = "HIGH"
    elif confidence >= 0.4:
        label = "MEDIUM"
    else:
        label = "LOW"

    return PerturbationResult(
        scores=scores,
        score_std=round(score_std, 4),
        confidence=round(confidence, 4),
        unstable_leaves=[],  # Could be extended with per-leaf analysis
        confidence_label=label,
    )
