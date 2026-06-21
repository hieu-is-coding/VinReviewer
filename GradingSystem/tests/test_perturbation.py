"""Tests for perturbation confidence testing."""

from unittest.mock import patch

import pytest

from grading_system_src.models import (
    EvidenceAudit,
    Language,
    Manuscript,
    PerturbationResult,
    RubricNode,
    RubricTree,
    Section,
)
from grading_system_src.calibration.perturbation import (
    _remove_random_section,
    _shuffle_sections,
    run_perturbation_test,
)


def _make_manuscript() -> Manuscript:
    return Manuscript(
        source_path="test.pdf",
        language=Language.EN,
        title="Test Paper",
        abstract="This is the abstract.",
        sections=[
            Section(heading="Introduction", body="Intro text here.", level=1),
            Section(heading="Methods", body="Methods text here.", level=1),
            Section(heading="Results", body="Results text here.", level=1),
            Section(heading="Discussion", body="Discussion text.", level=1),
            Section(heading="Conclusion", body="Conclusion text.", level=1),
        ],
        full_text="Introduction\nIntro text.\n\nMethods\nMethods text.\n\nResults\nResults.\n\nDiscussion\nDiscussion.\n\nConclusion\nConclusion.",
        word_count=50,
    )


class TestShuffleSections:
    def test_preserves_first_last(self):
        ms = _make_manuscript()
        shuffled = _shuffle_sections(ms)
        assert shuffled.sections[0].heading == "Introduction"
        assert shuffled.sections[-1].heading == "Conclusion"
        assert len(shuffled.sections) == 5

    def test_too_few_sections(self):
        ms = Manuscript(
            source_path="t.pdf",
            language=Language.EN,
            sections=[Section(heading="A", body="a"), Section(heading="B", body="b")],
        )
        result = _shuffle_sections(ms)
        assert result.sections == ms.sections


class TestRemoveRandomSection:
    def test_removes_one(self):
        ms = _make_manuscript()
        result = _remove_random_section(ms)
        assert len(result.sections) == 4
        # First and last preserved
        assert result.sections[0].heading == "Introduction"
        assert result.sections[-1].heading == "Conclusion"

    def test_too_few_sections(self):
        ms = Manuscript(
            source_path="t.pdf",
            language=Language.EN,
            sections=[Section(heading="A", body="a"), Section(heading="B", body="b")],
        )
        result = _remove_random_section(ms)
        assert len(result.sections) == 2


class TestRunPerturbationTest:
    @patch("grading_system_src.calibration.perturbation._lightweight_score")
    @patch("grading_system_src.calibration.perturbation._paraphrase_abstract")
    def test_stable_scores(self, mock_paraphrase, mock_score):
        mock_paraphrase.return_value = "Paraphrased abstract."
        mock_score.return_value = 0.75  # All perturbations return same score

        ms = _make_manuscript()
        rubric = RubricTree(dimensions=[RubricNode(id="d1", label="D1", weight=1.0)])
        evidence = EvidenceAudit()

        result = run_perturbation_test(ms, rubric, evidence, original_score=0.75)
        assert result.confidence_label == "HIGH"
        assert result.score_std < 0.01

    @patch("grading_system_src.calibration.perturbation._lightweight_score")
    @patch("grading_system_src.calibration.perturbation._paraphrase_abstract")
    def test_unstable_scores(self, mock_paraphrase, mock_score):
        mock_paraphrase.return_value = "Paraphrased."
        # Return very different scores
        mock_score.side_effect = [0.3, 0.9, 0.5]

        ms = _make_manuscript()
        rubric = RubricTree(dimensions=[RubricNode(id="d1", label="D1", weight=1.0)])
        evidence = EvidenceAudit()

        result = run_perturbation_test(ms, rubric, evidence, original_score=0.75)
        assert result.confidence_label in ("LOW", "MEDIUM")
        assert result.score_std > 0.1
