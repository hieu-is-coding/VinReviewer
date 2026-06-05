"""Pydantic models for API requests."""

from pydantic import BaseModel, Field


class EvaluateRequest(BaseModel):
    submission_id: str = Field(..., description="UUID of the submission row in Supabase")
    use_agentic: bool = Field(
        default=True,
        description="Use full GradingSystem pipeline (True) vs simple Gemini evaluator (False)",
    )


class EvaluatePdfRequest(BaseModel):
    submission_id: str = Field(..., description="UUID of the submission row in Supabase")


class WebhookPayload(BaseModel):
    """Supabase database webhook payload schema."""

    type: str  # INSERT | UPDATE | DELETE
    table: str
    record: dict
    old_record: dict | None = None
    schema: str = "public"
