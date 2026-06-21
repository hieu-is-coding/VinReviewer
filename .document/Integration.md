# VinReviewer FrontEnd & BackEnd Integration specifications

This document outlines the architecture, communication interfaces, database synchronizations, and execution pathways that link the VinReviewer React FrontEnd and FastAPI BackEnd applications.

---

## 1. Overview of the Integration Architecture

VinReviewer utilizes an **indirect, database-centric integration model** supplemented by **serverless Edge Functions** acting as smart API gateways. 

```
┌─────────────────────────────────────────────────────────────────────────┐
│                               VinReviewer                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────┐          ┌──────────────────┐                    │
│   │    FrontEnd       │── reads ▶│   Supabase DB    │◀── writes ──┐     │
│   │  (React 18 SPA)  │          │   (PostgreSQL)   │             │     │
│   └────────┬─────────┘          └────────┬─────────┘             │     │
│            │                             │                        │     │
│            │ HTTP POST                   │ Submissions Webhook    │     │
│            ▼                             ▼                        │     │
│   ┌──────────────────┐          ┌──────────────────┐              │     │
│   │  Edge Function   │─────────▶│    FastAPI       │──────────────┘     │
│   │    (evaluate)    │  Proxy   │    BackEnd       │                    │
│   └──────────────────┘          └──────────────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

1.  **Shared State Layer (PostgreSQL):** The primary communication channel is the Supabase database. The FrontEnd inserts submissions and configurations into PostgreSQL, and the BackEnd processes and writes structured AI evaluations back to the database.
2.  **API Gateway Layer (Supabase Edge Functions):** Instead of making direct REST calls from the client browser to the FastAPI backend port, the FrontEnd invokes serverless Deno Edge Functions hosted on Supabase.
3.  **Thin Proxy Redirection:** When an advanced or agentic evaluation is requested, the `/evaluate` Edge Function acts as a thin proxy, forwarding requests to the FastAPI backend using secure server-side API keys.

---

## 2. Key Communication Flows

### 2.1 Evaluation Trigger Flow

The diagram below details the sequence of events when an instructor triggers a submission evaluation:

```
FrontEnd            Edge Function          Supabase DB            BackEnd
   │                      │                     │                    │
   │ 1. mutate()          │                     │                    │
   ├─────────────────────▶│                     │                    │
   │                      │ 2. Read Config      │                    │
   │                      ├────────────────────▶│                    │
   │                      │ 3. Check Mode       │                    │
   │                      │    (use_agentic?)   │                    │
   │                      │                     │                    │
   │                      │───[ Agentic Mode ]──────────────────────▶│
   │                      │                                          │ 4. Queue job & status
   │                      │                                          │    "evaluating"
   │                      │                                          ├─────────────┐
   │                      │                                          │             │
   │                      │                                          │◀────────────┘
   │                      │ 5. Job JSON (Queued)                     │
   │                      │◀─────────────────────────────────────────┤
   │ 6. Update UI Status  │                     │                    │
   │◀─────────────────────┤                     │                    │
   │                      │                     │                    │
   │                      │                     │ 6a. Execute graph  │
   │                      │                     │     in thread      │
   │                      │                     │     (async)        │
   │                      │                     │                    │
   │                      │                     │ 7. Write results   │
   │                      │                     │    (evaluations,   │
   │                      │                     │     details, etc)  │
   │                      │                     │◀───────────────────┤
   │                      │                     │                    │
   │                      │                     │ 8. Update status   │
   │                      │                     │    "ai_graded"     │
   │                      │                     │◀───────────────────┤
   │                      │                     │                    │
   │ 9. Refetch queries   │                     │                    │
   ├───────────────────────────────────────────▶│                    │
