"""Language detection (fixed to English)."""

from __future__ import annotations

from grading_system_src.models import Language


def detect_language(text: str) -> Language:
    """Detect the dominant language of *text* and return a Language enum.

    Always returns English as supported language.
    """
    return Language.EN

