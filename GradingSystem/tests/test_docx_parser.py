"""Tests for the DOCX parser."""

from src.ingest.docx_parser import _detect_inline_citations, _extract_references
from src.models import Section


def test_detect_inline_citations() -> None:
    text = "According to Smith (2020), the results are clear. Also (Jones & Lee, 2019)."
    cites = _detect_inline_citations(text)
    assert len(cites) == 2
    assert "Smith" not in cites[0]  # Only content inside parens
    assert "2020" in cites[0]
    assert "2019" in cites[1]


def test_extract_references_from_section() -> None:
    sections = [
        Section(
            heading="References",
            body=(
                "Smith, J. (2020). Sea level rise and habitat loss. Nature.\n"
                "Jones, A., Lee, B. (2019). Coastal warming impacts. Ecology Letters."
            ),
            level=1,
        )
    ]
    refs = _extract_references(sections)
    assert len(refs) == 2
    assert refs[0].year == 2020
    assert refs[1].year == 2019


def test_no_references_section() -> None:
    sections = [Section(heading="Introduction", body="Some text.", level=1)]
    refs = _extract_references(sections)
    assert len(refs) == 0
