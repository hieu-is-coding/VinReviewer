"""Shared configuration loading utilities."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

_CONFIGS_DIR = Path(__file__).resolve().parent.parent / "configs"


def _load_yaml(name: str) -> dict[str, Any]:
    path = _CONFIGS_DIR / name
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_rubric_config() -> dict[str, Any]:
    return _load_yaml("rubric_dimensions.yaml")


def load_feature_config() -> dict[str, Any]:
    return _load_yaml("feature_subset.yaml")


def load_red_lines_config() -> dict[str, Any]:
    return _load_yaml("red_lines.yaml")
