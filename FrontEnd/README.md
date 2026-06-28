# GradioAI FrontEnd

React 18 instructor-facing web application for GradioAI — an AI-powered academic submission review platform.

> React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase + React Query

---

## Quick Start

```bash
bun install
bun dev           # Dev server at http://localhost:5173
bun run build     # Production build
bun test          # Vitest unit tests
```

---

## Pages

| File | Purpose |
|------|---------|
| `src/pages/Index.tsx` | Dashboard / landing page |
| `src/pages/ClassesPage.tsx` | List + create classes |
| `src/pages/ClassDetailPage.tsx` | Class detail — students, assignments, analytics, AI deep analysis |
| `src/pages/AssignmentDetailPage.tsx` | Assignment detail — submissions, rubric editor, analytics, settings |
| `src/pages/AnalyticsPage.tsx` | Cross-class analytics + AI insights |
| `src/pages/SettingsPage.tsx` | App settings |
| `src/pages/NotFound.tsx` | 404 |

---

## Source Layout

```
src/
├── pages/                        Route-level page components
├── components/
│   ├── analytics/
│   │   ├── SectionHeader.tsx      Shared collapsible section header
│   │   └── MiniStat.tsx           Shared mini stat card
│   ├── ui/                        shadcn/ui primitives
│   ├── ErrorBoundary.tsx          Top-level error boundary with fallback UI
│   ├── SubmissionDetail.tsx       Per-submission review UI (XSS-safe rendering)
│   ├── BulkSubmissionDialog.tsx   Bulk PDF/text upload
│   ├── AppSidebar.tsx             Navigation sidebar
│   └── DashboardLayout.tsx        Main layout shell
├── hooks/
│   ├── useData.ts                 React Query hooks for all DB tables
│   ├── useAssignments.ts          Assignment-specific queries + mutations
│   └── useAnalytics.ts            Analytics aggregation + AI insights
├── lib/
│   ├── analytics.ts               Pure utility functions — distribution, percentiles, outliers
│   ├── sanitize.ts                HTML entity escaping (XSS prevention)
│   ├── constants.ts               Shared constants (confidence threshold, CSV limits)
│   └── utils.ts                   Tailwind cn() helper
├── types/
│   └── database.ts                TypeScript interfaces for all database entities
├── integrations/supabase/
│   ├── client.ts                  Supabase JS client
│   └── types.ts                   Auto-generated DB types
├── test/
│   ├── test-utils.tsx             Render wrapper (QueryClient, Router, Tooltip)
│   └── mocks/supabase.ts          Mock Supabase client
└── index.css                      Semantic design tokens (HSL)
```

---

## Key Modules

### Analytics Utilities (`src/lib/analytics.ts`)

Pure functions extracted from page-level inline logic, used by both `AssignmentDetailPage` and `ClassDetailPage`:

- `computeDistribution(scores, bucketCount)` — histogram buckets
- `computePercentiles(scores)` — p10, p25, p50, p75, p90
- `computeOutliers(scores)` — IQR-based outlier detection
- `computeCriteriaBreakdown(criteriaScores)` — per-criterion average + variance
- `computeConfidenceStats(evaluations)` — confidence distribution
- `findUnstableCriteria(criteriaScores)` — high-variance criteria flagging

### Shared Analytics Components (`src/components/analytics/`)

- **SectionHeader** — collapsible section header with icon, title, subtitle, and expand/collapse toggle
- **MiniStat** — compact stat card with icon, label, and value

### XSS Prevention (`src/lib/sanitize.ts`)

`escapeHtml(str)` — entity-escapes `& < > " '` before rendering user-submitted content. Used by `SubmissionDetail` to safely render submission text via `dangerouslySetInnerHTML`.

### CSV Upload Validation (`ClassDetailPage`)

Student CSV uploads are validated for:
- File size (max 5 MB)
- Row count (max 500)
- Email format (regex)
- Duplicate name detection (case-insensitive)

### Error Boundary (`src/components/ErrorBoundary.tsx`)

Top-level React class component wrapping the app in `App.tsx`. Catches render errors with `componentDidCatch` and displays a fallback UI with a reload button.

### Database Types (`src/types/database.ts`)

TypeScript interfaces for all Supabase entities: `Evaluation`, `CriteriaScore`, `Submission`, `Student`, `Class`, `Assignment`, `Rubric`, `Criterion`, `EvaluationDetail`. Derived from the actual `.select()` query shapes in hooks.

---

## Accessibility

- Icon-only buttons have `aria-label` attributes across all pages
- Loading spinners use `role="status"` and `aria-live="polite"`
- Color-coded badges include text labels alongside color

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |

### Edge Function Secrets (deployed via `supabase secrets set`)

| Variable | Description |
|----------|-------------|
| `LOVABLE_API_KEY` | Lovable AI gateway key (for Gemini models) |
| `BACKEND_URL` | BackEnd base URL |
| `BACKEND_API_KEY` | BackEnd API key |

---

## Edge Functions (`supabase/functions/`)

| Function | Purpose |
|----------|---------|
| `evaluate/` | AI-grades a submission against its rubric; proxies to BackEnd for agentic evaluation |
| `parse-pdf/` | Extracts text from uploaded PDFs using Gemini |
| `analyze-insights/` | Generates AI insights from score distributions and weakness maps |

---

## Testing

```bash
bun test          # Vitest unit tests
bun playwright    # Playwright E2E tests
```

Test infrastructure in `src/test/`:
- `test-utils.tsx` — render wrapper with `QueryClientProvider`, `BrowserRouter`, `TooltipProvider`
- `mocks/supabase.ts` — mock Supabase client for unit tests
