"""Language detection using fasttext-langdetect."""

from __future__ import annotations

from ftlangdetect import detect

from src.models import Language


def detect_language(text: str) -> Language:
    """Detect the dominant language of *text* and return a Language enum.

    Raises ValueError for non-English manuscripts.
    """
    # ftlangdetect expects a reasonable amount of text
    sample = text[:5000].replace("\n", " ")
    result = detect(sample)
    code = result["lang"]
    if code == Language.EN.value:
        return Language.EN
    raise ValueError(
        f"Unsupported language '{code}'. Only English manuscripts are supported."
    )
