# VinReviewer BackEnd

FastAPI orchestration service that bridges the FrontEnd (Supabase) and GradingSystem pipeline.

> Python 3.11 + FastAPI + Uvicorn + supabase-py + pydantic-settings

---

## Quick Start

```bash
pip install -e ".[dev]"
pip install -e ../GradingSystem    # Link GradingSystem as a local dependency

# Start GROBID (required for PDF parsing)
docker run -p 8070:8070 lfoppiano/grobid:0.8.1

# Run the server
cp .env.example .env               # Fill in required variables
uvicorn src.main:app --reload --port 8000
```

---

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Readiness check — GROBID + Supabase + model load | No |
| `POST` | `/evaluate` | Queue text submission for agentic pipeline | `X-API-Key` |
| `POST` | `/evaluate-pdf` | Accept PDF upload, queue GROBID + pipeline | `X-API-Key` |
| `GET` | `/jobs/{job_id}` | Poll job status and result | `X-API-Key` |
| `POST` | `/webhook/submission-created` | Supabase DB webhook on new submission INSERT | `X-API-Key` |

All mutating endpoints require the `X-API-Key` header. Keys are compared with `secrets.compare_digest` to prevent timing attacks.

---

## Source Layout

```
src/
├── main.py                 FastAPI app + lifespan + correlation ID middleware
├── config.py               Pydantic Settings (reads .env)
├── exceptions.py           Custom exception hierarchy
├── routes/
│   ├── evaluate.py         /evaluate, /webhook, /jobs — with idempotency checks
│   ├── pdf.py              /evaluate-pdf — with idempotency checks
│   └── health.py           /health
├── services/
│   ├── evaluator.py        Unified evaluator with rollback on partial write failure
│   ├── job_manager.py      In-memory job queue + asyncio semaphore + find_active_job()
│   └── supabase_client.py  Async Supabase wrapper + delete_evaluation() for rollback
├── models/
│   └── responses.py        Typed Pydantic response models
├── mapping/
│   ├── rubric.py           criteria[] -> RubricTree
│   └── result.py           PipelineState -> evaluations / criteria_scores / evaluation_details
└── workers/
    └── pipeline_worker.py  Semaphore-gated background task runner with timeout enforcement

tests/
├── conftest.py             Shared fixtures
├── test_routes.py          Route authentication and response shapes
├── test_mapping.py         Rubric weight normalisation and ordering
└── test_evaluator.py       Evaluator error paths (missing rubric, empty criteria, pipeline errors)
```

---

## Exception Hierarchy

All exceptions extend `AppError` and are caught by a global FastAPI handler that returns structured JSON with `error_code`, `detail`, and `request_id` (correlation ID).

| Exception | Status | When |
|-----------|--------|------|
| `AppError` | 500 | Base class |
| `ValidationError` | 422 | Missing rubric, empty criteria, bad input |
| `PipelineError` | 502 | GradingSystem pipeline failure |
| `SupabaseError` | 503 | Database read/write failure |
| `JobNotFoundError` | 404 | Unknown job ID |
| `AuthenticationError` | 401 | Invalid or missing API key |

---

## Response Models

All endpoints use typed Pydantic response models (`src/models/responses.py`):

| Model | Used by |
|-------|---------|
| `EvaluateResponse` | `POST /evaluate` |
| `WebhookResponse` | `POST /webhook/submission-created` |
| `JobStatusResponse` | `GET /jobs/{job_id}` |
| `HealthResponse` | `GET /health` |

---

## Reliability Features

### Unified Evaluator

`evaluate_submission()` and `evaluate_pdf_submission()` both delegate to a shared `_evaluate_core()` function, eliminating ~75% code duplication. The core function handles: fetch data, validate, run pipeline, write results.

### Idempotency

All evaluation routes check `job_manager.find_active_job(submission_id)` before creating a new job. If an active job already exists for the submission, the existing job is returned instead of creating a duplicate.

### Timeout Enforcement

Pipeline execution is wrapped in `asyncio.wait_for(coro, timeout=settings.job_timeout_seconds)`. On timeout, the job is marked `"failed"` and the submission is set to `"needs_review"`.

### Rollback on Partial Write Failure

If `insert_criteria_scores` or `insert_evaluation_details` fails after `insert_evaluation` succeeds, `delete_evaluation(eval_id)` is called to clean up the partial write — preventing orphaned database rows.

### Correlation ID Middleware

Every HTTP request is assigned a UUID correlation ID (or uses the incoming `X-Correlation-ID` header). The ID propagates through `contextvars.ContextVar` and appears in every log line and error response, enabling end-to-end request tracing.

### Structured Logging

Log format: `%(asctime)s [%(correlation_id)s] %(levelname)s %(name)s: %(message)s`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | — | Supabase service role key |
| `OPENAI_API_KEY` | Yes | — | OpenAI key for LLM agents |
| `API_KEY` | Yes | — | Shared secret for `X-API-Key` header |
| `GROBID_URL` | No | `http://localhost:8070` | GROBID service URL |
| `SEMANTIC_SCHOLAR_API_KEY` | No | `""` | For literature retrieval |
| `MAX_CONCURRENT_JOBS` | No | `5` | Max parallel pipeline executions |
| `JOB_TIMEOUT_SECONDS` | No | `600` | Pipeline timeout in seconds |
| `REDIS_URL` | No | `None` | Optional Redis for production job queue |

---

## Testing

```bash
pytest
```

Tests cover:
- Route authentication and response shapes (`test_routes.py`)
- Rubric weight normalisation and ordering (`test_mapping.py`)
- Evaluator error paths — missing rubric, empty criteria, pipeline errors (`test_evaluator.py`)

---

## Deployment

| Platform | Notes |
|----------|-------|
| **Docker Compose** | Use `docker compose up --build` from the VinReviewer root |
| **Railway / Render** | Push `BackEnd/` service; add env vars in dashboard |
| **AWS ECS / GCP Cloud Run** | Use the `BackEnd/Dockerfile`; mount or install GradingSystem at build time |

Set `MAX_CONCURRENT_JOBS` based on available memory (sentence-transformers requires ~1 GB per instance). For production, consider adding a Redis-backed job queue via `REDIS_URL`.
