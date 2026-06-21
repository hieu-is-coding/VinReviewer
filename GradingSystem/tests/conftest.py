"""Shared test fixtures for the Agentic Reviewer test suite."""

from __future__ import annotations

import pytest

from grading_system_src.models import (
    CalibrationParams,
    ClaimSpan,
    ClaimType,
    EvidenceAudit,
    Features,
    FeatureValue,
    Language,
    LeafVerdict,
    LitPool,
    LitPoolEntry,
    Manuscript,
    Reference,
    ReviewOutput,
    RubricNode,
    RubricTree,
    Section,
)


@pytest.fixture
def en_manuscript() -> Manuscript:
    """A short English manuscript fixture."""
    return Manuscript(
        source_path="tests/fixtures/sample_en.pdf",
        language=Language.EN,
        title="The Impact of Climate Change on Coastal Ecosystems",
        abstract=(
            "This paper examines the effects of rising sea levels and temperature "
            "changes on coastal biodiversity. We synthesize findings from multiple "
            "longitudinal studies conducted between 2010 and 2023."
        ),
        sections=[
            Section(
                heading="Introduction",
                body=(
                    "Climate change represents one of the most significant challenges "
                    "facing coastal ecosystems today. Rising sea levels threaten habitats "
                    "that support diverse marine and terrestrial species (Smith, 2020). "
                    "Previous research has demonstrated measurable impacts on biodiversity "
                    "indices across multiple coastal regions (Jones & Lee, 2019). "
                    "This study aims to synthesize these findings and identify key patterns."
                ),
                level=1,
            ),
            Section(
                heading="Methods",
                body=(
                    "We conducted a systematic review of 45 peer-reviewed studies "
                    "published between 2010 and 2023. Data were extracted following "
                    "PRISMA guidelines. Statistical analyses included meta-regression "
                    "and fixed-effects models to account for heterogeneity across studies."
                ),
                level=1,
            ),
            Section(
                heading="Results",
                body=(
                    "Our analysis reveals a consistent decline in species richness "
                    "across all coastal regions studied. The mean effect size was "
                    "-0.45 (95% CI: -0.62, -0.28), indicating a moderate negative "
                    "impact of climate-related changes on biodiversity. Temperature "
                    "increases showed the strongest correlation with species loss "
                    "(r = -0.67, p < 0.001)."
                ),
                level=1,
            ),
            Section(
                heading="Discussion",
                body=(
                    "These findings align with theoretical predictions regarding "
                    "thermal tolerance limits in marine species. However, some regions "
                    "showed unexpected resilience, particularly in areas with existing "
                    "conservation measures (Brown et al., 2021). The implications for "
                    "policy are significant: targeted interventions in high-risk zones "
                    "could mitigate the worst effects of biodiversity loss."
                ),
                level=1,
            ),
            Section(
                heading="References",
                body=(
                    "Smith, J. (2020). Sea level rise and habitat loss. Nature Climate Change.\n"
                    "Jones, A., Lee, B. (2019). Biodiversity impacts of coastal warming. Ecology Letters.\n"
                    "Brown, C., Davis, D., Evans, E. (2021). Conservation and climate resilience. Conservation Biology."
                ),
                level=1,
            ),
        ],
        full_text="",  # Will be computed
        references=[
            Reference(id="ref_0", title="Sea level rise and habitat loss", authors=["J Smith"], year=2020),
            Reference(id="ref_1", title="Biodiversity impacts of coastal warming", authors=["A Jones", "B Lee"], year=2019),
            Reference(id="ref_2", title="Conservation and climate resilience", authors=["C Brown", "D Davis", "E Evans"], year=2021),
        ],
        inline_citations=["ref_0", "ref_1", "ref_2"],
        word_count=0,
    )


