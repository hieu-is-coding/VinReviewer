"""Tests for missing file handling (early termination)."""

import pytest
from grading_system_src.orchestration.graph import run_pipeline, build_graph
from grading_system_src.synthesis.output import render_markdown_report, render_json_output


def test_run_pipeline_missing_file() -> None:
    """If the manuscript path does not exist, run_pipeline should return early with errors."""
    non_existent_path = "nonexistent_file_xyz.pdf"
    
    state = run_pipeline(
        manuscript_path=non_existent_path,
        assignment_prompt="Review formatting and thesis",
        output_dir="dummy_output",
    )
    
    # Assert early termination returns PipelineState with populated error list
    assert state.manuscript_path == non_existent_path
    assert state.manuscript is None
    assert len(state.errors) == 1
    assert "No such file or directory" in state.errors[0]
    assert non_existent_path in state.errors[0]


def test_nodes_skipped_on_error() -> None:
    """If errors exist in the graph state, downstream nodes should be skipped."""
    graph = build_graph()
    compiled = graph.compile()
    
    # Intentionally trigger an error in ingest node by passing non-existent path
    initial_state = {
        "manuscript_path": "missing_paper.pdf",
        "assignment_prompt": "",
        "reference_grade": None,
        "run_id": "test-run",
        "errors": [],
        "output_dir": None,
    }
    
    final_state = compiled.invoke(initial_state)
    
    # Assert the graph exited gracefully instead of crashing on subsequent nodes
    assert final_state.get("manuscript") is None
    assert len(final_state["errors"]) == 1
    assert "No such file or directory" in final_state["errors"][0]


def test_safe_output_rendering_on_error() -> None:
    """Renderers should not crash and should correctly format the report when errors exist."""
    non_existent_path = "paper.pdf"
    state = run_pipeline(manuscript_path=non_existent_path)
    
    # Generate markdown and JSON output
    md_report = render_markdown_report(state)
    json_report = render_json_output(state)
    
    # Ensure no crashes occurred and output contains the error message
    assert "Pipeline Errors" in md_report
    assert "No such file or directory" in md_report
    assert "paper.pdf" in md_report
    
    assert "manuscript" in json_report
    assert "errors" in json_report
