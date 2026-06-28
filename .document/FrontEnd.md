# GradioAI FrontEnd Architecture & Design Specifications

This document provides a detailed description of the functionalities, data entities, system designs, workflows, aesthetics, and testing strategies of the GradioAI FrontEnd application.

---

## 1. Overview & Selected Technology Stack

The GradioAI FrontEnd is designed as an instructor-facing Single Page Application (SPA) that acts as the control center for classroom student assignments, rubric management, AI-assisted grading, and learning analytics. 

### Technology Stack Selection

The frontend is built on the following modern, premium web technologies:

*   **Core Framework:** **React 18.3.1** with **TypeScript 5.8.3** for structured, component-driven, type-safe development.
*   **Build Tool & Runtime:** **Vite 5.4.19** as the bundle tool and dev server using esbuild for fast HMR (Hot Module Replacement) and build times.
*   **Styling Engine:** **Tailwind CSS 3.4.17** for utility-first responsive styling and layout consistency.
*   **Component Architecture:** **shadcn/ui** (utilizing Radix UI accessible primitives) for a unified, design-system-driven component library.
*   **Server State & Caching:** **React Query (TanStack Query 5.83)** to handle cache management, queries, mutations, automatic cache invalidations, and API request status.
*   **Database Client:** **Supabase JS SDK (2.99.2)** for client-to-database CRUD operations, authentication contexts, and edge function invocations.
*   **Form & Validation Controls:** **React Hook Form 7.61.1** paired with **Zod 3.25.76** for schema-based inputs, client-side validation, and type inference.
*   **Visual Analytics:** **Recharts 2.15.4** for rendering responsive score distribution histograms, radar maps, and bar charts.
*   **Icon Library:** **Lucide React (0.462.0)** for descriptive iconography.

---

## 2. Navigation & Page Structure

The application layout is structured around a responsive sidebar navigation wrapper (`DashboardLayout.tsx` and `AppSidebar.tsx`) with collapsible state persistence in `localStorage`. The routing configuration is defined in `App.tsx` using `react-router-dom`:

| Page / Component | Route | Key Functionalities |
| :--- | :--- | :--- |
| **Dashboard** (`Index.tsx`) | `/` | Aggregates overall workflow metrics, quick statistics, and recent class performance percentages. |
| **Classes** (`ClassesPage.tsx`) | `/classes` | Renders a grid of courses. Handles course creation, edits, and deletions via dialogs. |
| **Class Detail** (`ClassDetailPage.tsx`) | `/classes/:classId` | Divided into three tabs: Assignments list, Students roster, and Class Analytics (including AI Deep Analysis). |
| **Assignment Detail** (`AssignmentDetailPage.tsx`) | `/classes/:classId/assignments/:assignmentId` | Core grading workspace divided into Submissions table, Rubric builder, Assignment Analytics, and Evaluation Settings. |
| **Analytics Dashboard** (`AnalyticsPage.tsx`) | `/analytics` | Institution-level / cross-class dashboard displaying comprehensive score distributions, AI insights, and system performance metrics. |
| **Settings** (`SettingsPage.tsx`) | `/settings` | Configuration panel for user profiles and workspace AI preferences (e.g., auto-flagging low-confidence grades). |
| **Not Found** (`NotFound.tsx`) | `*` | Graceful fallback page for unresolved paths. |

---

## 3. Data Entities & TypeScript Interface Models