@pytest.fixture(autouse=True)
def _populate_full_text(en_manuscript: Manuscript) -> None:
    """Auto-populate full_text and word_count from sections."""
    en_manuscript.full_text = "\n\n".join(
        f"{s.heading}\n{s.body}" if s.heading else s.body
        for s in en_manuscript.sections
    )
    en_manuscript.word_count = len(en_manuscript.full_text.split())


@pytest.fixture
def sample_rubric_tree() -> RubricTree:
    """A minimal rubric tree fixture."""
    return RubricTree(
        dimensions=[
            RubricNode(
                id="thesis_scope",
                label="Thesis & Scope",
                weight=0.25,
                children=[
                    RubricNode(id="thesis_clarity", label="Thesis clarity", weight=0.5),
                    RubricNode(id="scope_appropriateness", label="Scope appropriateness", weight=0.5),
                ],
            ),
            RubricNode(
                id="evidence_use",
                label="Evidence Use",
                weight=0.25,
                children=[
                    RubricNode(id="source_quality", label="Source quality", weight=0.5),
                    RubricNode(id="evidence_integration", label="Evidence integration", weight=0.5),
                ],
            ),
            RubricNode(
                id="structure_cohesion",
                label="Structure & Cohesion",
                weight=0.25,
                children=[
                    RubricNode(id="organization", label="Organization", weight=0.5),
                    RubricNode(id="transitions", label="Transitions", weight=0.5),
                ],
            ),
            RubricNode(
                id="style_mechanics",
                label="Style & Mechanics",
                weight=0.25,
                children=[
                    RubricNode(id="grammar_spelling", label="Grammar & spelling", weight=0.5),
                    RubricNode(id="academic_register", label="Academic register", weight=0.5),
                ],
            ),
        ]
    )


@pytest.fixture
def sample_lit_pool() -> LitPool:
    """A minimal lit pool fixture."""
    return LitPool(
        entries=[
            LitPoolEntry(
                paper_id="s2_001",
                title="Sea level rise and habitat loss",
                authors=["J Smith"],
                year=2020,
                abstract="A study on sea level rise impacts on coastal habitats.",
                relevance_score=0.85,
            ),
            LitPoolEntry(
                paper_id="s2_002",
                title="Biodiversity impacts of coastal warming",
                authors=["A Jones", "B Lee"],
                year=2019,
                abstract="Examines how warming affects coastal biodiversity indices.",
                relevance_score=0.80,
            ),
        ],
        query_keywords=["coastal ecosystems climate change", "biodiversity sea level rise"],
    )


@pytest.fixture
def sample_features() -> Features:
    """A minimal features fixture."""
    return Features(values={
        "lsa_coherence": FeatureValue(id="lsa_coherence", raw_value=0.65, z_score=0.3, label="LSA coherence"),
        "mdd_mean": FeatureValue(id="mdd_mean", raw_value=3.2, z_score=-0.1, label="Mean dependency distance"),
        "mtld": FeatureValue(id="mtld", raw_value=85.0, z_score=0.5, label="MTLD"),
        "errors_per_100w": FeatureValue(id="errors_per_100w", raw_value=1.2, z_score=-0.8, label="Errors per 100 words"),
        "citation_count": FeatureValue(id="citation_count", raw_value=3.0, z_score=-1.0, label="Total citations"),
    })


@pytest.fixture
def sample_review(sample_rubric_tree: RubricTree) -> ReviewOutput:
    """A review output that covers all rubric leaves."""
    leaves = []
    for dim in sample_rubric_tree.dimensions:
        for child in dim.children:
            leaves.append(child.id)

    verdicts = [
        LeafVerdict(
            leaf_id=lid,
            score=0.7,
            justification=f"The manuscript shows adequate performance on {lid}.",
            suggested_revision=f"Consider improving {lid} further.",
        )
        for lid in leaves
    ]

    return ReviewOutput(
        verdicts=verdicts,
        overall_score=0.7,
        summary="Overall a competent manuscript with room for improvement.",
        strengths=["Clear methodology", "Good use of statistics"],
        weaknesses=["Limited references", "Could strengthen discussion"],
    )
