"""Unit tests for the background worker pipelines."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from src.workers.pipeline_worker import run_pdf_pipeline, run_text_pipeline


@pytest.fixture
def mock_job_manager():
    """Mock the job_manager acquire/release/update_job methods."""
    with patch("src.workers.pipeline_worker.job_manager") as mock_jm:
        mock_jm.acquire = AsyncMock()
        mock_jm.release = MagicMock()
        mock_jm.update_job = MagicMock()
        yield mock_jm


@pytest.fixture
def mock_supabase_client():
    """Mock update_submission_status in supabase_client."""
    with patch("src.services.supabase_client.update_submission_status", new_callable=AsyncMock) as mock_update:
        yield mock_update


@pytest.mark.asyncio
async def test_run_text_pipeline_success(mock_job_manager, mock_supabase_client):
    """Test successful text pipeline background run."""
    with patch("src.services.evaluator.evaluate_submission", new_callable=AsyncMock) as mock_eval:
        await run_text_pipeline("sub-123", "job-123")

        mock_job_manager.acquire.assert_awaited_once()
        mock_eval.assert_awaited_once_with("sub-123", "job-123")
        mock_job_manager.release.assert_called_once()


@pytest.mark.asyncio
async def test_run_text_pipeline_timeout(mock_job_manager, mock_supabase_client):
    """Test worker behavior when the pipeline execution times out."""
    from src.config import settings
    original_timeout = settings.job_timeout_seconds
    settings.job_timeout_seconds = 0.05  # Short timeout for testing

    async def slow_eval(*args, **kwargs):
        await asyncio.sleep(0.2)
        return "eval-id-123"

    try:
        with patch("src.services.evaluator.evaluate_submission", side_effect=slow_eval):
            await run_text_pipeline("sub-123", "job-123")

            mock_job_manager.acquire.assert_awaited_once()
            mock_job_manager.update_job.assert_called_once_with("job-123", status="failed", error="Pipeline timed out")
            mock_supabase_client.assert_awaited_once_with("sub-123", "needs_review")
            mock_job_manager.release.assert_called_once()
    finally:
        settings.job_timeout_seconds = original_timeout


@pytest.mark.asyncio
async def test_run_text_pipeline_exception(mock_job_manager, mock_supabase_client):
    """Test worker behavior when evaluate_submission raises an error."""
    with patch("src.services.evaluator.evaluate_submission", new_callable=AsyncMock) as mock_eval:
        mock_eval.side_effect = RuntimeError("Fatal GPU error")

        await run_text_pipeline("sub-123", "job-123")

        mock_job_manager.acquire.assert_awaited_once()
        mock_eval.assert_awaited_once_with("sub-123", "job-123")
        # Worker handles the error by logging and moving on
        mock_job_manager.release.assert_called_once()


@pytest.mark.asyncio
async def test_run_pdf_pipeline_success(mock_job_manager, mock_supabase_client):
    """Test successful PDF pipeline background run."""
    with patch("src.services.evaluator.evaluate_pdf_submission", new_callable=AsyncMock) as mock_eval:
        await run_pdf_pipeline("sub-123", "job-123", "/path/to/doc.pdf")

        mock_job_manager.acquire.assert_awaited_once()
        mock_eval.assert_awaited_once_with("sub-123", "job-123", "/path/to/doc.pdf")
        mock_job_manager.release.assert_called_once()
