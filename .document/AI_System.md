# GradioAI AI Block (GradingSystem) Specifications

This document describes the technical specifications of the **GradioAI AI Block (`GradingSystem`)**, detailing the input/output boundaries, the orchestration graph state model, the internal agent workflows, and the integration endpoints connecting the AI block with the BackEnd and FrontEnd layers.

---

## 1. System Integration Overview

The `GradingSystem` is packaged as a local Python module that runs as a dependency of the FastAPI BackEnd application. 

```
   ┌────────────────────────────────────────────────────────┐
   │                     FastAPI BackEnd                    │
   │                                                        │
   │   1. API Request  ┌────────────────────────────────┐   │
   │   ───────────────▶│         evaluator.py           │   │
   │                   │   _run_pipeline_sync()         │   │
   │                   └───────────────┬────────────────┘   │
   │                                   │                    │
   │                                   │ 2. run_pipeline()  │
   │                                   ▼                    │
   │   ┌────────────────────────────────────────────────┐   │
   │   │            AI Block (GradingSystem)            │   │
   │   │                                                │   │
   │   │  • Orchestration Graph (graph.py)              │   │
   │   │  • State Contract (models.py)                  │   │
   │   │  • Agents (Ingestion, Retrieval, Deliberation) │   │
   │   └───────────────────────┬────────────────────────┘   │
   │                           │                            │
   │                           │ 3. PipelineState (output)  │
   │                           ▼                            │
   │                   ┌────────────────────────────────┐   │
   │                   │        mapping/result.py       │   │
   │                   │   Translates state to DB rows  │   │
   │                   └────────────────┬───────────────┘   │
   └────────────────────────────────────┼───────────────────┘
                                        │
                                        │ 4. SQL Inserts
                                        ▼
                         ┌─────────────────────────────┐
                         │      Supabase Database      │
                         │   evaluations & details     │
                         └─────────────────────────────┘
```

1.  **Direct Execution:** The BackEnd imports `run_pipeline` directly and runs the AI pipeline synchronously inside a thread pool (`asyncio.to_thread`) to prevent blocking the async ASGI server loop.
2.  **Stateless Request/Response:** The communication is stateless. The BackEnd passes manuscript contents, prompt criteria, and target venue data to the pipeline, and receives a populated Pydantic state container containing all diagnostic results.
3.  **ORM Mapping Persistence:** The BackEnd acts as the database mediator. It extracts data from the returned pipeline state and maps it into corresponding SQL table rows in Supabase. The FrontEnd queries these tables to display the results.

---

## 2. API Contract & Data Schema (models.py)

