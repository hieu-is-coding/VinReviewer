"""Rebuttal handler — process author rebuttals and re-evaluate verdicts."""

from __future__ import annotations

import json
import logging
import os

from langchain_core.messages import HumanMessage, SystemMessage

from src.llm import get_llm, invoke_llm
from src.prompts import load_prompt
from src.models import (
    LeafVerdict,
    Manuscript,
    RebuttalEntry,
    RebuttalOutcome,
    RebuttalResult,
    ReviewOutput,
    RubricTree,
)

logger = logging.getLogger(__name__)




def _find_relevant_section(manuscript: Manuscript, leaf_id: str) -> str:
    """Find the manuscript section most relevant to a rubric leaf."""
    # Simple heuristic: search for section with keyword overlap to leaf_id
    leaf_keywords = leaf_id.replace("_", " ").lower().split()

    best_section = ""
    best_score = 0

    for section in manuscript.sections:
        heading_lower = section.heading.lower()
        score = sum(1 for kw in leaf_keywords if kw in heading_lower)
        if score > best_score:
            best_score = score
            best_section = f"{section.heading}\n{section.body[:1500]}"

    # Fallback to first 2000 chars of full text
    if not best_section:
        best_section = manuscript.full_text[:2000]

    return best_section


def _evaluate_single_rebuttal(
    original_verdict: LeafVerdict,
    rebuttal: RebuttalEntry,
    manuscript: Manuscript,
    model_name: str,
) -> RebuttalOutcome:
    """Evaluate a single rebuttal against its original verdict."""
    relevant_text = _find_relevant_section(manuscript, rebuttal.leaf_id)

    user_msg = (
        f"## Original Verdict\n"
        f"- Criterion: {original_verdict.leaf_id}\n"
        f"- Score: {original_verdict.score}\n"
        f"- Justification: {original_verdict.justification}\n"
        f"- Suggested revision: {original_verdict.suggested_revision}\n\n"
        f"## Author's Rebuttal\n{rebuttal.response}\n\n"
        f"## Relevant Manuscript Section\n{relevant_text}"
    )

    llm = get_llm(model=model_name, temperature=0.2, json_mode=True)

    response = invoke_llm(llm, [
        SystemMessage(content=load_prompt("rebuttal")),
        HumanMessage(content=user_msg),
    ])

    data = json.loads(response.content)

    revised_score = float(data.get("revised_score", original_verdict.score))
    # Enforce ±0.20 cap
    revised_score = max(
        original_verdict.score - 0.20,
        min(original_verdict.score + 0.20, revised_score),
    )
    revised_score = max(0.0, min(1.0, revised_score))

    return RebuttalOutcome(
        leaf_id=rebuttal.leaf_id,
        original_score=original_verdict.score,
        revised_score=round(revised_score, 4),
        accepted=data.get("accepted", False),
        revised_justification=data.get("revised_justification", ""),
    )


def process_rebuttals(
    rebuttals: list[RebuttalEntry],
    review: ReviewOutput,
    manuscript: Manuscript,
    *,
    model_name: str | None = None,
) -> RebuttalResult:
    """Process author rebuttals and produce revised scores.

    Args:
        rebuttals: List of author rebuttals (one per leaf criterion).
        review: Original review output with verdicts.
        manuscript: Parsed manuscript.
        model_name: LLM model for re-evaluation.

    Returns:
        RebuttalResult with per-leaf outcomes and revised overall score.
    """
    model_name = model_name or os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Build verdict lookup
    verdict_map = {v.leaf_id: v for v in review.verdicts}

    outcomes: list[RebuttalOutcome] = []
    for rebuttal in rebuttals:
        original = verdict_map.get(rebuttal.leaf_id)
        if not original:
            logger.warning("Rebuttal for unknown leaf '%s' — skipping", rebuttal.leaf_id)
            continue

        logger.info("Evaluating rebuttal for leaf '%s'", rebuttal.leaf_id)
        outcome = _evaluate_single_rebuttal(original, rebuttal, manuscript, model_name)
        outcomes.append(outcome)

    # Compute revised overall score
    # Replace rebutted leaf scores, keep others unchanged
    revised_scores = {v.leaf_id: v.score for v in review.verdicts}
    for outcome in outcomes:
        revised_scores[outcome.leaf_id] = outcome.revised_score

    revised_overall = sum(revised_scores.values()) / len(revised_scores) if revised_scores else 0.0
    score_delta = revised_overall - review.overall_score

    return RebuttalResult(
        outcomes=outcomes,
        revised_overall_score=round(revised_overall, 4),
        score_delta=round(score_delta, 4),
    )
