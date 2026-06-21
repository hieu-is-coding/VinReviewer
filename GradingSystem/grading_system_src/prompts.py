"""Prompt loading utilities — read prompts from external files with caching."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache(maxsize=32)
def load_prompt(name: str) -> str:
    """Load a prompt file from the prompts/ directory. Cached after first read."""
    path = _PROMPTS_DIR / f"{name}.txt"
    return path.read_text(encoding="utf-8").strip()
