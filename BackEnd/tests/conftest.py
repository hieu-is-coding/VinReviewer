"""Pytest fixtures shared across BackEnd tests."""

import os

import pytest
from fastapi.testclient import TestClient

# Provide minimal env vars so config loads without a .env file
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("API_KEY", "test-api-key")


@pytest.fixture
def client():
    from src.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers():
    return {"X-API-Key": "test-api-key"}


@pytest.fixture(autouse=True)
def clean_job_manager():
    """Reset the module-level state of job_manager before each test to avoid event loop conflicts."""
    from src.services import job_manager
    job_manager._jobs.clear()
    job_manager._semaphore = None



@pytest.fixture
def mock_pipeline_state():
    """Build a mock PipelineState containing pre-filled results for mapping tests."""
    from src.compat import ensure_grading_system
    ensure_grading_system()

    from src.models import (
        PipelineState,
        SupervisorResult,
        ReviewOutput,
        DeliberationResult,
        NoveltyAssessment,
        EvidenceAudit,
        ComparativePosition,
        ReferenceValidation,
        LeafVerdict,
        ClaimSpan,
        NoveltyClaimResult,
        PersonaReview,
    )

    verdicts = [
        LeafVerdict(leaf_id="crit-1", score=0.8, justification="Clear explanation", suggested_revision="None"),
        LeafVerdict(leaf_id="crit-2", score=0.6, justification="Moderate depth", suggested_revision="Add details"),
    ]

    return PipelineState(
        run_id="run-uuid-123",
        manuscript_path="manuscript.txt",
        assignment_prompt="Review details",
        target_venue="ACL",
        calibrated_score=0.7,
        review=ReviewOutput(
            verdicts=verdicts,
            overall_score=0.7,
            summary="Good overall paper",
            strengths=["Strong methodology", "Good flow"],
            weaknesses=["Needs details in section 3"],
        ),
        deliberation=DeliberationResult(
            persona_reviews=[
                PersonaReview(persona="methodology", verdicts=verdicts, overall_score=0.7, summary="OK"),
            ],
            disagreement_flags=[],
            final_verdicts=verdicts,
            final_score=0.7,
        ),
        supervisor_result=SupervisorResult(
            passed=True,
            violations=[],
            human_flag=False,
        ),
        novelty=NoveltyAssessment(
            claims=[
                NoveltyClaimResult(
                    claim_text="New method",
                    max_similarity=0.3,
                    closest_paper_id="paper-1",
                    closest_paper_title="Title 1",
                    classification="NOVEL",
                )
            ],
            overall_novelty_score=85.0,
        ),
        evidence_audit=EvidenceAudit(
            claims=[],
            uncited_claims=[
                ClaimSpan(text="Uncited statement", section_id="sec-1", start_char=0, end_char=20, evidence_similarity=0.1)
            ],
            low_similarity_citations=[],
        ),
        comparative=ComparativePosition(
            overall_percentile=75.0,
            dimension_percentiles={"Clarity": 80.0},
            venue_tier="Tier 1",
        ),
        reference_validation=ReferenceValidation(
            results=[],
            verified_ratio=0.9,
            fabricated_refs=["Fabricated Ref 1"],
        ),
    )

