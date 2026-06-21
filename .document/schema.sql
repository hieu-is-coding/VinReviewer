-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.rubrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.criteria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rubric_id UUID NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight NUMERIC NOT NULL DEFAULT 1,
  max_score INTEGER NOT NULL DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.class_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT class_students_class_id_student_id_key UNIQUE(class_id, student_id)
);

CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  submission_type TEXT NOT NULL DEFAULT 'essay',
  target_venue TEXT NOT NULL DEFAULT 'general',
  use_agentic_evaluation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'evaluating'::text, 'ai_graded'::text, 'needs_review'::text, 'human_reviewed'::text, 'flagged'::text, 'approved'::text])),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  total_score NUMERIC,
  max_possible_score NUMERIC,
  confidence NUMERIC,
  overall_feedback TEXT,
  grammar_feedback TEXT,
  content_feedback TEXT,
  structure_feedback TEXT,
  improvement_suggestions TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'overridden'::text, 'failed'::text])),
  confidence_breakdown JSONB,
  evaluation_type TEXT NOT NULL DEFAULT 'simple',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.criteria_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES public.criteria(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  explanation TEXT,
  evidence TEXT,
  ai_score NUMERIC,
  confidence NUMERIC,
  hallucinated_evidence BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluation_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  uncited_claims JSONB NOT NULL DEFAULT '[]',
  low_similarity_citations JSONB NOT NULL DEFAULT '[]',
  novelty_score FLOAT,
  novelty_claims JSONB NOT NULL DEFAULT '[]',
  persona_reviews JSONB NOT NULL DEFAULT '[]',
  disagreement_flags TEXT[] NOT NULL DEFAULT '{}',
  red_line_violations JSONB NOT NULL DEFAULT '[]',
  human_flag BOOLEAN NOT NULL DEFAULT FALSE,
  overall_percentile FLOAT,
  venue_tier TEXT,
  dimension_percentiles JSONB NOT NULL DEFAULT '{}',
  verified_ratio FLOAT,
  fabricated_refs TEXT[] NOT NULL DEFAULT '{}',
  pipeline_run_id UUID,
  pipeline_duration_ms INTEGER,
  model_versions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.evidence_spans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  criterion_id UUID NOT NULL,
  quote TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  verified BOOLEAN NOT NULL DEFAULT false,
  match_score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

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
  delta NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.rubric_quality_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rubric_id UUID NOT NULL,
  criterion_id UUID NOT NULL UNIQUE,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_score NUMERIC,
  score_variance NUMERIC,
  avg_confidence NUMERIC,
  override_rate NUMERIC,
  hallucination_rate NUMERIC,
  effectiveness TEXT,
  ai_suggestion TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.student_skill_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  criterion_name TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_score_pct NUMERIC,
  recent_score_pct NUMERIC,
  trend NUMERIC,
  last_evaluated_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT student_skill_profile_student_id_criterion_name_key UNIQUE(student_id, criterion_name)
);

CREATE TABLE public.integrity_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL UNIQUE,
  ai_text_likelihood NUMERIC,
  burstiness NUMERIC,
  avg_sentence_len NUMERIC,
  sentence_len_stddev NUMERIC,
  max_similarity NUMERIC,
  most_similar_submission_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);