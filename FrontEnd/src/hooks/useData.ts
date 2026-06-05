import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ---- Classes ----
export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data, error } = await supabase.from("classes").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });
}

export function useUpdateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string }) => {
      const { data, error } = await supabase.from("classes").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });
}

// ---- Students ----
export function useStudents() {
  return useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; email?: string }) => {
      const { data, error } = await supabase.from("students").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

// ---- Rubrics ----
export function useRubrics() {
  return useQuery({
    queryKey: ["rubrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rubrics").select("*, criteria(*), classes(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRubric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string; class_id?: string | null }) => {
      const { data, error } = await supabase.from("rubrics").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubrics"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
    },
  });
}

export function useDeleteRubric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rubrics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubrics"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
    },
  });
}

// ---- Criteria ----
export function useCreateCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { rubric_id: string; name: string; description?: string; weight?: number; max_score?: number; sort_order?: number }) => {
      const { data, error } = await supabase.from("criteria").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubrics"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
    },
  });
}

export function useDeleteCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("criteria").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubrics"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
    },
  });
}

// ---- Class Students ----
export function useClassStudents(classId?: string) {
  return useQuery({
    queryKey: ["class_students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("class_students").select("*, students(*)").eq("class_id", classId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddStudentToClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { class_id: string; student_id: string }) => {
      const { data, error } = await supabase.from("class_students").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class_students"] }),
  });
}

// ---- Submissions ----
export function useSubmissions() {
  return useQuery({
    queryKey: ["submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, students(name), classes(name), rubrics(name), evaluations(*, criteria_scores(*, criteria(name, max_score, weight)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { student_id: string; class_id: string; rubric_id?: string | null; title?: string; content: string }) => {
      const { data, error } = await supabase.from("submissions").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["submissions"] }),
  });
}

// ---- Evaluations ----
export function useEvaluations() {
  return useQuery({
    queryKey: ["evaluations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("*, submissions(*, students(name), classes(name)), criteria_scores(*, criteria(name, max_score, weight))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEvaluateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submission_id: string) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ submission_id }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Evaluation failed");
      }
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      qc.invalidateQueries({ queryKey: ["assignment_submissions"] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
  });
}

// ---- Update Evaluation (Human Review) ----
export function useUpdateEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; total_score?: number; max_possible_score?: number; overall_feedback?: string; grammar_feedback?: string; content_feedback?: string; structure_feedback?: string; improvement_suggestions?: string }) => {
      const { data, error } = await supabase.from("evaluations").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      qc.invalidateQueries({ queryKey: ["assignment_submissions"] });
    },
  });
}

// ---- Update Submission Status ----
export function useUpdateSubmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase.from("submissions").update({ status }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["assignment_submissions"] });
    },
  });
}

// ---- Update Criteria Score ----
export function useUpdateCriteriaScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, score, explanation }: { id: string; score: number; explanation?: string }) => {
      const { data, error } = await supabase.from("criteria_scores").update({ score, explanation }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      qc.invalidateQueries({ queryKey: ["assignment_submissions"] });
    },
  });
}

// ---- Evaluation Details (agentic pipeline) ----
export function useEvaluationDetails(evaluationId: string | null | undefined) {
  return useQuery({
    queryKey: ["evaluation_details", evaluationId],
    enabled: !!evaluationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_details")
        .select("*")
        .eq("evaluation_id", evaluationId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
