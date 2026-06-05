"""Shared Pydantic models for the pipeline state and inter-phase contracts."""

from __future__ import annotations

import enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Language(str, enum.Enum):
    EN = "en"


class ClaimType(str, enum.Enum):
    SYNTHESIS = "SYNTHESIS"
    SUMMARY = "SUMMARY"
    UNSUPPORTED = "UNSUPPORTED"


class RedLineID(str, enum.Enum):
    R1 = "no_hallucinated_citations"
    R2 = "full_rubric_coverage"
    R3 = "formatting_consistency"
    R4 = "calibrated_score_bound"
    R5 = "citation_style_consistency"
    R6 = "no_fabricated_references"
    R7 = "deliberation_disagreement_resolved"


class Severity(str, enum.Enum):
    HARD = "hard"
    SOFT = "soft"


# ---------------------------------------------------------------------------
# Phase 0 — Ingestion
# ---------------------------------------------------------------------------

class Reference(BaseModel):
    """A single bibliographic reference extracted from the manuscript."""
    id: str
    title: str = ""
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    doi: str | None = None
    raw: str = ""


class Section(BaseModel):
    """A manuscript section (heading + body text)."""
    heading: str
    body: str
    level: int = 1


class Manuscript(BaseModel):
    """Parsed manuscript representation."""
    source_path: str
    language: Language
    title: str = ""
    abstract: str = ""
    sections: list[Section] = Field(default_factory=list)
    full_text: str = ""
    references: list[Reference] = Field(default_factory=list)
    inline_citations: list[str] = Field(default_factory=list)
    word_count: int = 0


# ---------------------------------------------------------------------------
# Phase 1 — Rubric & Literature
# ---------------------------------------------------------------------------

class RubricLeaf(BaseModel):
    """Leaf node of the rubric tree."""
    id: str
    label: str
    weight: float
    parent_id: str | None = None


class RubricNode(BaseModel):
    """A rubric tree node (may have children)."""
    id: str
    label: str
    weight: float
    children: list[RubricNode] = Field(default_factory=list)


class RubricTree(BaseModel):
    """Full rubric tree output of Phase 1.1."""
    dimensions: list[RubricNode]
    depth: int = 2


class LitPoolEntry(BaseModel):
    """A literature reference retrieved from Semantic Scholar."""
    paper_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    doi: str | None = None
    relevance_score: float = 0.0


class LitPool(BaseModel):
    """Literature pool output of Phase 1.2."""
    entries: list[LitPoolEntry] = Field(default_factory=list)
    query_keywords: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Phase 2 — Features
# ---------------------------------------------------------------------------

class FeatureValue(BaseModel):
    """A single extracted feature."""
    id: str
    raw_value: float
    z_score: float | None = None
    label: str = ""


class Features(BaseModel):
    """Flat feature dict output of Phase 2."""
    values: dict[str, FeatureValue] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Phase 3 — Evidence Audit
# ---------------------------------------------------------------------------

class ClaimSpan(BaseModel):
    """A claim identified in the manuscript."""
    text: str
    section_id: str = ""
    start_char: int = 0
    end_char: int = 0
    cited_ref_ids: list[str] = Field(default_factory=list)
    evidence_similarity: float = 0.0
    claim_type: ClaimType = ClaimType.UNSUPPORTED


class EvidenceAudit(BaseModel):
    """Output of Phase 3."""
    claims: list[ClaimSpan] = Field(default_factory=list)
    uncited_claims: list[ClaimSpan] = Field(default_factory=list)
    low_similarity_citations: list[ClaimSpan] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Phase 4 — Synthesis
# ---------------------------------------------------------------------------

class LeafVerdict(BaseModel):
    """Per-rubric-leaf verdict from the LLM."""
    leaf_id: str
    score: float = Field(ge=0.0, le=1.0)
    justification: str = ""
    suggested_revision: str = ""


class ReviewOutput(BaseModel):
    """Structured review output of Phase 4.1."""
    verdicts: list[LeafVerdict] = Field(default_factory=list)
    overall_score: float = Field(default=0.0, ge=0.0, le=1.0)
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)


class RedLineViolation(BaseModel):
    """A red-line violation detected by the supervisor."""
    rule_id: RedLineID
    severity: Severity
    detail: str = ""


class SupervisorResult(BaseModel):
    """Output of Phase 4.2."""
    passed: bool = True
    violations: list[RedLineViolation] = Field(default_factory=list)
    regen_count: int = 0
    human_flag: bool = False


# ---------------------------------------------------------------------------
# Phase 5 — Calibration
# ---------------------------------------------------------------------------

class CalibrationParams(BaseModel):
    """Monotone affine calibration parameters."""
    slope: float = 1.0
    intercept: float = 0.0
    lower_bound: float = 0.0
    upper_bound: float = 1.0


