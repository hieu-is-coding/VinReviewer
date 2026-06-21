"""Tests for multi-persona deliberation."""

from unittest.mock import MagicMock, patch

import pytest

from grading_system_src.models import (
    DeliberationResult,
    EvidenceAudit,
    Features,
    Language,
    LeafVerdict,
    Manuscript,
    NoveltyAssessment,
    PersonaReview,
    RubricNode,
    RubricTree,
)
from grading_system_src.synthesis.deliberation import (
    _aggregate_verdicts,
    _collect_leaf_ids,
    run_deliberation,
)


def _make_rubric() -> RubricTree:
    return RubricTree(
        dimensions=[
            RubricNode(
                id="dim1",
                label="Dimension 1",
                weight=0.5,
                children=[
                    RubricNode(id="leaf1", label="Leaf 1", weight=0.5),
                    RubricNode(id="leaf2", label="Leaf 2", weight=0.5),
                ],
            ),
            RubricNode(
                id="dim2",
                label="Dimension 2",
                weight=0.5,
                children=[
                    RubricNode(id="leaf3", label="Leaf 3", weight=1.0),
                ],
            ),
        ]
    )


class TestCollectLeafIds:
    def test_collects_leaves(self):
        rubric = _make_rubric()
        leaves = _collect_leaf_ids(rubric)
        assert set(leaves) == {"leaf1", "leaf2", "leaf3"}


class TestAggregateVerdicts:
    def test_agreement(self):
        rubric = _make_rubric()
        reviews = [
            PersonaReview(
                persona="methodology",
                verdicts=[
                    LeafVerdict(leaf_id="leaf1", score=0.8, justification="Good"),
                    LeafVerdict(leaf_id="leaf2", score=0.7, justification="OK"),
                    LeafVerdict(leaf_id="leaf3", score=0.9, justification="Great"),
                ],
                overall_score=0.8,
            ),
            PersonaReview(
                persona="domain",
                verdicts=[
                    LeafVerdict(leaf_id="leaf1", score=0.75, justification="Fine"),
                    LeafVerdict(leaf_id="leaf2", score=0.65, justification="Meh"),
                    LeafVerdict(leaf_id="leaf3", score=0.85, justification="Good"),
                ],
                overall_score=0.75,
            ),
            PersonaReview(
                persona="communication",
                verdicts=[
                    LeafVerdict(leaf_id="leaf1", score=0.78, justification="Clear"),
                    LeafVerdict(leaf_id="leaf2", score=0.72, justification="Decent"),
                    LeafVerdict(leaf_id="leaf3", score=0.88, justification="Solid"),
                ],
                overall_score=0.79,
            ),
        ]
        verdicts, flags, score = _aggregate_verdicts(reviews, rubric)
        assert len(verdicts) == 3
        assert len(flags) == 0  # All agree within threshold
        assert 0.7 < score < 0.85

    def test_disagreement_flagged(self):
        rubric = _make_rubric()
        reviews = [
            PersonaReview(
                persona="methodology",
                verdicts=[
                    LeafVerdict(leaf_id="leaf1", score=0.9),
                    LeafVerdict(leaf_id="leaf2", score=0.3),  # Big disagreement
                    LeafVerdict(leaf_id="leaf3", score=0.7),
                ],
                overall_score=0.6,
            ),
            PersonaReview(
                persona="domain",
                verdicts=[
                    LeafVerdict(leaf_id="leaf1", score=0.85),
                    LeafVerdict(leaf_id="leaf2", score=0.8),  # Big disagreement
                    LeafVerdict(leaf_id="leaf3", score=0.75),
                ],
                overall_score=0.8,
            ),
            PersonaReview(
                persona="communication",
                verdicts=[
                    LeafVerdict(leaf_id="leaf1", score=0.88),
                    LeafVerdict(leaf_id="leaf2", score=0.7),
                    LeafVerdict(leaf_id="leaf3", score=0.72),
                ],
                overall_score=0.77,
            ),
        ]
        verdicts, flags, score = _aggregate_verdicts(reviews, rubric)
        assert "leaf2" in flags  # High variance on leaf2