```

#### Step 1: Frontend Dispatch
The instructor clicks "Evaluate" on a submission in [AssignmentDetailPage.tsx](file:///e:/VinReviewer/FrontEnd/src/pages/AssignmentDetailPage.tsx). This executes the `useEvaluateSubmission` mutation inside [useData.ts](file:///e:/VinReviewer/FrontEnd/src/hooks/useData.ts):
```typescript
const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  },
  body: JSON.stringify({ submission_id }),
});
```

#### Step 2: Edge Function Verification
The serverless Edge Function [evaluate/index.ts](file:///e:/VinReviewer/FrontEnd/supabase/functions/evaluate/index.ts) receives the request, sets the submission's status to `'evaluating'` to prevent concurrent triggers, and evaluates the dispatch mode:
*   Queries the `submissions` table to get the related `assignment_id` and checks the assignment's configuration (`use_agentic_evaluation` and `submission_type`).
*   **Simple Mode:** If agentic evaluation is disabled, the Edge Function processes the grading locally using `google/gemini-2.5-pro` via the Lovable AI gateway, performs fuzzy evidence quote verification, and writes directly to the `evaluations` and `criteria_scores` tables.
*   **Agentic Mode:** If agentic evaluation is enabled, the Edge Function redirects the payload to the BackEnd:
    ```typescript
    const backendResp = await fetch(`${BACKEND_URL}/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BACKEND_API_KEY,
      },
      body: JSON.stringify({ submission_id, use_agentic: true }),
    });
    ```

#### Step 3: Backend Job Initialization & Queueing
The FastAPI backend receives the request on the `/evaluate` endpoint defined in [evaluate.py](file:///e:/VinReviewer/BackEnd/src/routes/evaluate.py). It registers a new task with the [job_manager.py](file:///e:/VinReviewer/BackEnd/src/services/job_manager.py) and launches the task asynchronously using FastAPI's `BackgroundTasks` wrapper. The backend immediately returns a `202 Accepted` response containing:
```json
{
  "job_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "queued",
  "submission_id": "77a83d47-66a9-4678-83bb-bd8bc77da966"
}
```
This fast response prevents HTTP timeout errors in both Deno Deploy and the client browser.

#### Step 4: UI Refetch & Progress Monitoring
Upon receiving the successful HTTP response, the FrontEnd's `useEvaluateSubmission` mutation triggers TanStack Query cache invalidations:
```typescript
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ["submissions"] });
  qc.invalidateQueries({ queryKey: ["evaluations"] });
  qc.invalidateQueries({ queryKey: ["assignment_submissions"] });
}
```
This forces the FrontEnd to refetch the submission list. The submission row displays an `'evaluating'` status badge with an animated loading spinner.

#### Step 5: Backend Execution & Database Writeback
The backend worker [pipeline_worker.py](file:///e:/VinReviewer/BackEnd/src/workers/pipeline_worker.py) executes the LangGraph `GradingSystem` pipeline:
*   Retrieves the submission text and rubric criteria from Supabase.
*   Runs the multi-agent grading, novelty checking, and supervisor validations.
*   Maps and inserts the results to `evaluations`, `criteria_scores`, and `evaluation_details`.
*   Updates the `submissions.status` to `'ai_graded'`, `'flagged'` (if supervisor caught violation errors), or `'needs_review'` (if AI confidence is low).
*   Updates the local job status to `'completed'`.

#### Step 6: Frontend Render
When the instructor refreshes the page or navigates back, TanStack Query retrieves the updated records. The submission status transitions to the final state, revealing the score percentage and enabling the "Review" action button.

---

### 2.2 Automated DB Webhook Flow
Supabase is configured with a database webhook trigger on the `submissions` table:
*   **Trigger Condition:** Executes when a new row is inserted (`INSERT`) with `status = 'pending'`.
*   **Action:** Dispatches an HTTP POST request to the backend `/webhook/submission-created` endpoint.
*   **Processing:** The backend handles this payload, verifies authentication, checks for duplicate active jobs, and queues the evaluation automatically in the background.

---

### 2.3 PDF Processing & Preview Flow

To provide instant feedback, PDF text extraction is handled in the FrontEnd prior to submission creation:

```
Instructor            FrontEnd            Edge Function (parse-pdf)        Lovable AI Gateway
    │                    │                           │                              │
    │ 1. Drag & Drop PDF │                           │                              │
    ├───────────────────▶│                           │                              │
    │                    │ 2. POST PDF File          │                              │
    │                    ├──────────────────────────▶│                              │
    │                    │                           │ 3. POST ArrayBuffer Base64   │
    │                    │                           ├─────────────────────────────▶│
    │                    │                           │                              │ 4. Extract text
    │                    │                           │                              │    via Gemini
    │                    │                           │                              ├─────────────┐
    │                    │                           │                              │             │
    │                    │                           │                              │◀────────────┘
    │                    │                           │ 5. JSON Raw Text             │
    │                    │                           │◀─────────────────────────────┤
    │                    │ 6. Text in Editor         │                              │
    │                    │◀──────────────────────────┤                              │
    │                    │                           │                              │
    │ 7. Edit & Submit   │                           │                              │
    ├───────────────────▶│                           │                              │
```

1.  **PDF Upload:** The instructor uploads or drops a student's PDF submission in the FrontEnd.
2.  **Edge Function Request:** The FrontEnd uploads the file to the Deno Edge Function `/functions/v1/parse-pdf`.
3.  **AI Text Ingestion:** The Edge Function [parse-pdf/index.ts](file:///e:/VinReviewer/FrontEnd/supabase/parse-pdf/index.ts) reads the file stream, converts the PDF array buffer to base64, and prompts `google/gemini-2.5-flash` to extract all raw text.
4.  **UI Population:** The Edge Function returns the raw text to the FrontEnd, which populates the text editor. This allows the instructor to verify, edit, or adjust the extracted text before clicking "Submit" to write the submission row to Supabase.

---

## 3. Shared Database Entities & Interfaces

The FrontEnd type declarations in [database.ts](file:///e:/VinReviewer/FrontEnd/src/types/database.ts) map to the database payloads generated by the BackEnd in [result.py](file:///e:/VinReviewer/BackEnd/src/mapping/result.py):

| FrontEnd TypeScript Interface | DB Table | Populated/Written By | Primary Fields Map |
| :--- | :--- | :--- | :--- |
| `Submission` | `submissions` | FrontEnd (Upload) / BackEnd (Updates Status) | `status` (`'pending' \│ 'evaluating' \│ 'ai_graded' \│ 'needs_review' \│ 'flagged' \│ 'approved'`) |
| `Evaluation` | `evaluations` | BackEnd (Evaluator) | `total_score`, `max_possible_score`, `confidence`, `overall_feedback`, `evaluation_type` (`'agentic'`) |
| `CriteriaScore` | `criteria_scores` | BackEnd (Evaluator) | `score`, `ai_score` (audit log), `explanation`, `evidence` (verified text quotes), `hallucinated_evidence` (bool) |
| `EvaluationDetail` | `evaluation_details` | BackEnd (Evaluator) | `uncited_claims`, `novelty_score`, `persona_reviews`, `red_line_violations`, `overall_percentile`, `verified_ratio`, `fabricated_refs` |

---

## 4. Security & Environment Configuration

*   **API Token Exchange:** The FrontEnd communicates with Supabase Edge Functions using the client's public publishable key (`Bearer VITE_SUPABASE_PUBLISHABLE_KEY`).
*   **Backend Secrets Vault:** The Supabase Edge Functions communicate with the FastAPI backend using a shared server-side key (`BACKEND_API_KEY`). This token is stored securely in Supabase Secrets and is verified by the backend using a timing-safe comparison to prevent timing attacks.
*   **Bypassing RLS:** The FastAPI backend uses the Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`) to bypass Row-Level Security (RLS) policies. This allows the backend to write evaluation results and update submission statuses, while FrontEnd client operations remain restricted by standard user read-only RLS policies.
