ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_status_check;
ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'overridden'::text, 'failed'::text]));