All data communication between Supabase PostgreSQL tables and the React frontend is strongly typed. The models are declared in [database.ts](file:///e:/GradioAI/FrontEnd/src/types/database.ts):

### 3.1 Course & Student Entities
*   **`Class`:** Represents an instructor's course.
    ```typescript
    export interface Class {
      id: string;
      name: string;
      description: string | null;
      created_at: string;
    }
    ```
*   **`Student`:** Core student record.
    ```typescript
    export interface Student {
      id: string;
      name: string;
      email: string | null;
      created_at: string;
    }
    ```
*   **`ClassStudent`:** Junction entity representing course enrollment.
    ```typescript
    export interface ClassStudent {
      id: string;
      class_id: string;
      student_id: string;
      students: Student;
    }
    ```

### 3.2 Rubric & Criteria Entities
*   **`Rubric`:** Container for the grading criteria of an assignment.
    ```typescript
    export interface Rubric {
      id: string;
      name: string;
      description: string | null;
      class_id: string | null;
      created_at: string;
      criteria: Criterion[];
      classes: { name: string } | null;
    }
    ```
*   **`Criterion`:** A singular dimension of the rubric (e.g., "Clarity", "Methodology").
    ```typescript
    export interface Criterion {
      id: string;
      rubric_id: string;
      name: string;
      description: string | null;
      weight: number;
      max_score: number;
      sort_order: number;
    }
    ```

### 3.3 Submission & Evaluation Entities
*   **`Submission`:** Represents a student's submission file/text for an assignment.
    ```typescript
    export interface Submission {
      id: string;
      student_id: string;
      class_id: string;
      assignment_id: string | null;
      rubric_id: string | null;
      title: string | null;
      content: string;
      status: SubmissionStatus;
      created_at: string;
      students: { name: string } | null;
      classes: { name: string } | null;
      rubrics: { name: string } | null;
      evaluations: Evaluation[];
    }
    ```
*   **`SubmissionStatus`:** Represents states within the review workflow pipeline:
    *   `pending`: Submission uploaded; awaits evaluation.
    *   `evaluating`: AI pipeline currently processing.
    *   `ai_graded`: AI evaluation completed; awaiting instructor review.
    *   `needs_review`: AI evaluated but flagged for review (low confidence, hallucination check failed).
    *   `flagged`: Supervisor rejected due to hard rule violations (requires human intervention).
    *   `approved`: Grade and feedback approved by the instructor.
*   **`Evaluation`:** Core grading result containing scores and overall feedback categories.
    ```typescript
    export interface Evaluation {
      id: string;
      submission_id: string;
      total_score: number;
      max_possible_score: number;
      confidence: number | null;
      overall_feedback: string | null;
      content_feedback: string | null;
      structure_feedback: string | null;
      improvement_suggestions: string | null;
      evaluation_type: string;
      status: string;
      created_at: string;
      criteria_scores: CriteriaScore[];
    }
    ```
*   **`CriteriaScore`:** Detailed grade assigned per rubric criterion. Holds a copy of the original AI-proposed score (`ai_score`), any current overridden score (`score`), supporting quotes from the text (`evidence`), confidence percentage, and a boolean flag for potentially fabricated reference citations (`hallucinated_evidence`).
    ```typescript
    export interface CriteriaScore {
      id: string;
      evaluation_id: string;
      criterion_id: string;
      score: number;
      ai_score: number | null;
      explanation: string | null;
      evidence: string | null;
      confidence: number | null;
      hallucinated_evidence: boolean | null;
      criteria: {
        name: string;
        max_score: number;
        weight: number;
      } | null;
    }
    ```
*   **`EvaluationDetail`:** Contains advanced data generated during agentic multi-pass reviews:
    ```typescript
    export interface EvaluationDetail {
      id: string;
      evaluation_id: string;
      uncited_claims: unknown[];
      low_similarity_citations: unknown[];
      novelty_score: number | null;
      novelty_claims: unknown[];
      persona_reviews: unknown[];
      disagreement_flags: string[];
      red_line_violations: unknown[];
      human_flag: boolean;
      overall_percentile: number | null;
      venue_tier: string | null;
      dimension_percentiles: Record<string, number>;
      verified_ratio: number | null;
      fabricated_refs: string[];
      pipeline_run_id: string | null;
    }
    ```

---

## 4. Key Workflows & Features

### 4.1 Student Roster & Bulk Enrollment
Instructors can populate the class roster using two methods:
1.  **Manual Addition:** Adds individual students via a dialog form (Zod-validated name and optional email formats).
2.  **Bulk CSV Import:** Enables importing a file with `name` and `email` columns. 
    *   *Validation Constraints:* Enforces a maximum file size of 5 MB (`MAX_CSV_FILE_SIZE`) and a maximum limit of 500 rows (`MAX_CSV_ROWS`). It skips duplicate student names and alerts the user with warnings for invalid emails and duplicates.

### 4.2 Assignment Configuration & Rubric Editor
*   **Assignment Settings:** Instructors can toggle the evaluation model between **Simple Evaluation** (direct Gemini 2.5 Pro processing) and **Advanced (Agentic) Evaluation** (LangGraph orchestration through the Python backend). They can configure the submission type (`essay` vs. `research_paper` for GROBID routing) and target conference venue (e.g., NeurIPS, ACL, ICLR) for score calibration.
*   **Rubric Builder:** Manages the creation of multi-dimensional evaluation criteria. Instructors specify the Criterion Name, Description, Max Score (default 5), and Weight. Dynamic updates are handled via TanStack mutations, which recalculate scores and invalidate current query states.

### 4.3 Submission Ingestion & Bulk Parsing Queue
*   **File Drag & Drop / Upload:** Supports direct PDF uploads (up to 20 MB). When a file is uploaded, the frontend triggers the Supabase Edge Function `/functions/v1/parse-pdf` to stream, parse, and extract the text content (routing research papers through GROBID) and loads it into the text editor automatically.
*   **Bulk Queueing Dialog (`BulkSubmissionDialog.tsx`):** A side-by-side split screen interface. The left panel shows the list of students with queued submission markers. The right panel lets the instructor select a student, drag and drop their specific PDF submission, parse it, queue it, and process all submissions simultaneously.

### 4.4 Grading, Overrides, & Feedback View (`SubmissionDetail.tsx`)
Once evaluated, the submission moves to the Detail Panel, which is split into two columns:
*   **Left Column (Manuscript View):** Shows the extracted plain text of the student's submission.
*   **Right Column (Evaluation Details & Instructor Interactivity):**
    *   **Score Summary:** Shows the overall grade percentage, points breakdown, and minimum AI confidence metric.
    *   **Interactive Rubric Breakdown:** Renders a list of the criteria scores. Each card displays:
        *   The calculated score with a colored percentage progress bar (Success/Warning/Destructive thresholds).
        *   AI Level badges (e.g., `Proficient`, `Developing`) and confidence percentages.
        *   **Verified Evidence Quote:** Renders the specific sentence from the student's text that justifies the score. Shows warning badges if no evidence is found or if the cited quote is missing from the submission (detecting AI hallucinations).
        *   **Improvement Actions:** Contextual suggestions to help students reach the next rubric tier.
        *   **Score and Explanation Overrides:** Instructors can click edit on any individual criterion, override the score, and rewrite the feedback explanation.
    *   **Status Approval Pipeline:** Instructors can advance a submission through status states using top action buttons (`Mark as Reviewed`, `Approve`).

### 4.5 Class & Assignment Analytics Dashboard
Renders analytical charts to help instructors evaluate classroom performance:
*   **Score Distribution:** A Recharts bar chart showing the frequency of grades across five buckets, alongside outliers and percentile metrics (P25, Median, P75).
*   **Criteria Radar & Bar Charts:** Displays radar and horizontal bar charts to highlight class strengths and weaknesses across rubric dimensions.
*   **AI Deep Analysis (Insights Generation):** Invokes the Supabase Edge Function `/functions/v1/analyze-insights` with classroom statistics to generate:
    *   *Conceptual Weakness Maps:* Highlight topics students struggle with (with severity ratings and affected percentages).
    *   *Student Clusters:* Segment the classroom based on performance profiles, listing collective strengths and weaknesses.
    *   *Teaching Action Items:* Recommended modifications to lecture topics or rubric definitions based on classroom metrics.

---

## 5. Design System & Aesthetics

The UI features a modern, clean dashboard design with high color contrast, rounded geometries, and subtle motion effects:

*   **Colors (HSL Variables):** Uses curated HSL palettes supporting both light and dark modes:
    *   *Backgrounds:* Soft cool grey/blue (`210 40% 98%`) for light mode; dark charcoal (`222 47% 6%`) for dark mode.
    *   *Primary / Accents:* Rich indigo/violet accent (`239 84% 67%`).
    *   *Status Semantics:* Success Green (`142 71% 45%`), Warning Orange (`38 92% 50%`), and Destructive Red (`0 84% 60%`).
*   **Typography:** Custom imported **Inter** font family with weights `300` to `700` for readability.
*   **Layout:** Clean sidebar layouts (`DashboardLayout`) with glassmorphism touches and collapsible sidebars.
*   **Animations:** Configured in `tailwind.config.ts` to include smooth slide-downs for accordions and a subtle vertical translation fade-in (`fade-in 0.3s ease-out`) for page transitions.

---

## 6. Security & Data Integrity

The frontend implements defense-in-depth safety checks:

*   **XSS Mitigation:** Escapes HTML characters (`&`, `<`, `>`, `"`, `'`) via `sanitize.ts` before rendering text to prevent Cross-Site Scripting.
*   **CSV Safeguards:** Limits uploads to 5 MB and 500 rows before processing to avoid client-side memory lag.
*   **Key Protection:** Exposes only the Supabase public publishable key (`anon`) to the browser client. All sensitive actions (such as backend API evaluations) run serverless or use server-side service keys.

---

## 7. Testing Strategy

The FrontEnd features a two-tiered testing suite:

1.  **Unit Tests (Vitest):**
    *   Validates custom helper scripts (like `analytics.ts` and `sanitize.ts`).
    *   Uses `@testing-library/react` to test individual components (e.g., rendering score cards, updating state values).
    *   *Execution command:* `cd FrontEnd && bun test`
2.  **End-to-End Tests (Playwright):**
    *   Runs automated browser tests (Chromium, Firefox, WebKit) to verify user flows.
    *   Tests class creation, student rosters, PDF parsing, evaluation triggers, and status changes.
    *   *Execution command:* `cd FrontEnd && bun playwright`
