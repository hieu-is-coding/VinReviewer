"""In-memory job queue with asyncio semaphore for concurrency control.

In production, swap the in-memory store for a Redis-backed queue by
setting REDIS_URL in .env.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Literal

from pydantic import BaseModel

from src.config import settings


class Job(BaseModel):
    job_id: str
    submission_id: str
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    evaluation_id: str | None = None
    error: str | None = None


# Module-level state
_jobs: dict[str, Job] = {}
_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)
    return _semaphore


def create_job(submission_id: str) -> Job:
    job = Job(job_id=str(uuid.uuid4()), submission_id=submission_id)
    _jobs[job.job_id] = job
    return job


def find_active_job(submission_id: str) -> Job | None:
    """Return an existing queued/running job for this submission, if any."""
    for job in _jobs.values():
        if job.submission_id == submission_id and job.status in ("queued", "running"):
            return job
    return None


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def update_job(job_id: str, **fields) -> None:
    job = _jobs.get(job_id)
    if job:
        _jobs[job_id] = job.model_copy(update=fields)


async def acquire() -> None:
    await _get_semaphore().acquire()


def release() -> None:
    _get_semaphore().release()
