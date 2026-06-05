"""Tests for reference validation module."""

from unittest.mock import MagicMock, patch

import pytest

from src.features.references import (
    ReferenceValidation,
    _title_similarity,
    _validate_single_reference,
    validate_references,
)
from src.models import Language, Manuscript, Reference


def _make_manuscript(refs: list[Reference]) -> Manuscript:
    return Manuscript(
        source_path="test.pdf",
        language=Language.EN,
        title="Test Paper",
        references=refs,
    )


class TestTitleSimilarity:
    def test_identical(self):
        assert _title_similarity("Hello World", "Hello World") == 1.0

    def test_case_insensitive(self):
        assert _title_similarity("Hello World", "hello world") == 1.0

    def test_empty(self):
        assert _title_similarity("", "something") == 0.0

    def test_partial_match(self):
        sim = _title_similarity(
            "Deep Learning for NLP",
            "Deep Learning for Natural Language Processing",
        )
        assert 0.5 < sim < 1.0


class TestValidateSingleReference:
    @patch("src.features.references._check_crossref_doi")
    def test_verified_by_doi(self, mock_crossref):
        mock_crossref.return_value = {"title": ["Attention Is All You Need"]}
        ref = Reference(
            id="ref1",
            title="Attention Is All You Need",
            doi="10.1234/test",
        )
        result = _validate_single_reference(ref)
        assert result.status == "verified"
        assert result.source == "crossref"

    @patch("src.features.references._check_crossref_doi")
    @patch("src.features.references._search_crossref_title")
    def test_verified_by_title_search(self, mock_search, mock_doi):
        mock_doi.return_value = None
        mock_search.return_value = {
            "title": ["Attention Is All You Need"],
            "DOI": "10.1234/found",
        }
        ref = Reference(id="ref2", title="Attention Is All You Need")
        result = _validate_single_reference(ref)
        assert result.status == "verified"
        assert result.matched_doi == "10.1234/found"

    def test_fabricated_empty_ref(self):
        ref = Reference(id="ref3", title="", doi=None)
        result = _validate_single_reference(ref)
        assert result.status == "fabricated"


class TestValidateReferences:
    def test_empty_references(self):
        ms = _make_manuscript([])
        result = validate_references(ms, rate_limit_delay=0)
        assert result.verified_ratio == 1.0

    @patch("src.features.references._validate_single_reference")
    def test_aggregation(self, mock_validate):
        from src.models import RefCheckResult

        mock_validate.side_effect = [
            RefCheckResult(ref_id="r1", status="verified", source="crossref", confidence=0.95),
            RefCheckResult(ref_id="r2", status="fabricated", source="unverified", confidence=0.0),
            RefCheckResult(ref_id="r3", status="likely_valid", source="openalex", confidence=0.70),
        ]
        refs = [
            Reference(id="r1", title="Paper A"),
            Reference(id="r2", title=""),
            Reference(id="r3", title="Paper C"),
        ]
        ms = _make_manuscript(refs)
        result = validate_references(ms, rate_limit_delay=0)

        assert len(result.results) == 3
        assert result.fabricated_refs == ["r2"]
        assert abs(result.verified_ratio - 2 / 3) < 0.01
