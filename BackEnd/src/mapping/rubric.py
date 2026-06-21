"""Map Supabase criteria rows → GradingSystem RubricTree."""

from __future__ import annotations

from src.compat import ensure_grading_system
ensure_grading_system()

from src.models import RubricNode, RubricTree  # type: ignore[import]


def map_criteria_to_rubric(criteria: list[dict]) -> RubricTree:
    """Convert Supabase criteria rows to a GradingSystem RubricTree.

    Weights are normalised to sum to 1.0 across all criteria so that the
    pipeline's score aggregation is consistent regardless of how the
    instructor set absolute weight values.
    """
    sorted_criteria = sorted(criteria, key=lambda x: x.get("sort_order", 0))
    weights = [float(c.get("weight", 1)) for c in sorted_criteria]
    if sum(weights) == 0:
        weights = [1.0] * len(sorted_criteria)
    total_weight = sum(weights) or 1.0

    dimensions = [
        RubricNode(
            id=str(c["id"]),
            label=c["name"],
            weight=float(weights[i]) / total_weight,
            children=[],
        )
        for i, c in enumerate(sorted_criteria)
    ]
    return RubricTree(dimensions=dimensions, depth=1)
