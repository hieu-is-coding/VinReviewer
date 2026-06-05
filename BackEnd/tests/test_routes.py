"""Integration tests for BackEnd API routes (no Supabase or GradingSystem calls)."""

import pytest


def test_health_returns_200(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert data["status"] in ("ok", "degraded")


def test_evaluate_requires_api_key(client):
    resp = client.post("/evaluate", json={"submission_id": "abc-123"})
    assert resp.status_code == 401


def test_evaluate_returns_job(client, auth_headers, monkeypatch):
    # Prevent the background task from actually running
    from src.workers import pipeline_worker

    async def _noop(*args, **kwargs):
        pass

    monkeypatch.setattr(pipeline_worker, "run_text_pipeline", _noop)

    resp = client.post(
        "/evaluate",
        json={"submission_id": "sub-uuid-001"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["submission_id"] == "sub-uuid-001"
    assert data["status"] == "queued"
    assert "job_id" in data


def test_get_job_not_found(client, auth_headers):
    resp = client.get("/jobs/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


def test_get_job_found(client, auth_headers, monkeypatch):
    from src.workers import pipeline_worker

    async def _noop(*args, **kwargs):
        pass

    monkeypatch.setattr(pipeline_worker, "run_text_pipeline", _noop)

    post = client.post(
        "/evaluate",
        json={"submission_id": "sub-uuid-002"},
        headers=auth_headers,
    )
    job_id = post.json()["job_id"]

    resp = client.get(f"/jobs/{job_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["job_id"] == job_id


def test_webhook_rejects_missing_id(client, auth_headers):
    resp = client.post(
        "/webhook/submission-created",
        json={"type": "INSERT", "table": "submissions", "record": {}, "schema": "public"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_webhook_ignores_non_pending(client, auth_headers, monkeypatch):
    from src.workers import pipeline_worker

    async def _noop(*args, **kwargs):
        pass

    monkeypatch.setattr(pipeline_worker, "run_text_pipeline", _noop)

    resp = client.post(
        "/webhook/submission-created",
        json={
            "type": "INSERT",
            "table": "submissions",
            "record": {"id": "sub-003", "status": "ai_graded"},
            "schema": "public",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 202
    assert resp.json()["accepted"] is False
