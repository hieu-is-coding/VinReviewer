"""Pydantic models for API responses."""

from typing import Literal

from pydantic import BaseModel


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    submission_id: str
    error: str | None = None
    evaluation_id: str | None = None


class EvaluateResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running"]
    submission_id: str


class WebhookResponse(BaseModel):
    accepted: bool
    reason: str | None = None
    job_id: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    grobid: bool
    supabase: bool
    models_loaded: bool
