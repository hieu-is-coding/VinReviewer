-- ============================================================
-- Batch A foundations: multi-pass evaluator + learning loop schema
-- ============================================================

-- 1. evaluation_runs: one row per AI pass within an evaluation
CREATE TABLE public.evaluation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  agent TEXT NOT NULL, -- 'rubric_interpreter' | 'evidence_locator' | 'grader' | 'critic' | 'reconciler' | 'coach'
  model TEXT NOT NULL,
  prompt_version_id UUID,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'failed'
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  input_payload JSONB,
  output_payload JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read evaluation_runs" ON public.evaluation_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert evaluation_runs" ON public.evaluation_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update evaluation_runs" ON public.evaluation_runs FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete evaluation_runs" ON public.evaluation_runs FOR DELETE USING (true);
CREATE INDEX idx_evaluation_runs_eval ON public.evaluation_runs(evaluation_id);
CREATE INDEX idx_evaluation_runs_submission ON public.evaluation_runs(submission_id);

-- 2. evidence_spans: where in the submission the AI grounded a criterion
CREATE TABLE public.evidence_spans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  criterion_id UUID NOT NULL,
  quote TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  verified BOOLEAN NOT NULL DEFAULT false,
  match_score NUMERIC, -- fuzzy match similarity 0..1
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.evidence_spans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read evidence_spans" ON public.evidence_spans FOR SELECT USING (true);
CREATE POLICY "Anyone can insert evidence_spans" ON public.evidence_spans FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update evidence_spans" ON public.evidence_spans FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete evidence_spans" ON public.evidence_spans FOR DELETE USING (true);
CREATE INDEX idx_evidence_spans_eval ON public.evidence_spans(evaluation_id);
CREATE INDEX idx_evidence_spans_criterion ON public.evidence_spans(criterion_id);

-- 3. instructor_corrections: gold dataset for the calibration loop
CREATE TABLE public.instructor_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  criterion_id UUID,
  class_id UUID,
  rubric_id UUID,
  ai_score NUMERIC,
  human_score NUMERIC,
  ai_explanation TEXT,
  human_note TEXT,
  delta NUMERIC, -- human_score - ai_score
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.instructor_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read instructor_corrections" ON public.instructor_corrections FOR SELECT USING (true);
CREATE POLICY "Anyone can insert instructor_corrections" ON public.instructor_corrections FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update instructor_corrections" ON public.instructor_corrections FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete instructor_corrections" ON public.instructor_corrections FOR DELETE USING (true);
CREATE INDEX idx_corrections_class ON public.instructor_corrections(class_id);
CREATE INDEX idx_corrections_rubric ON public.instructor_corrections(rubric_id);
CREATE INDEX idx_corrections_criterion ON public.instructor_corrections(criterion_id);

-- 4. rubric_quality_metrics: per-criterion health
CREATE TABLE public.rubric_quality_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rubric_id UUID NOT NULL,
  criterion_id UUID NOT NULL UNIQUE,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_score NUMERIC,
  score_variance NUMERIC,
  avg_confidence NUMERIC,
  override_rate NUMERIC, -- 0..1
  hallucination_rate NUMERIC, -- 0..1
  effectiveness TEXT, -- 'high' | 'medium' | 'low'
  ai_suggestion TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.rubric_quality_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read rubric_quality_metrics" ON public.rubric_quality_metrics FOR SELECT USING (true);
CREATE POLICY "Anyone can insert rubric_quality_metrics" ON public.rubric_quality_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rubric_quality_metrics" ON public.rubric_quality_metrics FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete rubric_quality_metrics" ON public.rubric_quality_metrics FOR DELETE USING (true);
CREATE TRIGGER trg_rubric_quality_metrics_updated_at
  BEFORE UPDATE ON public.rubric_quality_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. student_skill_profile: longitudinal per-criterion-name
CREATE TABLE public.student_skill_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  criterion_name TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_score_pct NUMERIC, -- 0..100
  recent_score_pct NUMERIC, -- last evaluation
  trend NUMERIC, -- recent - earlier average
  last_evaluated_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, criterion_name)
);
ALTER TABLE public.student_skill_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read student_skill_profile" ON public.student_skill_profile FOR SELECT USING (true);
CREATE POLICY "Anyone can insert student_skill_profile" ON public.student_skill_profile FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update student_skill_profile" ON public.student_skill_profile FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete student_skill_profile" ON public.student_skill_profile FOR DELETE USING (true);
CREATE TRIGGER trg_student_skill_profile_updated_at
  BEFORE UPDATE ON public.student_skill_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. prompt_versions: every system prompt is versioned
CREATE TABLE public.prompt_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent TEXT NOT NULL,
  version TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent, version)
);
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read prompt_versions" ON public.prompt_versions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert prompt_versions" ON public.prompt_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update prompt_versions" ON public.prompt_versions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete prompt_versions" ON public.prompt_versions FOR DELETE USING (true);

-- 7. integrity_signals: per-submission AI/plagiarism heuristics
CREATE TABLE public.integrity_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL UNIQUE,
  ai_text_likelihood NUMERIC, -- 0..1
  burstiness NUMERIC,
  avg_sentence_len NUMERIC,
  sentence_len_stddev NUMERIC,
  max_similarity NUMERIC, -- 0..1 vs other submissions in same assignment
  most_similar_submission_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.integrity_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read integrity_signals" ON public.integrity_signals FOR SELECT USING (true);
CREATE POLICY "Anyone can insert integrity_signals" ON public.integrity_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update integrity_signals" ON public.integrity_signals FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete integrity_signals" ON public.integrity_signals FOR DELETE USING (true);
CREATE TRIGGER trg_integrity_signals_updated_at
  BEFORE UPDATE ON public.integrity_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Extend evaluations
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS confidence_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS critic_disagreement JSONB,
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID,
  ADD COLUMN IF NOT EXISTS evaluation_mode TEXT DEFAULT 'multi_pass';

-- 9. Extend criteria_scores
ALTER TABLE public.criteria_scores
  ADD COLUMN IF NOT EXISTS ai_score NUMERIC, -- original AI score before any human override
  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS hallucinated_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS disagreement_score NUMERIC; -- delta between Grader and Critic, normalized 0..1

-- 10. Extend assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS evaluation_mode TEXT NOT NULL DEFAULT 'multi_pass'; -- 'multi_pass' | 'single_pass'
