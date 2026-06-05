
-- Remove multi-pass evaluator feature
ALTER TABLE public.assignments DROP COLUMN IF EXISTS evaluation_mode;
ALTER TABLE public.evaluations DROP COLUMN IF EXISTS evaluation_mode;
ALTER TABLE public.evaluations DROP COLUMN IF EXISTS critic_disagreement;
ALTER TABLE public.evaluations DROP COLUMN IF EXISTS prompt_version_id;
ALTER TABLE public.criteria_scores DROP COLUMN IF EXISTS disagreement_score;

DROP TABLE IF EXISTS public.evaluation_runs CASCADE;
DROP TABLE IF EXISTS public.prompt_versions CASCADE;
