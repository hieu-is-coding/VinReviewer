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
    total_weight = sum(float(c.get("weight", 1)) for c in criteria) or 1.0
    dimensions = [
        RubricNode(
            id=str(c["id"]),
            label=c["name"],
            weight=float(c.get("weight", 1)) / total_weight,
            children=[],
        )
        for c in sorted(criteria, key=lambda x: x.get("sort_order", 0))
    ]
    return RubricTree(dimensions=dimensions, depth=1)
