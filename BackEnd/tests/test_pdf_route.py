"""Integration tests for the PDF evaluation route."""

import io
from unittest.mock import AsyncMock, patch
import pytest


def test_evaluate_pdf_requires_api_key(client):
    files = {"file": ("dummy.pdf", b"%PDF-1.4 dummy data", "application/pdf")}
    resp = client.post("/evaluate-pdf", files=files, data={"submission_id": "sub-123"})
    assert resp.status_code == 401


def test_evaluate_pdf_rejects_non_pdf(client, auth_headers):
    files = {"file": ("dummy.txt", b"plain text data", "text/plain")}
    resp = client.post(
        "/evaluate-pdf",
        files=files,
        data={"submission_id": "sub-123"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Only PDF files are accepted"


def test_evaluate_pdf_rejects_oversized_file(client, auth_headers, monkeypatch):
    # Set max bytes to 10 bytes for test convenience
    from src.routes import pdf
    monkeypatch.setattr(pdf, "_MAX_PDF_BYTES", 10)

    # Upload 20 bytes
    files = {"file": ("dummy.pdf", b"A" * 20, "application/pdf")}
    resp = client.post(
        "/evaluate-pdf",
        files=files,
        data={"submission_id": "sub-123"},
        headers=auth_headers,
    )
    assert resp.status_code == 413
    assert resp.json()["detail"] == "PDF exceeds 50 MB limit"


def test_evaluate_pdf_success_queues_job(client, auth_headers, monkeypatch):
    from src.workers import pipeline_worker
    from src.services import job_manager
    job_manager._jobs.clear()

    async def _noop(*args, **kwargs):
        pass

    monkeypatch.setattr(pipeline_worker, "run_pdf_pipeline", _noop)

    files = {"file": ("dummy.pdf", b"%PDF-1.4 header", "application/pdf")}
    resp = client.post(
        "/evaluate-pdf",
        files=files,
        data={"submission_id": "sub-123"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "queued"
    assert data["submission_id"] == "sub-123"
    assert "job_id" in data


def test_evaluate_pdf_returns_existing_job(client, auth_headers, monkeypatch):
    from src.workers import pipeline_worker
    from src.services import job_manager
    job_manager._jobs.clear()

    existing_job = job_manager.create_job("sub-123")
    job_manager.update_job(existing_job.job_id, status="running")

    files = {"file": ("dummy.pdf", b"%PDF-1.4 header", "application/pdf")}
    resp = client.post(
        "/evaluate-pdf",
        files=files,
        data={"submission_id": "sub-123"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["job_id"] == existing_job.job_id
    assert data["status"] == "running"
    assert data["submission_id"] == "sub-123"