# ---------------------------------------------------------------------------
# Reference Validation (Feature 1)
# ---------------------------------------------------------------------------

class RefCheckResult(BaseModel):
    """Validation result for a single reference."""
    ref_id: str
    status: Literal["verified", "likely_valid", "suspicious", "fabricated"] = "suspicious"
    source: str = ""  # "crossref", "openalex", "unverified"
    matched_doi: str | None = None
    confidence: float = 0.0


class ReferenceValidation(BaseModel):
    """Aggregate reference validation output."""
    results: list[RefCheckResult] = Field(default_factory=list)
    verified_ratio: float = 0.0
    fabricated_refs: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Novelty Assessment (Feature 2)
# ---------------------------------------------------------------------------

class NoveltyClaimResult(BaseModel):
    """Novelty assessment for a single contribution claim."""
    claim_text: str
    max_similarity: float = 0.0
    closest_paper_id: str = ""
    closest_paper_title: str = ""
    classification: Literal["NOVEL", "INCREMENTAL", "REDUNDANT"] = "NOVEL"


class NoveltyAssessment(BaseModel):
    """Overall novelty assessment output."""
    claims: list[NoveltyClaimResult] = Field(default_factory=list)
    overall_novelty_score: float = 0.0


# ---------------------------------------------------------------------------
# Multi-Persona Deliberation (Feature 4)
# ---------------------------------------------------------------------------

class PersonaReview(BaseModel):
    """Review generated by a single reviewer persona."""
    persona: Literal["methodology", "domain", "communication"]
    verdicts: list[LeafVerdict] = Field(default_factory=list)
    overall_score: float = Field(default=0.0, ge=0.0, le=1.0)
    summary: str = ""


class DeliberationResult(BaseModel):
    """Output of multi-persona deliberation and voting."""
    persona_reviews: list[PersonaReview] = Field(default_factory=list)
    disagreement_flags: list[str] = Field(default_factory=list)  # leaf_ids with high variance
    final_verdicts: list[LeafVerdict] = Field(default_factory=list)
    final_score: float = Field(default=0.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Perturbation Confidence (Feature 5)
# ---------------------------------------------------------------------------

class PerturbationResult(BaseModel):
    """Score stability test results."""
    scores: list[float] = Field(default_factory=list)
    score_std: float = 0.0
    confidence: float = 1.0
    unstable_leaves: list[str] = Field(default_factory=list)
    confidence_label: Literal["HIGH", "MEDIUM", "LOW"] = "HIGH"


# ---------------------------------------------------------------------------
# Comparative Scoring (Feature 6)
# ---------------------------------------------------------------------------

class ComparativePosition(BaseModel):
    """Percentile positioning against reference corpus."""
    overall_percentile: float = 50.0
    dimension_percentiles: dict[str, float] = Field(default_factory=dict)
    venue_tier: str = "general"
    comparative_statements: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Rebuttal (Feature 7)
# ---------------------------------------------------------------------------

class RebuttalEntry(BaseModel):
    """A single author rebuttal to a leaf verdict."""
    leaf_id: str
    response: str


class RebuttalOutcome(BaseModel):
    """Outcome of re-evaluation for a single rebutted leaf."""
    leaf_id: str
    original_score: float
    revised_score: float
    accepted: bool = False
    revised_justification: str = ""


class RebuttalResult(BaseModel):
    """Full rebuttal processing output."""
    outcomes: list[RebuttalOutcome] = Field(default_factory=list)
    revised_overall_score: float = 0.0
    score_delta: float = 0.0


# ---------------------------------------------------------------------------
# Pipeline State (LangGraph)
# ---------------------------------------------------------------------------

class PipelineState(BaseModel):
    """Full state threaded through the LangGraph orchestration."""
    # Inputs
    manuscript_path: str = ""
    assignment_prompt: str = ""
    reference_grade: float | None = None
    target_venue: str = ""

    # Phase 0
    manuscript: Manuscript | None = None

    # Phase 1
    rubric_tree: RubricTree | None = None
    lit_pool: LitPool | None = None

    # Phase 2
    features: Features | None = None
    reference_validation: ReferenceValidation | None = None

    # Phase 3
    evidence_audit: EvidenceAudit | None = None
    novelty: NoveltyAssessment | None = None

    # Phase 4
    review: ReviewOutput | None = None
    deliberation: DeliberationResult | None = None
    supervisor_result: SupervisorResult | None = None

    # Phase 5
    calibration: CalibrationParams | None = None
    calibrated_score: float | None = None
    comparative: ComparativePosition | None = None
    perturbation: PerturbationResult | None = None

    # Metadata
    run_id: str = ""
    errors: list[str] = Field(default_factory=list)
