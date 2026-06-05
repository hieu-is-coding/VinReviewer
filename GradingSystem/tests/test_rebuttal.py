"""Tests for rebuttal handler."""

from unittest.mock import MagicMock, patch

import pytest

from src.models import (
    Language,
    LeafVerdict,
    Manuscript,
    RebuttalEntry,
    RebuttalOutcome,
    ReviewOutput,
)
from src.rebuttal.handler import _find_relevant_section, process_rebuttals


def _make_manuscript() -> Manuscript:
    from src.models import Section

    return Manuscript(
        source_path="test.pdf",
        language=Language.EN,
        title="Test Paper",
        sections=[
            Section(heading="Introduction", body="Intro content here."),
            Section(heading="Methodology", body="We used method X."),
            Section(heading="Results", body="Results show Y."),
        ],
        full_text="Introduction\nIntro.\n\nMethodology\nWe used X.\n\nResults\nResults show Y.",
    )


def _make_review() -> ReviewOutput:
    return ReviewOutput(
        verdicts=[
            LeafVerdict(
                leaf_id="thesis_clarity",
                score=0.5,
                justification="Thesis is unclear.",
                suggested_revision="Clarify the main argument.",
            ),
            LeafVerdict(
                leaf_id="source_quality",
                score=0.6,
                justification="Sources are adequate.",
                suggested_revision="Add more primary sources.",
            ),
            LeafVerdict(
                leaf_id="grammar_spelling",
                score=0.8,
                justification="Generally good.",
                suggested_revision="Minor fixes needed.",
            ),
        ],
        overall_score=0.63,
    )


class TestFindRelevantSection:
    def test_finds_methodology(self):
        ms = _make_manuscript()
        text = _find_relevant_section(ms, "methodology")
        assert "method X" in text.lower() or "methodology" in text.lower()

    def test_fallback_to_full_text(self):
        ms = _make_manuscript()
        text = _find_relevant_section(ms, "zzz_unknown")
        assert len(text) > 0


class TestProcessRebuttals:
    @patch("src.rebuttal.handler._evaluate_single_rebuttal")
    def test_successful_rebuttal(self, mock_eval):
        mock_eval.return_value = RebuttalOutcome(
            leaf_id="thesis_clarity",
            original_score=0.5,
            revised_score=0.65,
            accepted=True,
            revised_justification="Author clarified the thesis.",
        )

        rebuttals = [
            RebuttalEntry(
                leaf_id="thesis_clarity",
                response="We have revised Section 1 to explicitly state our thesis.",
            )
        ]

        result = process_rebuttals(rebuttals, _make_review(), _make_manuscript())
        assert len(result.outcomes) == 1
        assert result.outcomes[0].accepted is True
        assert result.outcomes[0].revised_score > result.outcomes[0].original_score
        assert result.score_delta > 0

    @patch("src.rebuttal.handler._evaluate_single_rebuttal")
    def test_rejected_rebuttal(self, mock_eval):
        mock_eval.return_value = RebuttalOutcome(
            leaf_id="source_quality",
            original_score=0.6,
            revised_score=0.6,
            accepted=False,
            revised_justification="Rebuttal did not address the concern.",
        )

        rebuttals = [
            RebuttalEntry(leaf_id="source_quality", response="We disagree.")
        ]

        result = process_rebuttals(rebuttals, _make_review(), _make_manuscript())
        assert result.outcomes[0].accepted is False
        assert result.score_delta == 0.0

    def test_unknown_leaf_skipped(self):
        rebuttals = [
            RebuttalEntry(leaf_id="nonexistent_leaf", response="Response")
        ]
        result = process_rebuttals(rebuttals, _make_review(), _make_manuscript())
        assert len(result.outcomes) == 0
