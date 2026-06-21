"""Tests for the rubric and result mapping layers."""

import pytest

from src.compat import ensure_grading_system
ensure_grading_system()

from src.mapping.rubric import map_criteria_to_rubric  # noqa: E402


SAMPLE_CRITERIA = [
    {"id": "crit-1", "name": "Clarity", "weight": 2, "max_score": 5, "sort_order": 0},
    {"id": "crit-2", "name": "Depth", "weight": 3, "max_score": 10, "sort_order": 1},
    {"id": "crit-3", "name": "Citations", "weight": 1, "max_score": 5, "sort_order": 2},
]


def test_rubric_weights_normalised():
    tree = map_criteria_to_rubric(SAMPLE_CRITERIA)
    total = sum(n.weight for n in tree.dimensions)
    assert abs(total - 1.0) < 1e-6, f"Weights should sum to 1.0, got {total}"


def test_rubric_order_preserved():
    tree = map_criteria_to_rubric(SAMPLE_CRITERIA)
    labels = [n.label for n in tree.dimensions]
    assert labels == ["Clarity", "Depth", "Citations"]


def test_rubric_ids_match():
    tree = map_criteria_to_rubric(SAMPLE_CRITERIA)
    ids = [n.id for n in tree.dimensions]
    assert ids == ["crit-1", "crit-2", "crit-3"]


def test_rubric_single_criterion():
    criteria = [{"id": "only", "name": "Solo", "weight": 5, "max_score": 10, "sort_order": 0}]
    tree = map_criteria_to_rubric(criteria)
    assert len(tree.dimensions) == 1
    assert tree.dimensions[0].weight == pytest.approx(1.0)


def test_rubric_zero_weight_fallback():
    criteria = [
        {"id": "a", "name": "A", "weight": 0, "max_score": 5, "sort_order": 0},
        {"id": "b", "name": "B", "weight": 0, "max_score": 5, "sort_order": 1},
    ]
    # Should not divide by zero
    tree = map_criteria_to_rubric(criteria)
    total = sum(n.weight for n in tree.dimensions)
    assert abs(total - 1.0) < 1e-6


def test_map_pipeline_to_evaluation(mock_pipeline_state):
    from src.mapping.result import map_pipeline_to_evaluation

    criteria = [
        {"id": "crit-1", "name": "Clarity", "weight": 2, "max_score": 5, "sort_order": 0},
        {"id": "crit-2", "name": "Depth", "weight": 3, "max_score": 10, "sort_order": 1},
    ]

    payload = map_pipeline_to_evaluation(mock_pipeline_state, criteria, "sub-uuid-123")

    assert payload["submission_id"] == "sub-uuid-123"
    assert payload["total_score"] == pytest.approx(10.5)  # 0.7 calibrated_score * 15 max total score
    assert payload["max_possible_score"] == 15
    assert payload["confidence"] == 100  # 1.0 confidence * 100
    assert payload["overall_feedback"] == "Good overall paper"
    assert payload["content_feedback"] == "• Strong methodology\n• Good flow"
    assert payload["structure_feedback"] == "• Needs details in section 3"
    assert payload["evaluation_type"] == "agentic"
    assert payload["status"] == "completed"


def test_map_pipeline_to_criteria_scores(mock_pipeline_state):
    from src.mapping.result import map_pipeline_to_criteria_scores

    criteria = [
        {"id": "crit-1", "name": "Clarity", "weight": 2, "max_score": 5, "sort_order": 0},
        {"id": "crit-2", "name": "Depth", "weight": 3, "max_score": 10, "sort_order": 1},
    ]

    rows = map_pipeline_to_criteria_scores(mock_pipeline_state, criteria, "eval-uuid-123")

    assert len(rows) == 2
    
    # crit-1
    assert rows[0]["evaluation_id"] == "eval-uuid-123"
    assert rows[0]["criterion_id"] == "crit-1"
    assert rows[0]["score"] == pytest.approx(4.0)  # 0.8 * 5
    assert rows[0]["ai_score"] == pytest.approx(4.0)
    assert rows[0]["explanation"] == "Clear explanation"
    assert rows[0]["evidence"] == "None"

    # crit-2
    assert rows[1]["evaluation_id"] == "eval-uuid-123"
    assert rows[1]["criterion_id"] == "crit-2"
    assert rows[1]["score"] == pytest.approx(6.0)  # 0.6 * 10
    assert rows[1]["ai_score"] == pytest.approx(6.0)
    assert rows[1]["explanation"] == "Moderate depth"
    assert rows[1]["evidence"] == "Add details"


def test_map_pipeline_to_details(mock_pipeline_state):
    from src.mapping.result import map_pipeline_to_details

    details = map_pipeline_to_details(mock_pipeline_state, "eval-uuid-123")

    assert details["evaluation_id"] == "eval-uuid-123"
    assert details["novelty_score"] == 85.0
    assert details["novelty_claims"][0]["claim_text"] == "New method"
    assert details["novelty_claims"][0]["classification"] == "NOVEL"
    assert len(details["uncited_claims"]) == 1
    assert details["uncited_claims"][0]["text"] == "Uncited statement"
    assert details["overall_percentile"] == 75.0
    assert details["venue_tier"] == "Tier 1"
    assert details["dimension_percentiles"] == {"Clarity": 80.0}
    assert details["verified_ratio"] == 0.9
    assert details["fabricated_refs"] == ["Fabricated Ref 1"]
    assert details["pipeline_run_id"] == "run-uuid-123"

