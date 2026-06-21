"""Tests for Pydantic models."""

from grading_system_src.models import (
    CalibrationParams,
    ClaimType,
    EvidenceAudit,
    Features,
    FeatureValue,
    Language,
    LeafVerdict,
    LitPool,
    Manuscript,
    PipelineState,
    RedLineID,
    ReviewOutput,
    RubricNode,
    RubricTree,
    Section,
)


def test_manuscript_model() -> None:
    ms = Manuscript(
        source_path="test.pdf",
        language=Language.EN,
        title="Test",
        full_text="Hello world.",
        word_count=2,
    )
    assert ms.language == Language.EN
    assert ms.word_count == 2


def test_rubric_tree_nesting() -> None:
    tree = RubricTree(dimensions=[
        RubricNode(
            id="root",
            label="Root",
            weight=1.0,
            children=[
                RubricNode(
                    id="child1",
                    label="Child One",
                    weight=0.5,
                    children=[
                        RubricNode(id="leaf1", label="Leaf", weight=1.0),
                    ],
                ),
                RubricNode(id="child2", label="Child Two", weight=0.5),
            ],
        ),
    ])
    assert tree.dimensions[0].children[0].children[0].id == "leaf1"


def test_pipeline_state_defaults() -> None:
    state = PipelineState()
    assert state.manuscript is None
    assert state.review is None
    assert state.errors == []


def test_leaf_verdict_bounds() -> None:
    v = LeafVerdict(leaf_id="test", score=0.5)
    assert 0.0 <= v.score <= 1.0


def test_claim_type_enum() -> None:
    assert ClaimType.SYNTHESIS.value == "SYNTHESIS"
    assert ClaimType.UNSUPPORTED.value == "UNSUPPORTED"


def test_calibration_params_defaults() -> None:
    params = CalibrationParams()
    assert params.slope == 1.0
    assert params.intercept == 0.0
