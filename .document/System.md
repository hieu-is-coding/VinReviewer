# CHAPTER 3: SYSTEM DESCRIPTION

This chapter presents the detailed system description of GradioAI, an AI-powered academic submission review platform. The system is decomposed into three principal blocks: FrontEnd, BackEnd, and AI (GradingSystem). For each block, the chapter covers the block diagram of the overall system, the design of each block with alternatives considered, the testing strategy employed, and the system implementation details.

---

## 3.1 Block Diagram of the System

GradioAI follows a three-tier architecture in which each block has a clearly defined responsibility and communicates with the others through well-defined interfaces. Figure 3.1 illustrates the high-level block diagram.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GradioAI Platform                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────┐          ┌──────────────────┐                    │
│   │    FrontEnd       │── reads ▶│     Supabase     │◀── writes ──┐     │
│   │  (React 18 SPA)  │          │   (PostgreSQL)   │             │     │
│   └────────┬─────────┘          └────────┬─────────┘             │     │
│            │                             │                        │     │
│            │  triggers evaluation        │  webhook / Realtime    │     │
│            │  (Edge Function)            │  listener              │     │
│            ▼                             ▼                        │     │
│   ┌──────────────────────────────────────────────────────────┐   │     │
│   │                  BackEnd (FastAPI)                         │───┘     │
│   │                                                           │         │
│   │   • Job queue & concurrency control (asyncio Semaphore)  │         │
│   │   • Supabase DB client (async reads + writes)            │         │
│   │   • Rubric mapping  (DB schema → RubricTree)             │         │
│   │   • Result mapping  (PipelineState → DB rows)            │         │
│   │   • File handling   (upload, temp storage, cleanup)      │         │
│   │                                                           │         │
│   │          imports GradingSystem as a Python library         │         │
│   │                          ▼                                │         │
│   │   ┌──────────────────────────────────────────────────┐   │         │
│   │   │           AI Block (GradingSystem)                │   │         │
│   │   │   LangGraph · LLM Agents · NLP · GROBID          │   │         │
│   │   └──────────────────────────────────────────────────┘   │         │
│   └──────────────────────────────────────────────────────────┘         │
│                                                                         │
│   External Services:                                                    │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐         │
│   │  GROBID      │  │  OpenAI API  │  │  Semantic Scholar API │         │
│   │ (PDF parser) │  │  (GPT-4o)    │  │  (literature search)  │         │
│   └─────────────┘  └──────────────┘  └───────────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```
**Figure 3.1** — High-level block diagram of GradioAI

### Data Flow Overview

The end-to-end data flow through the system proceeds as follows:

1. **Submission Upload.** The instructor uploads a student submission (PDF or text) through the FrontEnd. The FrontEnd inserts a row into the Supabase `submissions` table with `status = pending`.

2. **Evaluation Trigger.** The FrontEnd invokes a Supabase Edge Function, which determines the evaluation mode. For simple evaluation, Gemini 2.5 Pro handles the grading directly. For agentic evaluation, the Edge Function proxies the request to the BackEnd's `/evaluate` endpoint.

3. **Job Queuing.** The BackEnd creates a job entry, updates the submission status to `evaluating`, and enqueues the task in its job queue with concurrency control (maximum 5 concurrent jobs via an asyncio Semaphore).

4. **Pipeline Execution.** The BackEnd worker invokes the GradingSystem pipeline (`run_pipeline()`), which executes a multi-phase evaluation: manuscript ingestion, rubric construction, feature extraction, evidence auditing, novelty detection, multi-persona deliberation, supervisor red-line checks, and score calibration.

5. **Result Persistence.** The BackEnd maps the `PipelineState` output from the GradingSystem into Supabase table rows (`evaluations`, `criteria_scores`, `evaluation_details`) and updates the submission status to `ai_graded`, `flagged`, or `needs_review`.

6. **Result Display.** The FrontEnd polls the job status or subscribes to Supabase Realtime and renders the evaluation results, including per-criterion scores, evidence quotes, confidence badges, novelty assessments, and deliberation summaries.

---

## 3.2 Design of Each Block and Selection of the Best Alternative

### 3.2.1 FrontEnd Block

#### Purpose

The FrontEnd block serves as the instructor-facing web application. It provides the user interface for managing classes, students, assignments, rubrics, and submissions, as well as for triggering evaluations and viewing results.

#### Alternative Analysis

| Criterion | React 18 + Vite | Next.js (SSR) | Vue 3 + Nuxt |
|---|---|---|---|
| Rendering model | Client-side SPA | Server-side + client hydration | Client-side SPA / SSR |
| Build speed | Fast (Vite + esbuild) | Moderate (Webpack/Turbopack) | Fast (Vite) |
| Ecosystem maturity | Very large, well-documented | Large, opinionated | Large, flexible |
| Component library support | Extensive (shadcn/ui, MUI, Ant) | Same React libraries | Vuetify, PrimeVue |
| Learning curve | Moderate | Steeper (SSR concepts) | Low to moderate |
| SEO requirement | Not required (instructor tool) | Excellent | Good |
| Supabase integration | Native SDK support | Native SDK support | Community SDK |

**Selected Alternative: React 18 + Vite.** The application is an instructor-only tool that does not require server-side rendering or SEO optimization. React 18 was chosen for its extensive ecosystem, excellent TypeScript support, and the availability of shadcn/ui — a headless component library built on Radix UI primitives that provides accessible, customizable UI components. Vite was selected over Webpack for its significantly faster development builds using esbuild.

#### Detailed Design

The FrontEnd is structured as a single-page application with the following architecture:

**Technology Stack:**
- React 18.3.1 with TypeScript 5.8.3
- Vite 5.4.19 as the build tool
- Tailwind CSS 3.4.17 for utility-first styling
- shadcn/ui (50+ Radix UI-based components) for the component library
- React Query (TanStack Query 5.83) for server state management
- React Router DOM 6.30.1 for client-side routing
- Supabase JS 2.99.2 for database communication
- React Hook Form 7.61.1 + Zod 3.25.76 for form handling and validation
- Recharts 2.15.4 for analytics visualizations

**Page Structure:**

| Page | Route | Functionality |
|---|---|---|
| Dashboard | `/` | Overview of classes, recent activity |
| Classes | `/classes` | Create and manage instructor classes |
| Class Detail | `/classes/:id` | Students, assignments, analytics, AI insights |
| Assignment Detail | `/assignments/:id` | Submissions list, rubric editor, evaluation trigger, settings |
| Analytics | `/analytics` | Cross-class score distributions, AI-generated insights |
| Settings | `/settings` | Application configuration |

**Data Access Layer:**

The FrontEnd employs custom React hooks built on React Query to manage all server state:

- `useData.ts` (~300 LOC): Core CRUD hooks for classes, students, rubrics, submissions, evaluations, and criteria scores. Each mutation automatically invalidates the relevant query cache to ensure UI consistency.
- `useAssignments.ts` (~120 LOC): Assignment-specific lifecycle operations (create, update, delete) with optimistic updates.
- `useAnalytics.ts` (~250 LOC): Aggregation hooks for score distribution analysis, percentile computation, outlier detection, and AI-generated insights via the `useAIInsights()` hook.

**Security Measures:**

- HTML entity escaping via `sanitize.ts` prevents Cross-Site Scripting (XSS) when rendering user-submitted content.
- CSV upload validation enforces file size limits (5 MB), row count limits (500 students), email format validation, and duplicate detection.
- The Supabase publishable (anon) key is the only credential stored client-side; the service role key is never exposed to the browser.

**Supabase Edge Functions:**

Three serverless Edge Functions extend the FrontEnd's capabilities:

| Function | Purpose |
|---|---|
| `evaluate/` | Orchestrates evaluation dispatch — uses Gemini 2.5 Pro for simple mode or proxies to BackEnd for agentic mode |
| `parse-pdf/` | Extracts text from uploaded PDFs using Gemini for preview and bulk upload scenarios |
| `analyze-insights/` | Generates AI-powered textual insights for the analytics dashboard |

---

### 3.2.2 BackEnd Block

#### Purpose

The BackEnd block serves as the orchestration layer that bridges the FrontEnd (Supabase) with the AI pipeline (GradingSystem). It handles job queuing, concurrency control, data mapping between the database schema and the pipeline's data models, and result persistence.

#### Alternative Analysis

| Criterion | FastAPI (Python) | Express.js (Node) | Django REST Framework |
|---|---|---|---|
| Language compatibility with AI | Native Python (same as GradingSystem) | Requires subprocess/IPC for Python ML | Native Python |
| Async support | Native async/await (ASGI) | Native event loop | Limited (Django Channels) |
| Type safety | Pydantic models, auto-validation | Manual or Zod | Django serializers |
| Startup time | Fast | Fast | Slow (ORM boot) |
| API documentation | Auto-generated OpenAPI/Swagger | Manual (Swagger plugin) | Auto-generated |
| ML library import | Direct `import` | Not possible natively | Direct `import` |
| Performance | High (Uvicorn ASGI) | High (V8 engine) | Moderate (WSGI) |

**Selected Alternative: FastAPI.** The primary decision factor was language compatibility — the GradingSystem is a Python library, and FastAPI allows it to be imported and invoked directly as a Python module without the overhead of inter-process communication. FastAPI's native async/await support aligns well with the concurrent job processing requirements, and Pydantic provides automatic request/response validation with type safety.

#### Detailed Design

**Technology Stack:**
- Python 3.11+
- FastAPI ≥0.111 with Uvicorn ≥0.30 (ASGI server)
- Supabase-py ≥2.0 for database operations
- Pydantic Settings ≥2.0 for configuration management
- aiofiles ≥23.2 for asynchronous file I/O

**API Endpoints:**

| Method | Path | Authentication | Description |
|---|---|---|---|
| `POST` | `/evaluate` | `X-API-Key` | Queues a text-based submission for agentic evaluation |
| `POST` | `/evaluate-pdf` | `X-API-Key` | Accepts a PDF upload, queues GROBID parsing + pipeline |
| `GET` | `/jobs/{job_id}` | None | Polls job status and retrieves results |
| `POST` | `/webhook/submission-created` | `X-API-Key` | Receives Supabase database webhook on new submission INSERT |
| `GET` | `/health` | None | Readiness probe — checks GROBID, Supabase, and model load status |

**Core Services:**

1. **Evaluator Service** (`evaluator.py`, 171 LOC): The central orchestrator that:
   - Fetches submission data and associated rubric/criteria from Supabase
   - Writes submission content to a temporary file for pipeline ingestion
   - Invokes `run_pipeline()` from the GradingSystem
   - Maps pipeline results to database rows via the mapping layer
   - Implements rollback on partial write failure (deletes evaluation if criteria score insertion fails)

2. **Job Manager** (`job_manager.py`, 67 LOC): An in-memory job queue that:
   - Creates job entries with UUID identifiers
   - Tracks job lifecycle: `queued → running → complete | failed`
   - Provides idempotency checks via `find_active_job()` to prevent duplicate processing of the same submission
   - Enforces concurrency limits using `asyncio.Semaphore(MAX_CONCURRENT_JOBS)` (default: 5)

3. **Supabase Client** (`supabase_client.py`, 77 LOC): An async wrapper providing:
   - `fetch_submission()` — reads submission with nested assignment and rubric data
   - `fetch_criteria()` — reads criteria for a given rubric
   - `insert_evaluation()`, `insert_criteria_scores()`, `insert_evaluation_details()` — writes results
   - `delete_evaluation()` — rollback support
   - `update_submission_status()` — transitions submission through the status flow

**Mapping Layer:**

The mapping layer translates between the database schema and the GradingSystem's Pydantic models:

- **Rubric Mapper** (`rubric.py`): Converts Supabase `criteria[]` rows into a weighted `RubricTree` structure that the pipeline expects, normalizing weights so that sibling nodes sum to 1.0.
- **Result Mapper** (`result.py`): Converts the `PipelineState` output into three database representations:
  - `evaluations` table row (total score, feedback sections, confidence)
  - `criteria_scores` rows (per-criterion scores, evidence, hallucination flags)
  - `evaluation_details` row (novelty score, persona reviews, red-line violations, percentile)

**Middleware and Cross-Cutting Concerns:**

- **CORS Middleware**: Configured with permissive origins for development.
- **Correlation ID Middleware**: Injects `X-Correlation-ID` into all log entries for distributed tracing.
- **Error Handler**: Catches custom `AppError` exceptions and returns structured JSON responses with error codes and request IDs.
- **Lifespan Handler**: Preloads the sentence-transformers `all-mpnet-base-v2` model on startup to avoid cold-start latency during the first evaluation.

**Security:**

- API key authentication uses `secrets.compare_digest` for timing-safe comparison to prevent timing attacks.
- Uploaded PDFs are streamed to temporary files and deleted immediately after pipeline completion.
- The Supabase service role key is stored server-side only and never transmitted to clients.

---

### 3.2.3 AI Block (GradingSystem)

#### Purpose

The AI block is the core intelligence of GradioAI. It is a multi-agent diagnostic pipeline that evaluates academic manuscripts by combining deterministic linguistic feature extraction, literature-grounded evidence checking, and rubric-driven LLM synthesis under red-line supervision.

#### Alternative Analysis

| Criterion | LangGraph Multi-Agent | Single LLM Prompt | AutoGen Framework |
|---|---|---|---|
| Pipeline control | Explicit state machine with conditional edges | No control, single pass | Implicit agent chat |
| Reproducibility | High (deterministic phases + controlled LLM calls) | Low (single monolithic prompt) | Moderate |
| Debuggability | Per-phase state inspection | Opaque | Agent conversation logs |
| Feature integration | Native (features injected into state) | Prompt-stuffing only | Custom tool use |
| Feedback loops | Built-in (supervisor → regen) | Not possible | Ad-hoc |
| Error recovery | Per-node error gating | All-or-nothing | Per-agent retry |
| Scalability | Parallel node execution | Sequential | Sequential agent turns |

**Selected Alternative: LangGraph Multi-Agent Pipeline.** LangGraph was chosen because it provides explicit state machine orchestration with typed state objects, enabling parallel execution of independent phases, conditional branching (e.g., supervisor feedback loops), and per-node error isolation. A single LLM prompt approach was rejected because it cannot incorporate deterministic linguistic features, enforce red-line rules, or provide per-phase debuggability. AutoGen was considered but rejected due to its implicit conversation-based control flow, which makes it difficult to guarantee rubric coverage and reproducibility.

#### Detailed Design

**Technology Stack:**
- LangGraph ≥0.2 for state machine orchestration
- LangChain ≥0.3 as the agent framework
- OpenAI ≥1.12 (GPT-4o-mini as the default LLM, configurable)
- Sentence-Transformers ≥3.0 (`all-mpnet-base-v2` for embeddings)
- spaCy ≥3.7 (`en_core_web_sm`) for NLP tokenization
- GROBID 0.8.1 for PDF-to-structured-text parsing
- Language-Tool-Python ≥2.8 for grammar checking
- LexicalRichness ≥0.5 for lexical diversity metrics
- Semantic Scholar API for literature retrieval

**Pipeline Architecture:**

The GradingSystem pipeline is implemented as a LangGraph state machine (`graph.py`, 422 LOC) with the following phases:

```
Phase 0   Ingest              PDF/DOCX → Manuscript model (GROBID + language detection)
                               ↓
