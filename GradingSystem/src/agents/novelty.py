"""Novelty assessment agent — evaluate whether paper contributions are genuinely novel."""

from __future__ import annotations

import json
import logging

import numpy as np
from langchain_core.messages import HumanMessage, SystemMessage

from src.llm import get_llm, invoke_llm
from src.model_cache import get_encoder
from src.models import LitPool, Manuscript, NoveltyAssessment, NoveltyClaimResult
from src.prompts import load_prompt

logger = logging.getLogger(__name__)


def _extract_contribution_claims(
    manuscript: Manuscript,
    model_name: str | None = None,
) -> list[str]:
    """Use LLM to extract explicit contribution claims from the manuscript."""
    llm = get_llm(model=model_name, temperature=0.0)

    # Gather intro text (first section or first 2000 chars of full text)
    intro_text = ""
    for section in manuscript.sections:
        if any(kw in section.heading.lower() for kw in ("intro", "overview", "contribution")):
            intro_text = section.body[:2000]
            break
    if not intro_text:
        intro_text = manuscript.full_text[:2000]

    user_content = (
        f"Title: {manuscript.title}\n\n"
        f"Abstract: {manuscript.abstract}\n\n"
        f"Introduction excerpt:\n{intro_text}"
    )

    messages = [
        SystemMessage(content=load_prompt("contribution_extraction")),
        HumanMessage(content=user_content),
    ]

    response = invoke_llm(llm, messages)
    try:
        claims = json.loads(response.content)
        if isinstance(claims, list):
            return [str(c) for c in claims[:5]]
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning(
            "Failed to parse contribution claims: %s — raw: %.200s. Using abstract as fallback.",
            exc,
            response.content,
        )

    # Fallback: use abstract sentences as claims
    sentences = [s.strip() for s in manuscript.abstract.split(".") if len(s.strip()) > 20]
    return sentences[:3]


def _compute_novelty_scores(
    claims: list[str],
    lit_pool: LitPool,
) -> list[NoveltyClaimResult]:
    """Compute similarity of each claim against literature pool abstracts."""
    if not claims or not lit_pool.entries:
        return [
            NoveltyClaimResult(claim_text=c, classification="NOVEL")
            for c in claims
        ]

    encoder = get_encoder()

    # Encode claims
    claim_embeddings = encoder.encode(claims, normalize_embeddings=True)

    # Encode literature abstracts (use title + abstract for better coverage)
    lit_texts = [
        f"{entry.title}. {entry.abstract}" if entry.abstract else entry.title
        for entry in lit_pool.entries
    ]
    lit_embeddings = encoder.encode(lit_texts, normalize_embeddings=True)

    results: list[NoveltyClaimResult] = []
    for i, claim in enumerate(claims):
        # Cosine similarity (embeddings are already normalized)
        similarities = claim_embeddings[i] @ lit_embeddings.T
        max_idx = int(np.argmax(similarities))
        max_sim = float(similarities[max_idx])

        # Classify based on similarity threshold
        if max_sim >= 0.80:
            classification = "REDUNDANT"
        elif max_sim >= 0.65:
            classification = "INCREMENTAL"
        else:
            classification = "NOVEL"

        closest_entry = lit_pool.entries[max_idx]
        results.append(
            NoveltyClaimResult(
                claim_text=claim,
                max_similarity=max_sim,
                closest_paper_id=closest_entry.paper_id,
                closest_paper_title=closest_entry.title,
                classification=classification,
            )
        )

    return results


def assess_novelty(
    manuscript: Manuscript,
    lit_pool: LitPool,
    *,
    model_name: str | None = None,
) -> NoveltyAssessment:
    """Assess the novelty of a manuscript's contributions against retrieved literature.

    Args:
        manuscript: Parsed manuscript.
        lit_pool: Literature pool from retrieval agent.
        model_name: LLM model for contribution extraction.

    Returns:
        NoveltyAssessment with per-claim results and overall novelty score.
    """
    # Step 1: Extract contribution claims
    claims = _extract_contribution_claims(manuscript, model_name=model_name)
    logger.info("Extracted %d contribution claims", len(claims))

    if not claims:
        return NoveltyAssessment(overall_novelty_score=0.5)

    # Step 2: Compute novelty scores against literature
    claim_results = _compute_novelty_scores(claims, lit_pool)

    # Step 3: Compute overall novelty score
    # NOVEL=1.0, INCREMENTAL=0.5, REDUNDANT=0.1
    novelty_weights = {"NOVEL": 1.0, "INCREMENTAL": 0.5, "REDUNDANT": 0.1}
    scores = [novelty_weights[r.classification] for r in claim_results]
    overall_score = float(np.mean(scores)) if scores else 0.5

    return NoveltyAssessment(
        claims=claim_results,
        overall_novelty_score=overall_score,
    )
