
-- Create assignments table
CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add assignment_id to submissions (nullable for backward compat)
ALTER TABLE public.submissions ADD COLUMN assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for assignments
CREATE POLICY "Anyone can read assignments" ON public.assignments FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert assignments" ON public.assignments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update assignments" ON public.assignments FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete assignments" ON public.assignments FOR DELETE TO public USING (true);

-- Add updated_at trigger for assignments
CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
