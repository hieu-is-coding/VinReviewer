-- Allow updating criteria_scores for human review edits
CREATE POLICY "Anyone can update criteria_scores" ON public.criteria_scores FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Allow deleting criteria_scores
CREATE POLICY "Anyone can delete criteria_scores" ON public.criteria_scores FOR DELETE TO public USING (true);