Phase 1a  Rubric Construction  Build venue-aware RubricTree from assignment prompt  ┐
Phase 1b  Literature Retrieval Fetch related papers from Semantic Scholar           │ parallel
Phase 1c  Feature Extraction   Compute linguistic features in parallel              ┘
                               ↓
Phase 2b  Reference Validation Verify references via ThreadPoolExecutor
                               ↓
Phase 3   Evidence Audit       Claim → citation similarity scoring (AgentCritic)
Phase 3b  Novelty Assessment   NOVEL / INCREMENTAL / REDUNDANT classification
                               ↓
Phase 4a  Deliberation         3 reviewer personas vote on criteria verdicts
Phase 4b  Supervisor           Red-line enforcement (R1–R7); regen or human flag
                               ↓
Phase 5   Calibration          Monotone affine correction + percentile positioning
```

**Phase 0 — Manuscript Ingestion:**

The ingestion phase detects the document format and extracts structured text:
- **PDF Processing**: GROBID parses the PDF into TEI/XML format, extracting headers, sections, inline citations, and bibliography. A two-pass approach is used: Pass 1 (lightweight) extracts core text for language detection; Pass 2 (structured) performs full GROBID parsing.
- **DOCX Processing**: `python-docx` extracts sections, paragraphs, and inline text.
- **Output**: A `Manuscript` Pydantic model containing title, abstract, word count, section-by-section body text, references, and inline citations.

**Phase 1 — Context Foundations (Parallel Execution):**

Three independent tasks execute in parallel:

- **Phase 1a — Rubric Tree Personalization** (`AgentObjective`): An LLM customizes a base rubric tree from `rubric_dimensions.yaml` to emphasize elements highlighted in the specific assignment prompt. Weight conservation (siblings sum to 1.0) and maximum depth (3 levels) are enforced as structural constraints.

- **Phase 1b — Literature Retrieval** (`AgentRetrieval`): The LLM generates 3–5 search queries from the manuscript's title, abstract, and assignment prompt. These queries are sent to the Semantic Scholar API in parallel. Results are reranked using SPECTER2 semantic similarity embeddings, keeping the top 30 most relevant papers as the `LitPool`.

- **Phase 1c — Feature Extraction** (`router.py`): Five linguistic feature domains are extracted in parallel:

| Domain | Features Computed | Implementation |
|---|---|---|
| Cohesion | Adjacent sentence overlaps (Jaccard), paragraph overlaps, LSA semantic coherence | `cohesion.py` |
| Style | Mean dependency distance, sentence length statistics, subordination ratio | `style.py` |
| Diversity | MTLD, HD-D, Maas, Yule's K lexical richness indices | `diversity.py` |
| Mechanics | Grammar, spelling, punctuation error counts and density per 100 words | `mechanics.py` |
| Citations | Total count, density, unique sources, self-citation ratio, recency | `citations.py` |

Raw features are Z-score normalized against reference baselines and clipped to [−3.0, +3.0]:

$$Z = \text{clip}\left(\frac{\text{raw} - \mu}{\sigma},\ -3.0,\ 3.0\right)$$

**Phase 2 — Reference Validation:**

The reference validation phase verifies all extracted bibliographic references against external authority databases (Crossref and OpenAlex) to detect hallucinated or fabricated citations.
- **Parallel Verification**: Verification tasks are executed concurrently using a `ThreadPoolExecutor` with a pool size of 5 workers (`max_workers = 5`).
- **Rate Limiting**: To prevent rate-limit blocks from external APIs, cross-thread rate limiting enforces a configurable delay (default: 0.5 seconds) between API requests using a thread lock.
- **Verification Strategy**:
  1. *Direct DOI Verification*: If a reference contains a DOI, it is queried directly via Crossref. The fetched title is compared with the reference title using a normalized similarity metric (Gestalt pattern matching). A similarity $\geq 0.70$ marks the reference as `verified`; otherwise, it is flagged as `suspicious`.
  2. *Crossref Title Search*: If no DOI is present, a title-based search is executed on Crossref. A similarity $\geq 0.85$ marks it as `verified`, while a similarity in $[0.65, 0.85)$ marks it as `likely_valid`.
  3. *OpenAlex Fallback*: If Crossref search returns no matching records, the system queries the OpenAlex API using the same similarity thresholds.
  4. *Fabrication/Suspicion Classification*: References failing all search strategies are classified as `suspicious` (unverifiable text) or `fabricated` (completely empty title and DOI fields).
- **Output**: A `ReferenceValidation` model containing individual check status, matched DOIs, confidence scores, and the overall verified ratio.

**Phase 3 — Evidence Audit** (`AgentCritic`):

The critic agent audits the validity of inline assertions:
1. Segments the manuscript into sentence-level claim spans.
2. Encodes all claims and reference abstracts into semantic vectors using `all-mpnet-base-v2`.
3. Computes cosine similarity between claims and references.
4. Flags low-similarity citations (similarity < 0.3) and uncited substantive claims (> 8 words, no citation, similarity < 0.3).
5. Classifies claims into three types via LLM: `SYNTHESIS` (integrates multiple sources), `SUMMARY` (restates a single source), or `UNSUPPORTED` (assertion without citation support).

**Phase 3b — Novelty Assessment:**

Compares the manuscript's contributions against the literature pool to classify each contribution as `NOVEL`, `INCREMENTAL`, or `REDUNDANT`, producing an overall novelty score.

**Phase 4a — Multi-Persona Deliberation:**

Three LLM-driven reviewer personas independently evaluate the manuscript:
- **Methodology Reviewer**: Focuses on research design, statistical validity, and methodological rigor.
- **Domain Expert Reviewer**: Evaluates subject matter accuracy, contribution significance, and field positioning.
- **Communication Reviewer**: Assesses clarity, organization, audience appropriateness, and writing quality.

Each persona votes on every rubric criterion. Final verdicts are determined by majority voting, with disagreement flags raised for criteria where personas diverge significantly.

**Phase 4b — Supervisor Red-Line Enforcement** (`AgentSupervisor`):

The supervisor enforces seven quality rules:

| Rule | Type | Description |
|---|---|---|
| R1 | HARD | No hallucinated citations — every cited reference must exist in the bibliography or literature pool |
| R2 | HARD | Full rubric coverage — every leaf node in the rubric must have a corresponding score |
| R3 | HARD | No contradictory formatting advice — suggestions must not conflict with assignment formatting requirements |
| R4 | SOFT | Score within calibrated bounds — score should fall within ±2σ of the calibration interval |
| R5 | SOFT | Citation style consistency — suggestions must not advise switching citation formats |
| R6 | HARD | No fabricated references — generated references must be verifiable |
| R7 | HARD | Disagreement resolved — significant persona disagreements must be addressed |

If a HARD violation is detected and the regeneration attempt count is ≤ 1, the pipeline loops back to Phase 4a to regenerate the review with violation feedback injected. If violations persist after regeneration, a `human_flag` is set, indicating that the evaluation requires human review.

**Phase 5 — Calibration:**

The calibrator applies a monotone affine transformation fitted via ordinary least-squares (OLS) against historical human scores:

$$\text{Calibrated Score} = \text{slope} \times \text{Raw Score} + \text{intercept}$$

Monotonicity is enforced ($\text{slope} \geq 0.01$). Comparative positioning computes the manuscript's percentile rank relative to the reference corpus and target venue.

**Shared Modules:**

| Module | Purpose |
|---|---|
| `llm.py` | Centralized `get_llm()` factory + `invoke_llm()` retry wrapper with tenacity (exponential backoff: 2s → 30s, max 3 attempts) |
| `model_cache.py` | Thread-safe singleton cache for sentence-transformers embeddings |
| `prompts.py` | `load_prompt(name)` loads prompt templates from `prompts/*.txt` with LRU caching |
| `config.py` | YAML configuration loaders for rubric dimensions, red-line rules, feature subsets, and venue profiles |

---

## 3.3 Testing of Each Block

### 3.3.1 FrontEnd Testing

The FrontEnd employs a two-layer testing strategy:

**Unit Testing (Vitest 3.2.4):**
- Tests individual React components, hooks, and utility functions in isolation.
- Uses `@testing-library/react` for component rendering and user interaction simulation.
- Analytics utility functions (`analytics.ts`) are tested for correct distribution calculation, percentile computation, and outlier detection.
- Sanitization functions (`sanitize.ts`) are tested to verify proper HTML entity escaping against XSS attack vectors.

**End-to-End Testing (Playwright 1.57):**
- Tests complete user workflows: class creation, student enrollment, assignment creation with rubric, submission upload, evaluation trigger, and result display.
- Runs in real browser environments (Chromium, Firefox, WebKit) to verify cross-browser compatibility.
- Validates the submission status flow from `pending` through `evaluating` to `ai_graded` in the UI.

**Execution:**
```bash
cd FrontEnd
bun test          # Run Vitest unit tests
bun playwright    # Run Playwright E2E tests
```

### 3.3.2 BackEnd Testing

The BackEnd uses pytest with pytest-asyncio for async-aware testing. Tests are organized into three categories:

**Route Tests** (`test_routes.py`):
- Verifies that all mutating endpoints require `X-API-Key` authentication and return `403 Forbidden` without it.
- Validates response shapes conform to Pydantic models (`EvaluateResponse`, `JobStatusResponse`, `WebhookResponse`).
- Tests the `/health` endpoint returns readiness status for all dependencies.

**Mapping Tests** (`test_mapping.py`):
- Verifies rubric weight normalization ensures sibling weights sum to 1.0.
- Tests correct criteria ordering by `sort_order`.
- Validates that the result mapper correctly transforms `PipelineState` fields into database-compatible rows.

**Evaluator Tests** (`test_evaluator.py`):
- Tests error handling paths: missing rubric, empty criteria list, pipeline exceptions.
- Verifies rollback behavior when criteria score insertion fails after a successful evaluation insertion.
- Validates submission status transitions through the evaluation lifecycle.

**Fixtures** (`conftest.py`):
- Provides mocked Supabase client and job manager instances to enable isolated testing without external dependencies.

**Execution:**
```bash
cd BackEnd
pytest
```

### 3.3.3 AI Block (GradingSystem) Testing

The GradingSystem has the most extensive test suite with 25 test files covering every pipeline phase:

| Test File | Coverage Area |
|---|---|
| `test_calibration.py` | Score calibration logic, monotonicity enforcement, boundary intervals |
| `test_citations.py` | Citation extraction, density calculation, recency computation |
| `test_cohesion.py` | Discourse coherence metrics, Jaccard overlap, LSA similarity |
| `test_diversity.py` | MTLD, HD-D, Maas, Yule's K lexical richness indices |
| `test_mechanics.py` | Grammar error detection, spelling, punctuation, error density |
| `test_references.py` | Reference validation against Semantic Scholar |
| `test_deliberation.py` | Multi-persona voting, disagreement detection, verdict merging |
| `test_novelty.py` | Contribution classification (NOVEL/INCREMENTAL/REDUNDANT) |
| `test_supervisor.py` | Red-line rule enforcement (R1–R7), regeneration triggering |
| `test_comparative.py` | Percentile positioning against reference corpus |
| `test_perturbation.py` | Score confidence estimation via perturbation analysis |
| `test_grobid_parser.py` | GROBID client integration, TEI/XML parsing |
| `test_normalize.py` | Z-score normalization, clipping bounds |
| `test_language.py` | Language detection accuracy |
| `test_output.py` | Markdown and JSON output rendering |

**Testing Strategy:**
- **Unit tests** verify individual feature extractors and agents in isolation with fixed input data.
- **Integration tests** exercise the full pipeline end-to-end with sample manuscripts.
- **Error path tests** verify graceful degradation: missing manuscript files, GROBID unavailability, LLM API failures, and malformed inputs.

**Execution:**
```bash
cd GradingSystem
pytest
```

---

## 3.4 System Implementation

### 3.4.1 Development Environment and Tools

| Tool | Purpose |
|---|---|
| Node.js 18+ / Bun 1.x | FrontEnd runtime and package manager |
| Python 3.11+ | BackEnd and GradingSystem runtime |
| Docker | Containerization for GROBID and BackEnd services |
| Supabase CLI | Database migration management and Edge Function deployment |
| Git | Version control |

### 3.4.2 Database Implementation

The database is implemented using Supabase (hosted PostgreSQL) with the following core tables:

| Table | Description |
|---|---|
| `classes` | Instructor classes with name and description |
| `students` | Student roster with name and email |
| `class_students` | Many-to-many junction between classes and students |
| `rubrics` | Named rubrics attached to classes |
| `criteria` | Rubric criteria with `weight`, `max_score`, and `sort_order` |
| `assignments` | Assignments with rubric FK, `submission_type`, `target_venue`, `use_agentic_evaluation` |
| `submissions` | Student submissions with `content`, `status`, `rubric_id` |
| `evaluations` | Evaluation results — scores, feedback sections, confidence, `evaluation_type` |
| `criteria_scores` | Per-criterion scores with evidence quotes and hallucination flags |
| `evidence_spans` | Character-level evidence quote spans with match scores |
| `evaluation_details` | Rich agentic output (novelty, deliberation, red-lines, comparative percentile) |

The schema is managed through 5 Supabase migration files that handle table creation, Row-Level Security (RLS) policies, and timestamp trigger functions.

**Submission Status Flow:**

The submission lifecycle follows a defined state machine:

```
pending → evaluating → ai_graded       (successful evaluation)
                     → needs_review    (low confidence or hallucinated evidence detected)
                     → flagged         (supervisor raised human_flag)
                     → approved        (instructor manual sign-off)
```

### 3.4.3 Evaluation Modes

The system supports two evaluation modes to balance speed and depth:

| Mode | Trigger Condition | Evaluator | Output |
|---|---|---|---|
| **Simple** | `use_agentic_evaluation = false` | Gemini 2.5 Pro via Supabase Edge Function | Rubric scores + evidence verification |
| **Agentic** | `use_agentic_evaluation = true` or `submission_type = research_paper` | Full GradingSystem pipeline via BackEnd | All of simple mode + novelty assessment, multi-persona deliberation, red-line violations, comparative percentile, `evaluation_details` |

The Edge Function automatically proxies to the BackEnd when `BACKEND_URL` and `BACKEND_API_KEY` environment variables are configured and the assignment is set for agentic evaluation.

### 3.4.4 Deployment Architecture

The system is containerized using Docker Compose with two services:

```yaml
services:
  grobid:
    image: lfoppiano/grobid:0.8.1
    ports: [8070:8070]
    healthcheck: /api/isalive

  backend:
    build: BackEnd/Dockerfile
    ports: [8000:8000]
    depends_on: grobid (healthy)
    memory: 4GB
```

The BackEnd Dockerfile uses `python:3.11-slim` as the base image. It installs system dependencies (build-essential, JRE for Language-Tool), installs the GradingSystem as a Python package (with its ML dependencies), and pre-downloads the `all-mpnet-base-v2` sentence-transformer model at build time to eliminate cold-start latency.

**Production Deployment Options:**

| Platform | Notes |
|---|---|
| Docker Compose | Single-host deployment for development and small-scale use |
| Railway / Render | Managed platform deployment with environment variable configuration via dashboard |
| AWS ECS / GCP Cloud Run | Scalable container deployment with optional GPU support |
| Supabase Edge Functions | FrontEnd serverless functions deployed via `supabase functions deploy` |

For production environments, `MAX_CONCURRENT_JOBS` should be tuned based on available memory (sentence-transformers requires approximately 1 GB per instance), and a Redis-backed job queue via `REDIS_URL` is recommended for persistence and scalability.

### 3.4.5 Security Implementation

The system implements defense-in-depth security across all blocks:

| Security Measure | Block | Implementation |
|---|---|---|
| API key authentication | BackEnd | `X-API-Key` header with `secrets.compare_digest` (timing-safe comparison) |
| XSS prevention | FrontEnd | HTML entity escaping via `sanitize.ts` before rendering user content |
| Input validation | FrontEnd | CSV file size (5 MB), row count (500), email format, duplicate checks |
| Upload limits | BackEnd | Maximum PDF size: 50 MB; maximum concurrent jobs: 5 |
| Temporary file cleanup | BackEnd | PDFs streamed to temp files and deleted after pipeline completion |
| Secret management | All | Supabase service role key held server-side only; publishable key for client |
| Request tracing | BackEnd | Correlation ID (`X-Correlation-ID`) injected into all log entries |
| Row-Level Security | Database | Supabase RLS policies on all tables |

### 3.4.6 Configuration Management

The system uses environment variables for deployment-specific configuration:

**BackEnd Configuration** (via Pydantic Settings):

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | — | Supabase service role key |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for LLM agents |
| `API_KEY` | Yes | — | Shared secret for `X-API-Key` header |
| `GROBID_URL` | No | `http://localhost:8070` | GROBID service URL |
| `SEMANTIC_SCHOLAR_API_KEY` | No | — | Semantic Scholar API key |
| `MAX_CONCURRENT_JOBS` | No | `5` | Maximum concurrent pipeline jobs |
| `JOB_TIMEOUT_SECONDS` | No | `600` | Pipeline job timeout in seconds |

**GradingSystem Configuration** (via YAML files):

| Config File | Purpose |
|---|---|
| `rubric_dimensions.yaml` | Base rubric dimension definitions and maximum scores |
| `red_lines.yaml` | Red-line rule definitions (R1–R7) with severity levels |
| `feature_subset.yaml` | Feature weights and normalization thresholds |
| `venues.yaml` | Venue-specific scoring adjustments (e.g., NeurIPS, ACL) |