All data exchanged between the BackEnd orchestrator and the AI pipeline is structured using Pydantic models defined in [models.py](file:///e:/GradioAI/GradingSystem/src/models.py).

### 2.1 Pipeline Inputs (graph.py Entry Point)
The BackEnd invokes the pipeline by calling `run_pipeline()` in [graph.py](file:///e:/GradioAI/GradingSystem/src/orchestration/graph.py):
```python
def run_pipeline(
    manuscript_path: str,
    assignment_prompt: str = "",
    reference_grade: float | None = None,
    target_venue: str = "",
    output_dir: str | None = None,
) -> PipelineState:
```
*   `manuscript_path`: Local disk path to the ingested manuscript (PDF or text file).
*   `assignment_prompt`: The instructor-specified grading directions and context.
*   `target_venue`: Academic target venue profile (e.g. `neurips`, `acl`) to adjust scoring thresholds.
*   `output_dir`: Path to dump phase diagnostics for pipeline auditing.

### 2.2 The Unified `PipelineState` Model
The execution state is captured inside the `PipelineState` container. The BackEnd extracts this state to construct database payloads:

*   **`manuscript` (`Manuscript`):** Contains the extracted paper metadata, list of parsed headings and paragraph bodies, citations list, and raw text.
*   **`rubric_tree` (`RubricTree`):** The personalized rubric dimensions and weights used for the evaluation.
*   **`lit_pool` (`LitPool`):** The bibliography entries fetched from Semantic Scholar that match the manuscript's topic.
*   **`features` (`Features`):** Extracted style, cohesion, mechanics, and citation metrics.
*   **`reference_validation` (`ReferenceValidation`):** Results of checking the bibliography against external APIs, flagging suspicious or fabricated references.
*   **`evidence_audit` (`EvidenceAudit`):** Lists of uncited fact claims or citations with low similarity to the text.
*   **`novelty` (`NoveltyAssessment`):** The classification of contributions as `NOVEL`, `INCREMENTAL`, or `REDUNDANT`.
*   **`deliberation` (`DeliberationResult`):** The individual critiques from the Methodology, Domain, and Communication reviewers, alongside disagreement flags.
*   **`supervisor_result` (`SupervisorResult`):** Holds the flag for rule violations (R1–R7) and the `human_flag` boolean.
*   **`calibrated_score` (float):** The final normalized grade after monotone affine correction.
*   **`comparative` (`ComparativePosition`):** Percentile positioning and venue tier calculations.

---

## 3. The Orchestration State Machine

The pipeline uses **LangGraph** to coordinate parallel execution, verify rules, and handle error recovery.

```
                  ┌───────────────────────────────┐
                  │            ingest             │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │ (Parallel Context)     │                        │
         ▼                        ▼                        ▼
 ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
 │    rubric     │        │   retrieval   │        │  features &   │
 └───────┬───────┘        └───────┬───────┘        │ref_validation │
         │                        │                └───────┬───────┘
         │                        ▼                        │
         │                ┌───────────────┐                │
         │                │    novelty    │                │
         │                └───────┬───────┘                │
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │   evidence    │
                          └───────┬───────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │   synthesis   │
                          │(deliberation) │
                          └───────┬───────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │  supervisor   │
                          └───────┬───────┘
                                  │ (Conditional Edge)
                                  ├────────────────────────┐
                                  │ Violation?             │
                                  ▼                        ▼
                          ┌───────────────┐        ┌───────────────┐
                          │   synthesis   │        │   calibrate   │
                          │  (Regen <=1)  │        └───────┬───────┘
                          └───────────────┘                │
                                                           ▼
                                                          END
```

### 3.1 Node Walkthrough

#### 1. Ingestion (`ingest`)
*   **Action:** Runs the ingestion client to parse the manuscript.
*   **Internal:** Parses PDFs using GROBID to extract sections, inline citations, and bibliography. Returns a structured `Manuscript` instance.

#### 2. Rubric Customization (`rubric`)
*   **Action:** Employs an LLM agent to customize a rubric tree based on the assignment prompt.
*   **Internal:** Generates nodes and weights while ensuring that weights sum to `1.0`.

#### 3. Literature Retrieval (`retrieval`)
*   **Action:** Generates search queries matching the abstract and retrieves papers from Semantic Scholar.
*   **Internal:** Returns the top 30 most relevant papers as the `LitPool` (used for novelty and evidence audits).

#### 4. Feature Extraction & Reference Check (`features` / `ref_validation`)
*   **Action:** Computes grammar, cohesion, styling, and diversity features.
*   **Internal:** Checks bibliography references against Crossref and OpenAlex. Matches DOIs and calculates verified ratios to flag fabricated citations.

#### 5. Novelty Assessment (`novelty`)
*   **Action:** Compares manuscript contribution claims against the `LitPool` using vector similarity.
*   **Internal:** Classifies contributions into `NOVEL`, `INCREMENTAL`, or `REDUNDANT`.

#### 6. Evidence Audit (`evidence`)
*   **Action:** Segments paragraphs into claims and verifies them against cited literature abstracts.
*   **Internal:** Flags uncited facts or mismatch citations.

#### 7. Multi-Persona Deliberation (`synthesis`)
*   **Action:** Simulates three reviewer personas (Methodology, Domain, and Communication) to evaluate the manuscript against the rubric.
*   **Internal:** personifies LLM agents to vote on criteria. Aggregates scores and flags criteria with high disagreement.

#### 8. Supervisor Check (`supervisor`)
*   **Action:** Evaluates output against seven quality rules (e.g., no fabricated references, full rubric coverage).
*   **Internal:** If a rule is violated and the regeneration count is $\le 1$, the graph routes back to the synthesis node with validation feedback. Otherwise, it sets the `human_flag = True` and proceeds.

#### 9. Calibration (`calibrate`)
*   **Action:** Calibrates scores against human grading trends and calculates percentile metrics.
*   **Internal:** Applies monotone ordinary least-squares regression.

---

## 4. Integration Mapping to Database

When `run_pipeline` completes, [evaluator.py](file:///e:/GradioAI/BackEnd/src/services/evaluator.py) extracts variables from `PipelineState` and saves them to Supabase using [result.py](file:///e:/GradioAI/BackEnd/src/mapping/result.py):

```python
# 1. Map core evaluations summary
eval_payload = map_pipeline_to_evaluation(state, criteria, submission_id)
await update_evaluation(eval_id, eval_payload)

# 2. Map per-criterion scores
cs_rows = map_pipeline_to_criteria_scores(state, criteria, eval_id)
await insert_criteria_scores(cs_rows)

# 3. Map advanced diagnostics details
details = map_pipeline_to_details(state, eval_id)
await insert_evaluation_details(details)
```

The database structures mapped from Pydantic are:
*   `overall_feedback` $\leftarrow$ `state.review.summary`
*   `improvement_suggestions` $\leftarrow$ Concatenation of claims from `state.evidence_audit`, `state.novelty`, and `state.reference_validation`
*   `evidence` (in `criteria_scores`) $\leftarrow$ `state.review.verdicts[i].suggested_revision`
*   `uncited_claims` (in `evaluation_details`) $\leftarrow$ Serialized list of claims from `state.evidence_audit.uncited_claims`
*   `red_line_violations` (in `evaluation_details`) $\leftarrow$ Serialized violations list from `state.supervisor_result.violations`

---

## 5. FrontEnd Rendering of Agentic States

The FrontEnd consumes these database payloads and renders them in the UI:

*   **Interactive Rubric Breakdown:** Displays score levels and confidence percentages for each criterion from `criteria_scores`. Shows warnings if `hallucinated_evidence` is flagged.
*   **Review Pipeline:** Updates the status flow to `Flagged` or `Needs Review` if the database indicates a low confidence score or if `human_flag = True` in `evaluation_details`.
*   **Prioritized Gaps:** Renders the suggestions text from `improvement_suggestions` to help instructors focus their feedback.
