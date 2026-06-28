"""Comparative scoring — percentile positioning against reference corpus."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import math

from grading_system_src.agents.objective import get_venue_profile
from grading_system_src.models import ComparativePosition, RubricTree, LeafVerdict

logger = logging.getLogger(__name__)


def _load_tier_baselines() -> dict:
    """Load tier baselines from venues.yaml."""
    import yaml

    venues_path = Path(__file__).parent.parent.parent / "configs" / "venues.yaml"
    if not venues_path.exists():
        return {}
    with open(venues_path, encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    return config.get("tier_baselines", {})


def _norm_cdf(x: float, loc: float, scale: float) -> float:
    if scale <= 0:
        return 0.5
    return 0.5 * (1.0 + math.erf((x - loc) / (scale * math.sqrt(2.0))))


def compute_comparative_position(
    calibrated_score: float,
    verdicts: list[LeafVerdict],
    *,
    target_venue: str = "",
) -> ComparativePosition:
    """Compute percentile positioning of the paper against a reference corpus.

    Args:
        calibrated_score: The calibrated overall score.
        verdicts: Per-leaf verdicts for dimension-level percentiles.
        target_venue: Target venue name (determines which tier baseline to use).

    Returns:
        ComparativePosition with percentiles and comparative statements.
    """
    # Determine venue tier
    tier = "general"
    if target_venue:
        profile = get_venue_profile(target_venue)
        tier = profile.get("tier", "general")

    # Load baselines
    baselines = _load_tier_baselines()
    tier_baseline = baselines.get(tier, {"mean": 0.58, "std": 0.12})

    mean = tier_baseline.get("mean", 0.58)
    std = tier_baseline.get("std", 0.12)

    # Compute overall percentile
    if std > 0:
        overall_percentile = float(_norm_cdf(calibrated_score, loc=mean, scale=std) * 100)
    else:
        overall_percentile = 50.0

    # Compute per-dimension percentiles (using same baseline as proxy)
    dimension_percentiles: dict[str, float] = {}
    for verdict in verdicts:
        if std > 0:
            pctile = float(_norm_cdf(verdict.score, loc=mean, scale=std) * 100)
        else:
            pctile = 50.0
        dimension_percentiles[verdict.leaf_id] = round(pctile, 1)

    # Generate comparative statements
    statements = _generate_statements(
        calibrated_score, overall_percentile, tier, dimension_percentiles
    )

    return ComparativePosition(
        overall_percentile=round(overall_percentile, 1),
        dimension_percentiles=dimension_percentiles,
        venue_tier=tier,
        comparative_statements=statements,
    )


def _generate_statements(
    score: float,
    percentile: float,
    tier: str,
    dim_percentiles: dict[str, float],
) -> list[str]:
    """Generate human-readable comparative statements."""
    statements: list[str] = []

    # Overall statement
    tier_label = tier.replace("_", " ")
    statements.append(
        f"This paper scores in the {percentile:.0f}th percentile "
        f"relative to submissions at {tier_label} venues."
    )

    # Strength/weakness statements for extreme dimensions
    if dim_percentiles:
        sorted_dims = sorted(dim_percentiles.items(), key=lambda x: x[1], reverse=True)
        top = sorted_dims[0]
        bottom = sorted_dims[-1]

        if top[1] >= 75:
            statements.append(
                f"Strongest aspect: '{top[0]}' ({top[1]:.0f}th percentile)."
            )
        if bottom[1] <= 30:
            statements.append(
                f"Weakest aspect: '{bottom[0]}' ({bottom[1]:.0f}th percentile) — "
                f"below average for {tier_label} submissions."
            )

    # Acceptance likelihood
    if percentile >= 70:
        statements.append("Based on historical data, this paper has a strong chance of acceptance.")
    elif percentile >= 45:
        statements.append("This paper is in the borderline range; revision is recommended.")
    else:
        statements.append("This paper is below the typical acceptance threshold for this venue tier.")

    return statements
