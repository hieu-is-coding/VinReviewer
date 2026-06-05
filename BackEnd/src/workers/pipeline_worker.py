"""Background pipeline worker — wraps evaluator with semaphore-based concurrency and timeouts."""

from __future__ import annotations

import asyncio
import logging

from src.config import settings
from src.services import job_manager

logger = logging.getLogger(__name__)


async def run_text_pipeline(submission_id: str, job_id: str) -> None:
    """Acquire the concurrency semaphore, run the text pipeline with timeout, then release."""
    await job_manager.acquire()
    try:
        from src.services.evaluator import evaluate_submission

        await asyncio.wait_for(
            evaluate_submission(submission_id, job_id),
            timeout=settings.job_timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.error("Pipeline timed out after %ds: submission=%s job=%s",
                      settings.job_timeout_seconds, submission_id, job_id)
        job_manager.update_job(job_id, status="failed", error="Pipeline timed out")
        try:
            from src.services.supabase_client import update_submission_status
            await update_submission_status(submission_id, "needs_review")
        except Exception:
            logger.exception("Failed to set needs_review after timeout for %s", submission_id)
    except Exception:
        logger.exception("Worker failed: submission=%s job=%s", submission_id, job_id)
    finally:
        job_manager.release()


async def run_pdf_pipeline(submission_id: str, job_id: str, pdf_path: str) -> None:
    """Acquire the concurrency semaphore, run the PDF pipeline with timeout, then release."""
    await job_manager.acquire()
    try:
        from src.services.evaluator import evaluate_pdf_submission

        await asyncio.wait_for(
            evaluate_pdf_submission(submission_id, job_id, pdf_path),
            timeout=settings.job_timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.error("PDF pipeline timed out after %ds: submission=%s job=%s",
                      settings.job_timeout_seconds, submission_id, job_id)
        job_manager.update_job(job_id, status="failed", error="Pipeline timed out")
        try:
            from src.services.supabase_client import update_submission_status
            await update_submission_status(submission_id, "needs_review")
        except Exception:
            logger.exception("Failed to set needs_review after timeout for %s", submission_id)
    except Exception:
        logger.exception("Worker failed (PDF): submission=%s job=%s", submission_id, job_id)
    finally:
        job_manager.release()
