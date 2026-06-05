"""Tests for intermediate phase output serialization and saving."""

import json
from pathlib import Path
from src.orchestration.graph import _save_phase_output
from src.models import Manuscript, Language


def test_save_phase_output_pydantic(tmp_path: Path) -> None:
    # Set up state with output_dir
    state = {"output_dir": str(tmp_path)}
    
    # Create dummy pydantic model
    ms = Manuscript(
        source_path="dummy.pdf",
        language=Language.EN,
        title="Dummy Manuscript Title",
        word_count=100
    )
    
    # Invoke helper
    _save_phase_output(state, "phase_0_ingestion", ms)
    
    # Assert file exists and is populated
    output_file = tmp_path / "phases" / "phase_0_ingestion.json"
    assert output_file.exists()
    
    with open(output_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    assert data["source_path"] == "dummy.pdf"
    assert data["language"] == "en"
    assert data["title"] == "Dummy Manuscript Title"
    assert data["word_count"] == 100


def test_save_phase_output_dict(tmp_path: Path) -> None:
    state = {"output_dir": str(tmp_path)}
    
    data = {
        "score": 0.95,
        "details": "Great work"
    }
    
    _save_phase_output(state, "phase_5_calibration", data)
    
    output_file = tmp_path / "phases" / "phase_5_calibration.json"
    assert output_file.exists()
    
    with open(output_file, "r", encoding="utf-8") as f:
        loaded = json.load(f)
        
    assert loaded["score"] == 0.95
    assert loaded["details"] == "Great work"


def test_save_phase_output_disabled(tmp_path: Path) -> None:
    # If no output_dir is configured, it should skip saving
    state = {}
    _save_phase_output(state, "phase_0_ingestion", {"dummy": True})
    
    output_file = tmp_path / "phases" / "phase_0_ingestion.json"
    assert not output_file.exists()
