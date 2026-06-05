-- Phase 4: Extend schema for agentic GradingSystem pipeline outputs

-- -----------------------------------------------------------------------
-- 4.1 evaluation_details table
-- -----------------------------------------------------------------------
CREATE TABLE public.evaluation_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,

    -- Evidence audit
    uncited_claims JSONB NOT NULL DEFAULT '[]',
    low_similarity_citations JSONB NOT NULL DEFAULT '[]',

    -- Novelty
    novelty_score FLOAT,
    novelty_claims JSONB NOT NULL DEFAULT '[]',

    -- Deliberation
    persona_reviews JSONB NOT NULL DEFAULT '[]',
    disagreement_flags TEXT[] NOT NULL DEFAULT '{}',

    -- Supervisor
    red_line_violations JSONB NOT NULL DEFAULT '[]',
    human_flag BOOLEAN NOT NULL DEFAULT FALSE,

    -- Comparative
    overall_percentile FLOAT,
    venue_tier TEXT,
    dimension_percentiles JSONB NOT NULL DEFAULT '{}',

    -- Reference validation
    verified_ratio FLOAT,
    fabricated_refs TEXT[] NOT NULL DEFAULT '{}',

    -- Metadata
    pipeline_run_id UUID,
    pipeline_duration_ms INTEGER,
    model_versions JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read evaluation_details"  ON public.evaluation_details FOR SELECT USING (true);
CREATE POLICY "Anyone can insert evaluation_details" ON public.evaluation_details FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update evaluation_details" ON public.evaluation_details FOR UPDATE USING (true);

-- -----------------------------------------------------------------------
-- 4.2 evaluations — add evaluation_type column
-- -----------------------------------------------------------------------
ALTER TABLE public.evaluations
    ADD COLUMN IF NOT EXISTS evaluation_type TEXT NOT NULL DEFAULT 'simple';
-- 'simple'  = existing Gemini-based evaluator (Edge Function)
-- 'agentic' = full GradingSystem multi-agent pipeline

-- -----------------------------------------------------------------------
-- 4.3 assignments — add submission_type and target_venue columns
-- -----------------------------------------------------------------------
ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS submission_type TEXT NOT NULL DEFAULT 'essay';
-- 'essay' | 'research_paper'

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS target_venue TEXT NOT NULL DEFAULT 'general';
-- e.g. 'general', 'neurips', 'acl', 'nature'

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS use_agentic_evaluation BOOLEAN NOT NULL DEFAULT FALSE;
