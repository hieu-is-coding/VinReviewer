# GradioAI BackEnd & Database Specifications

This document provides a detailed specification of the GradioAI BackEnd service, including its API architecture, database connection, database schema entities, data mapping structures, reliability mechanisms, and testing strategies.

---

## 1. Overview & Technology Stack

The GradioAI BackEnd acts as the orchestration and processing engine that connects the React FrontEnd (via Supabase PostgreSQL) to the advanced AI pipeline (`GradingSystem`). It handles tasks such as concurrent job queueing, database schema mapping, partial-write rollback operations, and structured logging.

### Technology Stack Selection

The backend is built using the following modern Python technology stack:

*   **Language & Core Framework:** **Python 3.11+** with **FastAPI (0.111+)** and **Uvicorn (0.30+)** as the ASGI server. This enables native async/await execution, high concurrency, and auto-generated Swagger documentation.
*   **Database Client:** **supabase-py (2.0+)** using its `AsyncClient` wrapper for asynchronous database operations.
*   **Data Models & Configuration:** **Pydantic (2.x)** for request/response serialization and **Pydantic Settings** for environment-based configuration validation (via `.env`).
*   **Asynchronous File I/O:** **aiofiles (23.2+)** to stream and store uploaded PDFs to temporary files without blocking the main event loop.
*   **Linguistic Features & ML:** Imports the local custom `GradingSystem` library, which utilizes **LangGraph**, **LangChain**, and **sentence-transformers** for evaluation.

---

## 2. Database Connection & Configuration

The database is powered by **Supabase (PostgreSQL)**. The connection is initialized and managed asynchronously to avoid blocking the API worker threads.

