"""BackEnd custom exception hierarchy."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base exception for all BackEnd application errors."""

    def __init__(
        self,
        detail: str,
        *,
        status_code: int = 500,
        context: dict[str, Any] | None = None,
    ):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.context = context or {}


class ValidationError(AppError):
    """Raised when input data fails validation (missing rubric, empty criteria, etc.)."""

    def __init__(self, detail: str, **ctx: Any):
        super().__init__(detail, status_code=422, context=ctx)


class PipelineError(AppError):
    """Raised when the GradingSystem pipeline fails."""

    def __init__(self, detail: str, **ctx: Any):
        super().__init__(detail, status_code=502, context=ctx)


class SupabaseError(AppError):
    """Raised when a Supabase database operation fails."""

    def __init__(self, detail: str, **ctx: Any):
        super().__init__(detail, status_code=503, context=ctx)


class JobNotFoundError(AppError):
    """Raised when a job ID is not found in the queue."""

    def __init__(self, job_id: str):
        super().__init__(f"Job not found: {job_id}", status_code=404, context={"job_id": job_id})


class AuthenticationError(AppError):
    """Raised when API key validation fails."""

    def __init__(self):
        super().__init__("Invalid or missing API key", status_code=401)
