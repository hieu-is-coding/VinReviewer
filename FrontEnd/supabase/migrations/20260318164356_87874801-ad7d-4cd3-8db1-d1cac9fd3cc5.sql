
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Classes table
CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read classes" ON public.classes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert classes" ON public.classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update classes" ON public.classes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete classes" ON public.classes FOR DELETE USING (true);
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rubrics table
CREATE TABLE public.rubrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read rubrics" ON public.rubrics FOR SELECT USING (true);
CREATE POLICY "Anyone can insert rubrics" ON public.rubrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rubrics" ON public.rubrics FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete rubrics" ON public.rubrics FOR DELETE USING (true);
CREATE TRIGGER update_rubrics_updated_at BEFORE UPDATE ON public.rubrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Criteria table
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
ALTER TABLE public.criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read criteria" ON public.criteria FOR SELECT USING (true);
CREATE POLICY "Anyone can insert criteria" ON public.criteria FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update criteria" ON public.criteria FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete criteria" ON public.criteria FOR DELETE USING (true);

-- Students table
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Anyone can insert students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update students" ON public.students FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete students" ON public.students FOR DELETE USING (true);

-- Class-student junction
CREATE TABLE public.class_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id)
);
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read class_students" ON public.class_students FOR SELECT USING (true);
CREATE POLICY "Anyone can insert class_students" ON public.class_students FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete class_students" ON public.class_students FOR DELETE USING (true);

-- Submissions table
CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluating', 'ai_graded', 'needs_review', 'flagged', 'approved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read submissions" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert submissions" ON public.submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update submissions" ON public.submissions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete submissions" ON public.submissions FOR DELETE USING (true);
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evaluations table
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overridden')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read evaluations" ON public.evaluations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert evaluations" ON public.evaluations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update evaluations" ON public.evaluations FOR UPDATE USING (true);

-- Criteria scores table
CREATE TABLE public.criteria_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES public.criteria(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  explanation TEXT,
  evidence TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.criteria_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read criteria_scores" ON public.criteria_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert criteria_scores" ON public.criteria_scores FOR INSERT WITH CHECK (true);
