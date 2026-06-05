"""Ensure GradingSystem is importable when not installed as a package.

Call ensure_grading_system() once at startup (or lazily on first use).
This centralises the sys.path manipulation that was previously scattered
across evaluator.py, rubric.py, and test_mapping.py.
"""

from __future__ import annotations

import os
import sys

_applied = False


def ensure_grading_system() -> None:
    global _applied
    if _applied:
        return
    gs_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "GradingSystem")
    )
    if gs_path not in sys.path:
        sys.path.insert(0, gs_path)
    _applied = True
