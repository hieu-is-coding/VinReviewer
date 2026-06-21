"""Multi-persona deliberation — 3 reviewer personas + aggregation via voting."""

from __future__ import annotations

import json
import logging

import numpy as np
from langchain_core.messages import HumanMessage, SystemMessage

from grading_system_src.llm import get_llm, invoke_llm
from grading_system_src.prompts import load_prompt
from grading_system_src.synthesis.prompt import _build_user_message, invoke_llm_synthesis
from grading_system_src.models import (
    DeliberationResult,
    EvidenceAudit,
    Features,
    LeafVerdict,
    Manuscript,
    NoveltyAssessment,
    PersonaReview,
    RubricTree,
)
from grading_system_src.synthesis.prompt import _build_user_message

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Persona system prompts
# ---------------------------------------------------------------------------

_PERSONA_PROMPTS = {
    "methodology": load_prompt("persona_methodology"),
    "domain": load_prompt("persona_domain"),
    "communication": load_prompt("persona_communication"),
}

_BASE_INSTRUCTIONS = """\
You will receive a rubric tree, quantitative features, evidence audit, and manuscript.
Score EVERY leaf criterion in the rubric (0.0 to 1.0). Ground your assessment
in the provided data. Be honest and calibrated — no grade inflation.
"""


def _generate_persona_review(
    persona: str,
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    features: Features,
    evidence_audit: EvidenceAudit,
    novelty: NoveltyAssessment | None = None,
    *,
    model_name: str | None = None,
) -> PersonaReview:
    """Generate a review from a single persona."""
    system_prompt = _BASE_INSTRUCTIONS + "\n\n" + _PERSONA_PROMPTS[persona]
    user_msg = _build_user_message(manuscript, rubric_tree, features, evidence_audit)

    # Add novelty context for domain expert
    if persona == "domain" and novelty and novelty.claims:
        novelty_info = {
            "overall_novelty_score": novelty.overall_novelty_score,
            "claims": [
                {
                    "claim": c.claim_text[:200],
                    "classification": c.classification,
                    "max_similarity": round(c.max_similarity, 3),
                    "closest_paper": c.closest_paper_title[:100],
                }
                for c in novelty.claims
            ],
        }
        user_msg += f"\n\n## Novelty Assessment\n```json\n{json.dumps(novelty_info, indent=2)}\n```"

    llm = get_llm(model=model_name, temperature=0.4, json_mode=True)
    response = invoke_llm_synthesis(
        llm=llm,
        system_prompt=system_prompt,
        user_msg=user_msg,
        manuscript_path=manuscript.source_path,
    )

    data = json.loads(response.content)
    verdicts = [
        LeafVerdict(
            leaf_id=v["leaf_id"],
            score=v["score"],
            justification=v.get("justification", ""),
            suggested_revision=v.get("suggested_revision", ""),
        )
        for v in data.get("verdicts", [])
    ]

    return PersonaReview(
        persona=persona,
        verdicts=verdicts,
        overall_score=data.get("overall_score", 0.0),
        summary=data.get("summary", ""),
    )


def _aggregate_verdicts(
    persona_reviews: list[PersonaReview],
    rubric_tree: RubricTree,
    disagreement_threshold: float = 0.15,
) -> tuple[list[LeafVerdict], list[str], float]:
    """Aggregate verdicts from multiple personas via weighted averaging.

    Returns:
        Tuple of (final_verdicts, disagreement_leaf_ids, final_overall_score).
    """
    # Collect all leaf IDs from rubric
    leaf_ids = _collect_leaf_ids(rubric_tree)

    # Build score matrix: leaf_id → list of (score, justification, revision)
    score_map: dict[str, list[tuple[float, str, str]]] = {lid: [] for lid in leaf_ids}

    for review in persona_reviews:
        for verdict in review.verdicts:
            if verdict.leaf_id in score_map:
                score_map[verdict.leaf_id].append(
                    (verdict.score, verdict.justification, verdict.suggested_revision)
                )

    final_verdicts: list[LeafVerdict] = []
    disagreement_flags: list[str] = []

    for leaf_id in leaf_ids:
        entries = score_map[leaf_id]
        if not entries:
            final_verdicts.append(LeafVerdict(leaf_id=leaf_id, score=0.5))
            continue

        scores = [e[0] for e in entries]
        mean_score = float(np.mean(scores))
        std_score = float(np.std(scores))

        # Flag high disagreement
        if std_score > disagreement_threshold:
            disagreement_flags.append(leaf_id)

        # Pick justification from persona closest to mean
        best_idx = int(np.argmin([abs(s - mean_score) for s in scores]))
        _, justification, revision = entries[best_idx]

        final_verdicts.append(LeafVerdict(
            leaf_id=leaf_id,
            score=round(mean_score, 4),
            justification=justification,
            suggested_revision=revision,
        ))

    # Compute final overall score (simple mean of persona scores)
    final_score = float(np.mean([r.overall_score for r in persona_reviews]))

    return final_verdicts, disagreement_flags, final_score


def _collect_leaf_ids(rubric_tree: RubricTree) -> list[str]:
    """Recursively collect all leaf node IDs from the rubric tree."""
    leaf_ids: list[str] = []

    def _walk(node):
        if not node.children:
            leaf_ids.append(node.id)
        for child in node.children:
            _walk(child)

    for dim in rubric_tree.dimensions:
        _walk(dim)
    return leaf_ids


def run_deliberation(
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    features: Features,
    evidence_audit: EvidenceAudit,
    novelty: NoveltyAssessment | None = None,
    *,
    model_name: str | None = None,
) -> DeliberationResult:
    """Run multi-persona review generation and deliberation in parallel.

    Generates 3 independent reviews (methodology, domain, communication experts)
    concurrently using a thread pool, then aggregates via weighted voting.
    """
    import concurrent.futures

    personas = ["methodology", "domain", "communication"]
    persona_reviews_map: dict[str, PersonaReview] = {}

    logger.info("Generating 3 persona reviews in parallel...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(personas)) as executor:
        futures = {
            executor.submit(
                _generate_persona_review,
                persona,
                manuscript,
                rubric_tree,
                features,
                evidence_audit,
                novelty=novelty,
                model_name=model_name,
            ): persona
            for persona in personas
        }
        for future in concurrent.futures.as_completed(futures):
            persona = futures[future]
            try:
                review = future.result()
                persona_reviews_map[persona] = review
                logger.info("  %s persona overall score: %.3f", persona, review.overall_score)
            except Exception as exc:
                logger.error("%s persona review generated an exception: %s", persona, exc)
                raise

    # Reconstruct list in the original, deterministic order
    persona_reviews = [persona_reviews_map[p] for p in personas]

    # Aggregate
    final_verdicts, disagreement_flags, final_score = _aggregate_verdicts(
        persona_reviews, rubric_tree
    )

    if disagreement_flags:
        logger.warning(
            "High disagreement on %d leaves: %s",
            len(disagreement_flags),
            disagreement_flags,
        )

    return DeliberationResult(
        persona_reviews=persona_reviews,
        disagreement_flags=disagreement_flags,
        final_verdicts=final_verdicts,
        final_score=round(final_score, 4),
    )
