"""AgentObjective — builds a rubric tree adapted to the assignment prompt.

Uses AutoSOTA's BFS tree approach: weight conservation, depth ≤ 3, hierarchical
context injection (shallow/intermediate/deep).

Supports venue-aware weight adjustment when a target venue is specified.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from grading_system_src.config import load_rubric_config
from grading_system_src.llm import get_llm, invoke_llm
from grading_system_src.models import RubricNode, RubricTree
from grading_system_src.prompts import load_prompt

logger = logging.getLogger(__name__)


def build_rubric_tree(
    assignment_prompt: str,
    *,
    target_venue: str = "",
    model_name: str | None = None,
    temperature: float = 0.2,
) -> RubricTree:
    """Build a rubric tree customised to the assignment prompt.
    Starts from the default rubric in configs/rubric_dimensions.yaml and asks the
    LLM to adapt it. If target_venue is specified, applies venue-specific weight
    multipliers before LLM adaptation.
    """
    default_cfg = load_rubric_config()

    # Apply venue-aware weight adjustment if target venue specified
    if target_venue:
        default_cfg = _apply_venue_weights(default_cfg, target_venue)

    default_json = json.dumps(default_cfg["dimensions"], indent=2)

    user_msg = (
        f"## Default rubric dimensions\n```json\n{default_json}\n```\n\n"
        f"## Assignment prompt\n{assignment_prompt}\n\n"
        "Produce the customised rubric tree JSON."
    )

    llm = get_llm(model=model_name, temperature=temperature, json_mode=True)
    response = invoke_llm(llm, [
        SystemMessage(content=load_prompt("rubric_system")),
        HumanMessage(content=user_msg),
    ])

    data = json.loads(response.content)
    dimensions = [_parse_node(d) for d in data["dimensions"]]
    return RubricTree(dimensions=dimensions)


def _parse_node(d: dict) -> RubricNode:
    children = [_parse_node(c) for c in d.get("children", [])]
    return RubricNode(
        id=d["id"],
        label=d["label"],
        weight=d["weight"],
        children=children,
    )


# ---------------------------------------------------------------------------
# Venue-aware weight adjustment
# ---------------------------------------------------------------------------

def _load_venues_config() -> dict:
    """Load venue profiles from configs/venues.yaml."""
    import yaml

    venues_path = Path(__file__).parent.parent.parent / "configs" / "venues.yaml"
    if not venues_path.exists():
        return {}
    with open(venues_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_venue_profile(venue_name: str) -> dict:
    """Get the venue profile by name (case-insensitive), falling back to 'default'."""
    config = _load_venues_config()
    venues = config.get("venues", {})
    venue_key = venue_name.strip().lower()
    return venues.get(venue_key, venues.get("default", {}))


def _apply_venue_weights(rubric_cfg: dict, venue_name: str) -> dict:
    """Apply venue emphasis multipliers to rubric dimension weights and renormalize."""
    profile = get_venue_profile(venue_name)
    emphasis = profile.get("emphasis", {})

    if not emphasis:
        return rubric_cfg

    dimensions = rubric_cfg.get("dimensions", [])
    # Apply multipliers
    for dim in dimensions:
        dim_id = dim.get("id", "")
        multiplier = emphasis.get(dim_id, 1.0)
        dim["weight"] = dim["weight"] * multiplier

    # Renormalize to sum to 1.0
    total = sum(d["weight"] for d in dimensions)
    if total > 0:
        for dim in dimensions:
            dim["weight"] = round(dim["weight"] / total, 4)

    logger.info("Applied venue '%s' weight adjustment (tier: %s)", venue_name, profile.get("tier", "unknown"))
    return rubric_cfg
