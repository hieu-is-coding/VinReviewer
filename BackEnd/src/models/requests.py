"""Pydantic models for API requests."""

from pydantic import BaseModel, Field, ConfigDict


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

    model_config = ConfigDict(populate_by_name=True)

    type: str  # INSERT | UPDATE | DELETE
    table: str
    record: dict
    old_record: dict | None = None
    schema_: str = Field(default="public", alias="schema")

