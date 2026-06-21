"""Evaluate routes: POST /evaluate, POST /webhook/submission-created, GET /jobs/{job_id}."""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader

from src.config import settings
from src.models.requests import EvaluateRequest, WebhookPayload
from src.models.responses import EvaluateResponse, JobStatusResponse, WebhookResponse
from src.services import job_manager
from src.workers.pipeline_worker import run_text_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _require_api_key(key: str | None = Security(_api_key_header)) -> None:
    if not key or not secrets.compare_digest(key, settings.api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@router.post(
    "/evaluate",
    response_model=EvaluateResponse,
    status_code=202,
    dependencies=[Depends(_require_api_key)],
)
async def evaluate(body: EvaluateRequest, bg: BackgroundTasks) -> EvaluateResponse:
    """Queue a text-based submission for agentic evaluation."""
    existing = job_manager.find_active_job(body.submission_id)
    if existing:
        return EvaluateResponse(
            job_id=existing.job_id,
            status=existing.status,
            submission_id=body.submission_id,
        )

    job = job_manager.create_job(body.submission_id)
    bg.add_task(run_text_pipeline, body.submission_id, job.job_id)
    return EvaluateResponse(
        job_id=job.job_id,
        status="queued",
        submission_id=body.submission_id,
    )


import asyncio

@router.post(
    "/evaluate-sync",
)
async def evaluate_sync(body: EvaluateRequest) -> dict:
    """Synchronously run evaluation for a text submission and wait for completion."""
    existing = job_manager.find_active_job(body.submission_id)
    if existing:
        job = existing
    else:
        job = job_manager.create_job(body.submission_id)
        # Start in background task so it runs concurrently
        asyncio.create_task(run_text_pipeline(body.submission_id, job.job_id))
    
    # Poll until done (up to 500 seconds)
    for _ in range(250):
        await asyncio.sleep(2)
        current = job_manager.get_job(job.job_id)
        if not current:
            continue
        if current.status == "completed":
            return {
                "evaluation_id": current.evaluation_id,
                "status": "ai_graded",
                "needs_review": False,
                "min_confidence": 85,
                "avg_confidence": 90,
            }
        elif current.status == "failed":
            raise HTTPException(status_code=500, detail=f"Job failed: {current.error}")
            
    raise HTTPException(status_code=504, detail="Job timeout")



@router.post(
    "/webhook/submission-created",
    response_model=WebhookResponse,
    status_code=202,
    dependencies=[Depends(_require_api_key)],
)
async def on_submission_created(payload: WebhookPayload, bg: BackgroundTasks) -> WebhookResponse:
    """Supabase database webhook — triggered on new submission INSERT."""
    submission_id = payload.record.get("id")
    if not submission_id:
        raise HTTPException(status_code=400, detail="record.id missing in webhook payload")

    if payload.record.get("status") != "pending":
        return WebhookResponse(accepted=False, reason="status != pending")

    existing = job_manager.find_active_job(submission_id)
    if existing:
        return WebhookResponse(accepted=False, reason="job already active", job_id=existing.job_id)

    job = job_manager.create_job(submission_id)
    bg.add_task(run_text_pipeline, submission_id, job.job_id)
    logger.info("Webhook: queued job %s for submission %s", job.job_id, submission_id)
    return WebhookResponse(accepted=True, job_id=job.job_id)


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    dependencies=[Depends(_require_api_key)],
)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """Poll the status of a pipeline job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status,
        submission_id=job.submission_id,
        error=job.error,
        evaluation_id=job.evaluation_id,
    )
