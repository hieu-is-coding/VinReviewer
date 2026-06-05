"""PDF evaluation route: POST /evaluate-pdf."""

from __future__ import annotations

import logging
import secrets
import tempfile
from pathlib import Path

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Security, UploadFile
from fastapi.security.api_key import APIKeyHeader

from src.config import settings
from src.services import job_manager
from src.workers.pipeline_worker import run_pdf_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# 50 MB upload limit
_MAX_PDF_BYTES = 50 * 1024 * 1024


async def _require_api_key(key: str | None = Security(_api_key_header)) -> None:
    if not key or not secrets.compare_digest(key, settings.api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@router.post(
    "/evaluate-pdf",
    status_code=202,
    dependencies=[Depends(_require_api_key)],
)
async def evaluate_pdf(
    bg: BackgroundTasks,
    file: UploadFile,
    submission_id: str = Form(...),
) -> dict:
    """Accept a PDF upload and queue it for GROBID + agentic pipeline evaluation."""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Stream to a named temp file — worker will delete it after pipeline
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".pdf", dir=tempfile.gettempdir()
        ) as tmp:
            tmp_path = tmp.name

        async with aiofiles.open(tmp_path, "wb") as out:
            total = 0
            chunk_size = 65_536
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > _MAX_PDF_BYTES:
                    Path(tmp_path).unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="PDF exceeds 50 MB limit")
                await out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        Path(tmp_path).unlink(missing_ok=True)
        logger.exception("Failed to save uploaded PDF: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

    existing = job_manager.find_active_job(submission_id)
    if existing:
        Path(tmp_path).unlink(missing_ok=True)
        return {"job_id": existing.job_id, "status": existing.status, "submission_id": submission_id}

    job = job_manager.create_job(submission_id)
    bg.add_task(run_pdf_pipeline, submission_id, job.job_id, tmp_path)
    logger.info(
        "PDF queued: submission=%s job=%s path=%s", submission_id, job.job_id, tmp_path
    )
    return {"job_id": job.job_id, "status": "queued", "submission_id": submission_id}
