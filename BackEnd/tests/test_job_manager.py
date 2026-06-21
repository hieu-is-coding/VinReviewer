"""Unit tests for the in-memory job manager and concurrency control."""

import asyncio
import pytest
from src.services import job_manager
from src.services.job_manager import Job, _jobs


@pytest.fixture(autouse=True)
def clean_job_manager():
    """Reset the module-level state of job_manager before each test."""
    _jobs.clear()
    job_manager._semaphore = None


def test_create_job():
    job = job_manager.create_job("sub-1")
    assert job.submission_id == "sub-1"
    assert job.status == "queued"
    assert job.job_id is not None
    assert job_manager.get_job(job.job_id) == job


def test_find_active_job():
    job_1 = job_manager.create_job("sub-1")
    assert job_manager.find_active_job("sub-1").job_id == job_1.job_id

    job_manager.update_job(job_1.job_id, status="running")
    assert job_manager.find_active_job("sub-1").status == "running"

    job_manager.update_job(job_1.job_id, status="completed")
    assert job_manager.find_active_job("sub-1") is None

    job_2 = job_manager.create_job("sub-1")
    assert job_manager.find_active_job("sub-1") == job_2

    job_manager.update_job(job_2.job_id, status="failed")
    assert job_manager.find_active_job("sub-1") is None


def test_update_job():
    job = job_manager.create_job("sub-1")
    job_manager.update_job(job.job_id, status="running", evaluation_id="eval-1")
    
    updated = job_manager.get_job(job.job_id)
    assert updated.status == "running"
    assert updated.evaluation_id == "eval-1"
    assert updated.error is None


@pytest.mark.asyncio
async def test_semaphore_concurrency():
    # Setup settings to limit to 2 concurrent jobs
    from src.config import settings
    original_limit = settings.max_concurrent_jobs
    settings.max_concurrent_jobs = 2
    try:
        # Acquire 2 slots
        await job_manager.acquire()
        await job_manager.acquire()

        # Try to acquire a 3rd slot with a timeout (should fail/timeout)
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(job_manager.acquire(), timeout=0.1)

        # Release one slot
        job_manager.release()

        # Now we should be able to acquire again
        await asyncio.wait_for(job_manager.acquire(), timeout=0.1)
    finally:
        settings.max_concurrent_jobs = original_limit
