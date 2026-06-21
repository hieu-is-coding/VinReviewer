"""Tests for the language detection module."""

import pytest

from grading_system_src.ingest.language import detect_language
from grading_system_src.models import Language


def test_detect_english() -> None:
    text = (
        "Climate change represents one of the most significant challenges "
        "facing coastal ecosystems today. Rising sea levels threaten habitats "
        "that support diverse marine and terrestrial species."
    )
    assert detect_language(text) == Language.EN


def test_detect_spanish_raises() -> None:
    text = (
        "El cambio climático representa uno de los desafíos más significativos "
        "que enfrentan los ecosistemas costeros hoy en día. La investigación "
        "previa ha demostrado impactos medibles en los índices de biodiversidad."
    )
    with pytest.raises(ValueError, match="Unsupported language"):
        detect_language(text)


def test_unsupported_raises() -> None:
    # German text — not in our supported set
    text = "Dies ist ein deutscher Text über Klimawandel und Ökosysteme."
    with pytest.raises(ValueError, match="Unsupported language"):
        detect_language(text)
