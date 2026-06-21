"""Core evaluation orchestrator: fetches data, runs pipeline, writes results."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path

from src.compat import ensure_grading_system
from src.exceptions import PipelineError, SupabaseError, ValidationError

ensure_grading_system()

logger = logging.getLogger(__name__)


async def evaluate_submission(submission_id: str, job_id: str) -> str:
    """Run the full agentic pipeline for a submission (detects PDF/text)."""
    from src.services.supabase_client import fetch_submission

    submission = await fetch_submission(submission_id)
    content: str = submission.get("content") or ""
    pdf_path: str | None = submission.get("pdf_path")

    if pdf_path:
        return await evaluate_pdf_storage_submission(submission_id, job_id, pdf_path)

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    return await _evaluate_core(submission_id, job_id, tmp_path, cleanup_path=True)


async def evaluate_pdf_storage_submission(submission_id: str, job_id: str, pdf_path: str) -> str:
    """Download PDF from Supabase Storage and evaluate it."""
    import httpx
    from src.config import settings
    import os

    public_url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/pdfs/{pdf_path}"
    
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "pdfs")
    os.makedirs(static_dir, exist_ok=True)
    local_path = os.path.join(static_dir, f"{submission_id}.pdf")

    async with httpx.AsyncClient() as client:
        resp = await client.get(public_url)
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(resp.content)

    return await _evaluate_core(submission_id, job_id, local_path, cleanup_path=False)


async def evaluate_pdf_submission(submission_id: str, job_id: str, pdf_path: str) -> str:
    """Run the full pipeline from a PDF file path (already saved to disk)."""
    return await _evaluate_core(submission_id, job_id, pdf_path, cleanup_path=False)


async def _evaluate_core(
    submission_id: str,
    job_id: str,
    manuscript_path: str,
    *,
    cleanup_path: bool = False,
) -> str:
    """Shared evaluation flow: fetch data, run pipeline, write results.

    Returns the evaluation_id written to Supabase.
    """
    from src.mapping.result import (
        map_pipeline_to_criteria_scores,
        map_pipeline_to_details,
        map_pipeline_to_evaluation,
    )
    from src.mapping.rubric import map_criteria_to_rubric
    from src.services import job_manager
    from src.services.supabase_client import (
        delete_evaluation,
        fetch_criteria,
        fetch_submission,
        insert_criteria_scores,
        insert_evaluation,
        insert_evaluation_details,
        update_evaluation,
        update_submission_status,
    )

    job_manager.update_job(job_id, status="running")

    try:
        submission = await fetch_submission(submission_id)
        rubric_id = submission.get("rubric_id")
        if not rubric_id:
            raise ValidationError("Submission has no rubric_id", context={"submission_id": submission_id})

        criteria = await fetch_criteria(rubric_id)
        if not criteria:
            raise ValidationError("No criteria found for this rubric", context={"rubric_id": rubric_id})

        assignment = submission.get("assignments") or {}
        assignment_prompt: str = assignment.get("description") or ""
        target_venue: str = assignment.get("target_venue") or ""

        await update_submission_status(submission_id, "evaluating")

        rubric_tree = map_criteria_to_rubric(criteria)

        try:
            state = await asyncio.to_thread(
                _run_pipeline_sync,
                manuscript_path=manuscript_path,
                assignment_prompt=assignment_prompt,
                target_venue=target_venue,
                rubric_tree=rubric_tree,
            )
        finally:
            if cleanup_path:
                Path(manuscript_path).unlink(missing_ok=True)

        if state.errors:
            raise PipelineError(
                f"Pipeline errors: {state.errors}",
                context={"submission_id": submission_id, "errors": state.errors},
            )

        if state.manuscript and state.manuscript.full_text:
            from src.services.supabase_client import update_submission_content
            try:
                await update_submission_content(submission_id, state.manuscript.full_text)
            except Exception as e:
                logger.warning("Failed to update submission content: %s", e)

        eval_id = await insert_evaluation(
            {"submission_id": submission_id, "status": "in_progress", "evaluation_type": "agentic"}
        )


        try:
            eval_payload = map_pipeline_to_evaluation(state, criteria, submission_id)
            await update_evaluation(eval_id, eval_payload)

            cs_rows = map_pipeline_to_criteria_scores(state, criteria, eval_id)
            if cs_rows:
                await insert_criteria_scores(cs_rows)

            details = map_pipeline_to_details(state, eval_id)
            await insert_evaluation_details(details)
        except Exception as write_exc:
            logger.error("Partial write failure for eval %s, rolling back: %s", eval_id, write_exc)
            try:
                await delete_evaluation(eval_id)
            except Exception:
                logger.exception("Rollback of eval %s also failed", eval_id)
            raise SupabaseError(
                f"Failed to write evaluation results: {write_exc}",
                context={"evaluation_id": eval_id, "submission_id": submission_id},
            ) from write_exc

        human_flag = state.supervisor_result.human_flag if state.supervisor_result else False
        final_status = "flagged" if human_flag else "ai_graded"
        await update_submission_status(submission_id, final_status)

        job_manager.update_job(job_id, status="completed", evaluation_id=eval_id)
        logger.info("Evaluation complete: submission=%s eval=%s", submission_id, eval_id)
        return eval_id

    except (ValidationError, PipelineError, SupabaseError) as exc:
        logger.error("Pipeline failed for submission %s: %s", submission_id, exc)
        try:
            await update_submission_status(submission_id, "needs_review")
        except Exception:
            logger.exception("Failed to set needs_review for %s", submission_id)
        job_manager.update_job(job_id, status="failed", error=str(exc))
        raise

    except Exception as exc:
        logger.exception("Unexpected error for submission %s: %s", submission_id, exc)
        try:
            await update_submission_status(submission_id, "needs_review")
        except Exception:
            logger.exception("Failed to set needs_review for %s", submission_id)
        job_manager.update_job(job_id, status="failed", error=str(exc))
        raise PipelineError(str(exc), context={"submission_id": submission_id}) from exc


def _run_pipeline_sync(
    manuscript_path: str,
    assignment_prompt: str,
    target_venue: str,
    rubric_tree,
):
    """Call GradingSystem run_pipeline() synchronously (runs in thread pool)."""
    from grading_system_src.orchestration.graph import run_pipeline  # type: ignore[import]

    return run_pipeline(
        manuscript_path=manuscript_path,
        assignment_prompt=assignment_prompt,
        target_venue=target_venue,
    )
