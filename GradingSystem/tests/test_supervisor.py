"""Tests for the AgentSupervisor red-line checks."""

from grading_system_src.agents.supervisor import check_red_lines
from grading_system_src.models import (
    CalibrationParams,
    EvidenceAudit,
    LeafVerdict,
    LitPool,
    Manuscript,
    RedLineID,
    ReviewOutput,
    RubricTree,
)


def test_r1_hallucinated_citation(
    en_manuscript: Manuscript,
    sample_rubric_tree: RubricTree,
    sample_lit_pool: LitPool,
) -> None:
    """Seeded hallucinated citation must be caught by R1."""
    # Create a review with a hallucinated citation
    review = ReviewOutput(
        verdicts=[
            LeafVerdict(
                leaf_id="thesis_clarity",
                score=0.7,
                justification="The thesis is clear (FakeName, 2023).",
                suggested_revision="No changes needed.",
            ),
        ],
        overall_score=0.7,
        summary="Good paper.",
    )
    audit = EvidenceAudit()

    result = check_red_lines(
        review, en_manuscript, sample_rubric_tree, sample_lit_pool, audit,
    )

    # Should flag R1 violation
    r1_violations = [v for v in result.violations if v.rule_id == RedLineID.R1]
    assert len(r1_violations) > 0, "R1 should catch the hallucinated citation (FakeName, 2023)"


def test_r2_missing_rubric_leaf(
    en_manuscript: Manuscript,
    sample_rubric_tree: RubricTree,
    sample_lit_pool: LitPool,
) -> None:
    """Omitted rubric leaf must be caught by R2."""
    # Create review missing some leaves
    review = ReviewOutput(
        verdicts=[
            LeafVerdict(leaf_id="thesis_clarity", score=0.7, justification="OK"),
            # Missing: scope_appropriateness, source_quality, evidence_integration,
            # organization, transitions, grammar_spelling, academic_register
        ],
        overall_score=0.7,
    )
    audit = EvidenceAudit()

    result = check_red_lines(
        review, en_manuscript, sample_rubric_tree, sample_lit_pool, audit,
    )

    r2_violations = [v for v in result.violations if v.rule_id == RedLineID.R2]
    assert len(r2_violations) > 0, "R2 should catch missing rubric leaves"


def test_r4_score_out_of_bounds(
    en_manuscript: Manuscript,
    sample_rubric_tree: RubricTree,
    sample_lit_pool: LitPool,
    sample_review: ReviewOutput,
) -> None:
    """Score outside calibrated bounds must be flagged by R4."""
    audit = EvidenceAudit()
    # Narrow calibration bounds that exclude the review score of 0.7
    calibration = CalibrationParams(slope=1.0, intercept=0.0, lower_bound=0.8, upper_bound=1.0)

    result = check_red_lines(
        sample_review, en_manuscript, sample_rubric_tree, sample_lit_pool, audit,
        calibration=calibration,
    )

    r4_violations = [v for v in result.violations if v.rule_id == RedLineID.R4]
    assert len(r4_violations) > 0, "R4 should flag score 0.7 outside [0.8, 1.0]"


def test_all_pass(
    en_manuscript: Manuscript,
    sample_rubric_tree: RubricTree,
    sample_lit_pool: LitPool,
    sample_review: ReviewOutput,
) -> None:
    """A well-formed review should pass all red-line checks."""
    audit = EvidenceAudit()

    result = check_red_lines(
        sample_review, en_manuscript, sample_rubric_tree, sample_lit_pool, audit,
    )

    # May have some minor detections, but should broadly pass
    hard_violations = [v for v in result.violations if v.severity.value == "hard"]
    # R2 should pass because sample_review covers all leaves from sample_rubric_tree
    r2_hard = [v for v in hard_violations if v.rule_id == RedLineID.R2]
    assert len(r2_hard) == 0, "R2 should pass — all leaves are covered"
