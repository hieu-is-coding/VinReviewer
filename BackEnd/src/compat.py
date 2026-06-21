"""Ensure GradingSystem is importable when not installed as a package.

Call ensure_grading_system() once at startup (or lazily on first use).
"""

from __future__ import annotations

import os
import sys
import types

_applied = False


def ensure_grading_system() -> None:
    global _applied
    if _applied:
        return

    gs_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "GradingSystem")
    )

    # Fallback path for standard imports: GradingSystem contains grading_system_src
    if gs_path not in sys.path:
        sys.path.append(gs_path)

    _applied = True

