import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/** Returns the authenticated user's UUID, or throws if not signed in. */
async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useAssignments(classId?: string) {
  return useQuery({
    queryKey: ["assignments", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*, rubrics(name, id), submissions(id, status, evaluations(total_score, max_possible_score, confidence))")
        .eq("class_id", classId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAssignment(assignmentId?: string) {
  return useQuery({
    queryKey: ["assignment", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*, rubrics(*, criteria(*)), classes(name)")
        .eq("id", assignmentId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { class_id: string; title: string; description?: string; rubric_id?: string | null }) => {
      const user_id = await getUserId();
      const { data, error } = await supabase.from("assignments").insert({ ...values, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["assignments", data.class_id] });
    },
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; rubric_id?: string | null; title?: string; description?: string; submission_type?: string; target_venue?: string; use_agentic_evaluation?: boolean }) => {
      const { data, error } = await supabase.from("assignments").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["assignment", data.id] });
      qc.invalidateQueries({ queryKey: ["assignments", data.class_id] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
  });
}

export function useAssignmentSubmissions(assignmentId?: string) {
  return useQuery({
    queryKey: ["assignment_submissions", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, students(name, email), evaluations(*, criteria_scores(*, criteria(name, max_score, weight)))")
        .eq("assignment_id", assignmentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const data = query.state.data as any[];
      const hasPendingOrEvaluating = data?.some(
        (s) => s.status === "pending" || s.status === "evaluating"
      );
      return hasPendingOrEvaluating ? 2000 : false;
    },
  });
}

export function useCreateAssignmentSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { student_id: string; class_id: string; assignment_id: string; rubric_id?: string | null; title?: string; content: string; pdf_path?: string | null }) => {
      const user_id = await getUserId();
      const { data, error } = await supabase.from("submissions").insert({ ...values, user_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["assignment_submissions", data.assignment_id] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}
