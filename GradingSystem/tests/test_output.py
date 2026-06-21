"""Tests for diagnostic output rendering."""

from grading_system_src.models import (
    CalibrationParams,
    EvidenceAudit,
    Features,
    FeatureValue,
    Language,
    LeafVerdict,
    Manuscript,
    PipelineState,
    ReviewOutput,
    RubricNode,
    RubricTree,
    Section,
    SupervisorResult,
)
from grading_system_src.synthesis.output import render_json_output, render_markdown_report


def _make_state() -> PipelineState:
    ms = Manuscript(
        source_path="test.pdf",
        language=Language.EN,
        title="Test Paper",
        sections=[Section(heading="Intro", body="Body text.", level=1)],
        full_text="Intro\nBody text.",
        word_count=3,
    )
    rubric = RubricTree(dimensions=[
        RubricNode(id="d1", label="Dim1", weight=1.0, children=[
            RubricNode(id="leaf1", label="Leaf1", weight=1.0),
        ]),
    ])
    review = ReviewOutput(
        verdicts=[LeafVerdict(leaf_id="leaf1", score=0.75, justification="Good.", suggested_revision="Improve.")],
        overall_score=0.75,
        summary="Solid work.",
        strengths=["Clear writing"],
        weaknesses=["Limited scope"],
    )
    features = Features(values={
        "mtld": FeatureValue(id="mtld", raw_value=80.0, z_score=0.3, label="MTLD"),
    })
    return PipelineState(
        manuscript_path="test.pdf",
        manuscript=ms,
        rubric_tree=rubric,
        review=review,
        features=features,
        evidence_audit=EvidenceAudit(),
        supervisor_result=SupervisorResult(passed=True),
        calibrated_score=0.73,
    )


def test_render_markdown_contains_sections() -> None:
    state = _make_state()
    md = render_markdown_report(state)
    assert "# Academic Writing Review Report" in md
    assert "## Summary" in md
    assert "## Strengths" in md
    assert "## Weaknesses" in md
    assert "## Rubric Verdicts" in md
    assert "## Quantitative Features" in md
    assert "## Evidence Audit" in md
    assert "AI-Unreliable" in md


def test_render_json_valid() -> None:
    import json
    state = _make_state()
    raw = render_json_output(state)
    data = json.loads(raw)
    assert data["calibrated_score"] == 0.73
    assert data["review"]["overall_score"] == 0.75