### 2.1 Supabase Client Wrapper
The database client is implemented as a singleton client wrapper in [supabase_client.py](file:///e:/GradioAI/BackEnd/src/services/supabase_client.py):
*   **Initialization:** Calls `acreate_client()` using `settings.supabase_url` and `settings.supabase_service_key` (service role secret).
*   **Service Account Authorization:** Since database transactions are triggered server-side by the backend, it uses the high-privilege `service_key` to bypass Row-Level Security (RLS) policies for write/cleanup tasks while client-side reads are restricted via standard RLS policies.

### 2.2 Environment Configurations
Defined in [config.py](file:///e:/GradioAI/BackEnd/src/config.py) and mapped via `.env`:
*   `SUPABASE_URL`: The project endpoint URL.
*   `SUPABASE_SERVICE_KEY`: Service role secret token for API validation.
*   `API_KEY`: A shared secret compared via a timing-safe `compare_digest` in the `X-API-Key` HTTP header.
*   `MAX_CONCURRENT_JOBS`: Concurrency limit (default is `5` to match server memory limitations).
*   `JOB_TIMEOUT_SECONDS`: Maximum runtime allowed for a single pipeline before timeout (default `600` seconds).

---

## 3. Database Schema & Entities

The database schema is managed via Supabase migrations located in the FrontEnd repository. The schema contains 13 active tables mapping course entities, submissions, rubric layouts, evaluations, and analytical metadata.

> [!NOTE]
> In migration `20260525095924_843a37e3-8f37-4343-b4d9-a00c16bb43da.sql`, the legacy `evaluation_runs` and `prompt_versions` tables, along with fields such as `evaluation_mode` and `critic_disagreement` were dropped to streamline the database schema, relying on python-side file logs and typed models for pipeline runs.

### 3.1 Course & Roster Entities

#### 3.1.1 `classes`
Represents an instructor's course.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `name` (TEXT, NOT NULL)
*   `description` (TEXT, Nullable)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.1.2 `students`
Student demographics roster.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `name` (TEXT, NOT NULL)
*   `email` (TEXT, Nullable)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.1.3 `class_students`
Many-to-many junction mapping student enrollment in classes.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `class_id` (UUID, Foreign Key -> `classes.id` ON DELETE CASCADE, NOT NULL)
*   `student_id` (UUID, Foreign Key -> `students.id` ON DELETE CASCADE, NOT NULL)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   *Constraints:* `UNIQUE(class_id, student_id)`

---

### 3.2 Assignment & Rubric Entities

#### 3.2.1 `assignments`
Assigned tasks for students in a class.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `class_id` (UUID, Foreign Key -> `classes.id` ON DELETE CASCADE, NOT NULL)
*   `rubric_id` (UUID, Foreign Key -> `rubrics.id` ON DELETE SET NULL, Nullable)
*   `title` (TEXT, NOT NULL)
*   `description` (TEXT, Nullable)
*   `status` (TEXT, DEFAULT: `'active'`)
*   `submission_type` (TEXT, DEFAULT: `'essay'`) -- Supports: `'essay'`, `'research_paper'`
*   `target_venue` (TEXT, DEFAULT: `'general'`) -- e.g., `'general'`, `'neurips'`, `'acl'`, `'nature'`
*   `use_agentic_evaluation` (BOOLEAN, DEFAULT: `FALSE`)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.2.2 `rubrics`
A container for criteria metrics attached to a course or assignment.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `name` (TEXT, NOT NULL)
*   `description` (TEXT, Nullable)
*   `class_id` (UUID, Foreign Key -> `classes.id` ON DELETE SET NULL, Nullable)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.2.3 `criteria`
Linguistic and thematic metrics that form a rubric.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `rubric_id` (UUID, Foreign Key -> `rubrics.id` ON DELETE CASCADE, NOT NULL)
*   `name` (TEXT, NOT NULL)
*   `description` (TEXT, Nullable)
*   `weight` (NUMERIC, DEFAULT: `1`)
*   `max_score` (INTEGER, DEFAULT: `5`)
*   `sort_order` (INTEGER, DEFAULT: `0`)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

---

### 3.3 Submissions & Evaluations Entities

#### 3.3.1 `submissions`
Uploaded documents or texts submitted by students.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `student_id` (UUID, Foreign Key -> `students.id` ON DELETE CASCADE, NOT NULL)
*   `class_id` (UUID, Foreign Key -> `classes.id` ON DELETE CASCADE, NOT NULL)
*   `rubric_id` (UUID, Foreign Key -> `rubrics.id` ON DELETE SET NULL, Nullable)
*   `assignment_id` (UUID, Foreign Key -> `assignments.id` ON DELETE CASCADE, Nullable)
*   `title` (TEXT, Nullable)
*   `content` (TEXT, NOT NULL)
*   `status` (TEXT, DEFAULT: `'pending'`)
    *   *Check Constraint:* Value must be one of `['pending', 'evaluating', 'ai_graded', 'needs_review', 'human_reviewed', 'flagged', 'approved']`
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.3.2 `evaluations`
High-level summary of an evaluation run.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `submission_id` (UUID, Foreign Key -> `submissions.id` ON DELETE CASCADE, NOT NULL)
*   `total_score` (NUMERIC, Nullable)
*   `max_possible_score` (NUMERIC, Nullable)
*   `confidence` (NUMERIC, Nullable)
*   `overall_feedback` (TEXT, Nullable)
*   `grammar_feedback` (TEXT, Nullable) -- Deprecated/Reserved for simple evaluator
*   `content_feedback` (TEXT, Nullable) -- Maps strengths in agentic mode
*   `structure_feedback` (TEXT, Nullable) -- Maps weaknesses in agentic mode
*   `improvement_suggestions` (TEXT, Nullable)
*   `evaluation_type` (TEXT, NOT NULL, DEFAULT: `'simple'`) -- Supports: `'simple'`, `'agentic'`
*   `status` (TEXT, DEFAULT: `'pending'`)
    *   *Check Constraint:* Value must be one of `['pending', 'in_progress', 'completed', 'overridden', 'failed']`
*   `confidence_breakdown` (JSONB, Nullable)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.3.3 `criteria_scores`
Individual score breakdown and rationale per criterion.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `evaluation_id` (UUID, Foreign Key -> `evaluations.id` ON DELETE CASCADE, NOT NULL)
*   `criterion_id` (UUID, Foreign Key -> `criteria.id` ON DELETE CASCADE, NOT NULL)
*   `score` (NUMERIC, NOT NULL) -- Current active score (subject to teacher override)
*   `ai_score` (NUMERIC, Nullable) -- Original AI-assigned score (read-only for audit history)
*   `explanation` (TEXT, Nullable) -- AI reasoning justification
*   `evidence` (TEXT, Nullable) -- Quoted sentence from manuscript mapping this score
*   `confidence` (NUMERIC, Nullable) -- Confidence index 0..100
*   `hallucinated_evidence` (BOOLEAN, DEFAULT: `false`) -- Flags if cited evidence was fabricated
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

---

### 3.4 Advanced Agentic Metadata & Diagnostics

#### 3.4.1 `evaluation_details`
Details populated during advanced agentic evaluations.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `evaluation_id` (UUID, Foreign Key -> `evaluations.id` ON DELETE CASCADE, NOT NULL)
*   `uncited_claims` (JSONB, DEFAULT: `'[]'`, NOT NULL) -- Uncited sentences claiming facts
*   `low_similarity_citations` (JSONB, DEFAULT: `'[]'`, NOT NULL) -- Mismatches between claims and citation abstracts
*   `novelty_score` (FLOAT, Nullable) -- Overall novelty rating 0..100
*   `novelty_claims` (JSONB, DEFAULT: `'[]'`, NOT NULL) -- Classification (NOVEL/INCREMENTAL/REDUNDANT)
*   `persona_reviews` (JSONB, DEFAULT: `'[]'`, NOT NULL) -- Individual reviews from voting personas
*   `disagreement_flags` (TEXT[], DEFAULT: `'{}'`, NOT NULL) -- List of criteria names with high persona divergence
*   `red_line_violations` (JSONB, DEFAULT: `'[]'`, NOT NULL) -- Violations caught by the supervisor
*   `human_flag` (BOOLEAN, DEFAULT: `FALSE`, NOT NULL) -- True if evaluation needs instructor audit
*   `overall_percentile` (FLOAT, Nullable) -- Position relative to reference corpus
*   `venue_tier` (TEXT, Nullable) -- Target venue tier categorization
*   `dimension_percentiles` (JSONB, DEFAULT: `'{}'`, NOT NULL) -- Dimension-specific percentile positioning
*   `verified_ratio` (FLOAT, Nullable) -- Ratio of verified references against authoritative APIs
*   `fabricated_refs` (TEXT[], DEFAULT: `'{}'`, NOT NULL) -- List of bibliographic references flagged as fabricated
*   `pipeline_run_id` (UUID, Nullable)
*   `pipeline_duration_ms` (INTEGER, Nullable)
*   `model_versions` (JSONB, DEFAULT: `'{}'`, NOT NULL)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.4.2 `evidence_spans`
Character-level offset boundaries of quotes fuzzy-matched within the submission content.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `evaluation_id` (UUID, NOT NULL) -- References evaluations table
*   `submission_id` (UUID, NOT NULL) -- References submissions table
*   `criterion_id` (UUID, NOT NULL) -- References criteria table
*   `quote` (TEXT, NOT NULL)
*   `start_offset` (INTEGER, Nullable)
*   `end_offset` (INTEGER, Nullable)
*   `verified` (BOOLEAN, DEFAULT: `false`, NOT NULL) -- True if fuzzy match exceeds threshold
*   `match_score` (NUMERIC, Nullable) -- Fuzzy similarity score 0..1
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.4.3 `instructor_corrections`
Dataset of human overrides of AI scores, used as the gold dataset for training calibrator layers.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `evaluation_id` (UUID, NOT NULL)
*   `submission_id` (UUID, NOT NULL)
*   `criterion_id` (UUID, Nullable)
*   `class_id` (UUID, Nullable)
*   `rubric_id` (UUID, Nullable)
*   `ai_score` (NUMERIC, Nullable)
*   `human_score` (NUMERIC, Nullable)
*   `ai_explanation` (TEXT, Nullable)
*   `human_note` (TEXT, Nullable)
*   `delta` (NUMERIC, Nullable) -- Computed difference: `human_score - ai_score`
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.4.4 `rubric_quality_metrics`
Aggregated quality score performance for criteria.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `rubric_id` (UUID, NOT NULL)
*   `criterion_id` (UUID, UNIQUE, NOT NULL)
*   `sample_count` (INTEGER, DEFAULT: `0`, NOT NULL)
*   `avg_score` (NUMERIC, Nullable)
*   `score_variance` (NUMERIC, Nullable)
*   `avg_confidence` (NUMERIC, Nullable)
*   `override_rate` (NUMERIC, Nullable) -- Override frequency by instructors
*   `hallucination_rate` (NUMERIC, Nullable) -- Factual hallucination flag rate
*   `effectiveness` (TEXT, Nullable) -- Overall evaluation utility: `'high'`, `'medium'`, or `'low'`
*   `ai_suggestion` (TEXT, Nullable) -- Suggested revision to the criterion description
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

#### 3.4.5 `student_skill_profile`
Cross-assignment evaluation stats per student per criterion.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `student_id` (UUID, NOT NULL)
*   `criterion_name` (TEXT, NOT NULL)
*   `sample_count` (INTEGER, DEFAULT: `0`, NOT NULL)
*   `avg_score_pct` (NUMERIC, Nullable) -- Normalized percentage score
*   `recent_score_pct` (NUMERIC, Nullable)
*   `trend` (NUMERIC, Nullable) -- Trajectory trend (recent vs historical)
*   `last_evaluated_at` (TIMESTAMP WITH TIME ZONE, Nullable)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   *Constraints:* `UNIQUE(student_id, criterion_name)`

#### 3.4.6 `integrity_signals`
Plagiarism and generative AI likelihood indices for a submission.
*   `id` (UUID, Primary Key, Default: `gen_random_uuid()`)
*   `submission_id` (UUID, UNIQUE, NOT NULL)
*   `ai_text_likelihood` (NUMERIC, Nullable) -- 0..1 probability indicator
*   `burstiness` (NUMERIC, Nullable)
*   `avg_sentence_len` (NUMERIC, Nullable)
*   `sentence_len_stddev` (NUMERIC, Nullable)
*   `max_similarity` (NUMERIC, Nullable) -- Cosine similarity vs peer submissions
*   `most_similar_submission_id` (UUID, Nullable)
*   `notes` (TEXT, Nullable)
*   `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT: `now()`)

---

## 4. Key Workflows & Database Integration

### 4.1 Evaluation Trigger & Webhook Loop

```
                        ┌─────────────────────────────────┐
                        │       Supabase Database         │
                        │   Submissions (INSERT/UPDATE)   │
                        └────────────────┬────────────────┘
                                         │
                                         │ DB Webhook Payload
                                         ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                          FastAPI Backend                               │
   │                                                                        │
   │   ┌────────────────────────────────────────────────────────────────┐   │
   │   │                    /webhook/submission-created                 │   │
   │   │               Validates token & `status == 'pending'`          │   │
   │   └───────────────────────────────┬────────────────────────────────┘   │
   │                                   │                                    │
   │                                   ▼                                    │
   │   ┌────────────────────────────────────────────────────────────────┐   │
   │   │                         job_manager                            │   │
   │   │       Checks active jobs; initializes queued JobStatus         │   │
   │   └───────────────────────────────┬────────────────────────────────┘   │
   │                                   │                                    │
   │                                   ▼                                    │
   │   ┌────────────────────────────────────────────────────────────────┐   │
   │   │                    FastAPI BackgroundTasks                     │   │
   │   │              Triggers Async Worker and Semaphore               │   │
   │   └───────────────────────────────┬────────────────────────────────┘   │
   │                                   │                                    │
   │                                   ▼                                    │
   │   ┌────────────────────────────────────────────────────────────────┐   │
   │   │                        pipeline_worker                         │   │
   │   │         run_text_pipeline / run_pdf_pipeline (Timeout)         │   │
   │   └───────────────────────────────┬────────────────────────────────┘   │
   │                                   │                                    │
   │                                   ▼                                    │
   │   ┌────────────────────────────────────────────────────────────────┐   │
   │   │                        evaluator.py                            │   │
   │   │      Fetches Rubric/Criteria; invokes AI graph; maps results    │   │
   │   └───────────────────────────────┬────────────────────────────────┘   │
   │                                   │                                    │
   │                                   ▼                                    │
   │   ┌────────────────────────────────────────────────────────────────┐   │
   │   │                        supabase_client                         │   │
   │   │       Writes data; Sets submission status to `ai_graded` /     │   │
   │   │                   `flagged` / `needs_review`                   │   │
   │   └────────────────────────────────────────────────────────────────┘   │
   └────────────────────────────────────────────────────────────────────────┘
```

1.  **DB Webhook Request:** When a submission is created via the frontend, Supabase broadcasts an HTTP POST database webhook to the backend `/webhook/submission-created` endpoint.
2.  **API Handler validation:** [evaluate.py](file:///e:/GradioAI/BackEnd/src/routes/evaluate.py) parses the request into a `WebhookPayload` object, checks if the status is `'pending'`, and ensures there is no existing active job processing the `submission_id`.
3.  **Job Initialization:** Calls `job_manager.create_job()`, registers the status as `"queued"`, and spawns an asynchronous background worker task (`run_text_pipeline` or `run_pdf_pipeline`).
4.  **Worker Core:** [pipeline_worker.py](file:///e:/GradioAI/BackEnd/src/workers/pipeline_worker.py) acquires the asyncio concurrency Semaphore and triggers the core evaluator functions.

---

### 4.2 Data Mapping Layer

The mapping layer bridges the database entities and Python models inside the AI pipeline:
*   **Rubric Mapper ([rubric.py](file:///e:/GradioAI/BackEnd/src/mapping/rubric.py)):**
    Fetches raw `criteria` rows from the database and maps them to a `RubricTree` representation:
    *   Sorts criteria based on `sort_order`.
    *   Normalizes the absolute weights to sum up to `1.0` to preserve mathematical convergence during mathematical Z-Score alignment:
        $$\text{Normalized Weight} = \frac{\text{Criterion Weight}}{\sum \text{Weights}}$$
*   **Result Mapper ([result.py](file:///e:/GradioAI/BackEnd/src/mapping/result.py)):**
    Maps the final `PipelineState` object from the AI block to three table payloads:
    *   `evaluations`: Calculates total calibrated score against rubric max thresholds, formats overall strengths and weaknesses text blocks, and writes the baseline metadata.
    *   `criteria_scores`: Correlates the voting persona leaf node scores back to their matching database `criterion_id` keys by positional index.
    *   `evaluation_details`: Unpacks advanced metrics (uncited claims, fabricated references, supervisor flags, and percentiles) into structured JSON formats.

---

### 4.3 Transaction Reliability & Fallback Controls

#### 4.3.1 Concurrency Controls
The [job_manager.py](file:///e:/GradioAI/BackEnd/src/services/job_manager.py) manages concurrent jobs:
*   Uses `asyncio.Semaphore(MAX_CONCURRENT_JOBS)` to queue incoming jobs once the limit is reached.
*   Implements `find_active_job(submission_id)` to check for duplicate requests, avoiding redundant model processing.

#### 4.3.2 Pipeline Timeout Control
Background executions are protected by:
```python
await asyncio.wait_for(
    evaluate_submission(submission_id, job_id),
    timeout=settings.job_timeout_seconds,
)
```
On timeout (default 10 minutes), the job status is set to `'failed'`, and the submission is moved to `'needs_review'` to alert the instructor.

#### 4.3.3 Partial-Write Rollbacks
Writing evaluation outputs requires inserting records across multiple database tables (`evaluations`, `criteria_scores`, `evaluation_details`). If criteria score or detail insertions fail after the parent evaluation row is created:
1.  Catches the database exception.
2.  Triggers `delete_evaluation(eval_id)` in [supabase_client.py](file:///e:/GradioAI/BackEnd/src/services/supabase_client.py), which deletes the criteria scores, evaluation details, and the evaluation row.
3.  Resets the submission status to `'needs_review'` to prevent database corruption.

---

## 5. Security & Authentication

The backend is secured using the following measures:
*   **API Authentication:** Mutating routes require the `X-API-Key` header.
*   **Timing Attack Mitigation:** Key verification uses `secrets.compare_digest(key, settings.api_key)` to prevent timing analysis attacks.
*   **Payload Size Limits:** `POST /evaluate-pdf` checks the incoming file stream length against `_MAX_PDF_BYTES` (50 MB) and raises an `HTTP 413 Payload Too Large` error if the limit is exceeded.
*   **Request Auditing (Correlation ID):** Logs request traces using a unique correlation ID injected into all logs and error responses:
    `%(asctime)s [%(correlation_id)s] %(levelname)s %(name)s: %(message)s`

---

## 6. Testing Strategy

The backend uses **pytest** with **pytest-asyncio** to test route validation, ORM mapping, and evaluator operations:

*   **Route Verification ([test_routes.py](file:///e:/GradioAI/BackEnd/tests/test_routes.py)):**
    Tests API key authentication, route errors, and verify JSON structures conform to Pydantic responses.
*   **Schema Mapping ([test_mapping.py](file:///e:/GradioAI/BackEnd/tests/test_mapping.py)):**
    Tests rubric weight normalization, sorting index offsets, and pipeline state mappings.
*   **Evaluator Integrity ([test_evaluator.py](file:///e:/GradioAI/BackEnd/tests/test_evaluator.py)):**
    Tests error handling paths (e.g. missing rubrics, empty criteria list, pipeline exceptions) and validates the partial-write rollback mechanism.
*   **Mocks Framework ([conftest.py](file:///e:/GradioAI/BackEnd/tests/conftest.py)):**
    Provides a mock Supabase client and job manager instance to test backend workflows without executing database updates or spawning external LLM calls.

*   *Run tests with:*
    ```bash
    cd BackEnd
    pytest
    ```
