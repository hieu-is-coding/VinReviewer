"""Map GradingSystem PipelineState → Supabase evaluation rows."""

from __future__ import annotations

from typing import Any

from src.compat import ensure_grading_system
ensure_grading_system()

from src.models import PipelineState  # type: ignore[import]


def map_pipeline_to_evaluation(
    state: PipelineState,
    criteria: list[dict],
    submission_id: str,
) -> dict:
    """Produce the payload for the `evaluations` table row.

    Args:
        state: A GradingSystem PipelineState object.
        criteria: The raw criteria rows fetched from Supabase.
        submission_id: UUID string of the submission.

    Returns:
        Dict suitable for supabase .insert() on the evaluations table.
    """
    total_max = sum(float(c.get("max_score", 5)) for c in criteria)
    calibrated = state.calibrated_score or (state.review.overall_score if state.review else 0.0)
    total_score = round(calibrated * total_max, 2)

    # Confidence from perturbation result or supervisor violations
    violations = state.supervisor_result.violations if state.supervisor_result else []
    confidence = max(0.0, 1.0 - len(violations) * 0.1)

    review = state.review
    deliberation = state.deliberation
    novelty = state.novelty
    evidence_audit = state.evidence_audit
    ref_val = state.reference_validation

    strengths = "\n".join(f"• {s}" for s in (review.strengths if review else []))
    weaknesses = "\n".join(f"• {w}" for w in (review.weaknesses if review else []))

    improvement_parts: list[str] = []
    if evidence_audit and evidence_audit.uncited_claims:
        improvement_parts.append(
            f"Uncited claims ({len(evidence_audit.uncited_claims)}): "
            + "; ".join(c.text[:80] for c in evidence_audit.uncited_claims[:3])
        )
    if novelty and novelty.claims:
        redundant = [c for c in novelty.claims if c.classification == "REDUNDANT"]
        if redundant:
            improvement_parts.append(
                f"Redundant contributions: "
                + "; ".join(c.claim_text[:80] for c in redundant[:3])
            )
    if ref_val and ref_val.fabricated_refs:
        improvement_parts.append(
            f"Potentially fabricated references: " + ", ".join(ref_val.fabricated_refs[:5])
        )

    return {
        "submission_id": submission_id,
        "total_score": total_score,
        "max_possible_score": total_max,
        "confidence": round(confidence * 100),
        "overall_feedback": review.summary if review else "",
        "content_feedback": strengths or None,
        "structure_feedback": weaknesses or None,
        "improvement_suggestions": "\n".join(improvement_parts) or None,
        "evaluation_type": "agentic",
        "status": "completed",
    }


def map_pipeline_to_criteria_scores(
    state: PipelineState,
    criteria: list[dict],
    evaluation_id: str,
) -> list[dict]:
    """Produce rows for the `criteria_scores` table.

    Matches GradingSystem leaf verdicts to criteria by position (index)
    when IDs don't align, since the rubric was built from the same
    ordered criteria list.
    """
    verdicts = []
    if state.deliberation:
        verdicts = state.deliberation.final_verdicts
    elif state.review:
        verdicts = state.review.verdicts

    # Build id → verdict map first, fall back to positional match
    verdict_by_id: dict[str, Any] = {v.leaf_id: v for v in verdicts}

    rows: list[dict] = []
    for i, criterion in enumerate(criteria):
        crit_id = str(criterion["id"])
        max_score = float(criterion.get("max_score", 5))

        verdict = verdict_by_id.get(crit_id)
        if verdict is None and i < len(verdicts):
            verdict = verdicts[i]

        score = round(verdict.score * max_score, 2) if verdict else 0.0
        explanation = verdict.justification if verdict else ""

        rows.append(
            {
                "evaluation_id": evaluation_id,
                "criterion_id": crit_id,
                "score": score,
                "ai_score": score,
                "explanation": explanation,
                "evidence": verdict.suggested_revision if verdict else None,
            }
        )
    return rows


def map_pipeline_to_details(
    state: PipelineState,
    evaluation_id: str,
) -> dict:
    """Produce the payload for the `evaluation_details` table row."""
    evidence_audit = state.evidence_audit
    novelty = state.novelty
    deliberation = state.deliberation
    supervisor = state.supervisor_result
    comparative = state.comparative
    ref_val = state.reference_validation

    return {
        "evaluation_id": evaluation_id,
        "uncited_claims": [c.model_dump() for c in evidence_audit.uncited_claims] if evidence_audit else [],
        "low_similarity_citations": (
            [c.model_dump() for c in evidence_audit.low_similarity_citations] if evidence_audit else []
        ),
        "novelty_score": novelty.overall_novelty_score if novelty else None,
        "novelty_claims": [c.model_dump() for c in novelty.claims] if novelty else [],
        "persona_reviews": (
            [p.model_dump() for p in deliberation.persona_reviews] if deliberation else []
        ),
        "disagreement_flags": deliberation.disagreement_flags if deliberation else [],
        "red_line_violations": (
            [v.model_dump() for v in supervisor.violations] if supervisor else []
        ),
        "human_flag": supervisor.human_flag if supervisor else False,
        "overall_percentile": comparative.overall_percentile if comparative else None,
        "venue_tier": comparative.venue_tier if comparative else None,
        "dimension_percentiles": comparative.dimension_percentiles if comparative else {},
        "verified_ratio": ref_val.verified_ratio if ref_val else None,
        "fabricated_refs": ref_val.fabricated_refs if ref_val else [],
        "pipeline_run_id": state.run_id or None,
    }
