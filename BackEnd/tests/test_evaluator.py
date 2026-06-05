"""Unit tests for the evaluator service error paths (mocked Supabase + GradingSystem)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.compat import ensure_grading_system
ensure_grading_system()


@pytest.fixture
def mock_supabase():
    """Patch all supabase_client functions used by the evaluator."""
    with patch("src.services.evaluator.fetch_submission", new_callable=AsyncMock) as fetch_sub, \
         patch("src.services.evaluator.fetch_criteria", new_callable=AsyncMock) as fetch_crit, \
         patch("src.services.evaluator.update_submission_status", new_callable=AsyncMock) as update_status, \
         patch("src.services.evaluator.insert_evaluation", new_callable=AsyncMock) as insert_eval, \
         patch("src.services.evaluator.update_evaluation", new_callable=AsyncMock) as update_eval, \
         patch("src.services.evaluator.insert_criteria_scores", new_callable=AsyncMock) as insert_scores, \
         patch("src.services.evaluator.insert_evaluation_details", new_callable=AsyncMock) as insert_details:
        yield {
            "fetch_submission": fetch_sub,
            "fetch_criteria": fetch_crit,
            "update_submission_status": update_status,
            "insert_evaluation": insert_eval,
            "update_evaluation": update_eval,
            "insert_criteria_scores": insert_scores,
            "insert_evaluation_details": insert_details,
        }


@pytest.fixture
def mock_job_manager():
    with patch("src.services.evaluator.job_manager") as jm:
        yield jm


@pytest.mark.asyncio
async def test_evaluate_fails_when_no_rubric_id(mock_supabase, mock_job_manager):
    mock_supabase["fetch_submission"].return_value = {
        "id": "sub-1",
        "rubric_id": None,
        "content": "Test content",
    }
    from src.services.evaluator import evaluate_submission

    with pytest.raises(ValueError, match="rubric_id"):
        await evaluate_submission("sub-1", "job-1")

    mock_supabase["update_submission_status"].assert_awaited_with("sub-1", "needs_review")
    mock_job_manager.update_job.assert_called()


@pytest.mark.asyncio
async def test_evaluate_fails_when_no_criteria(mock_supabase, mock_job_manager):
    mock_supabase["fetch_submission"].return_value = {
        "id": "sub-1",
        "rubric_id": "rub-1",
        "content": "Test content",
        "assignments": {"description": "Test", "target_venue": ""},
    }
    mock_supabase["fetch_criteria"].return_value = []

    from src.services.evaluator import evaluate_submission

    with pytest.raises(ValueError, match="No criteria"):
        await evaluate_submission("sub-1", "job-1")

    mock_supabase["update_submission_status"].assert_awaited_with("sub-1", "needs_review")


@pytest.mark.asyncio
async def test_evaluate_marks_job_running(mock_supabase, mock_job_manager):
    mock_supabase["fetch_submission"].return_value = {
        "id": "sub-1",
        "rubric_id": None,
        "content": "Test",
    }
    from src.services.evaluator import evaluate_submission

    with pytest.raises(ValueError):
        await evaluate_submission("sub-1", "job-1")

    mock_job_manager.update_job.assert_any_call("job-1", status="running")
