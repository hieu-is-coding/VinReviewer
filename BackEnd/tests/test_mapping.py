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
