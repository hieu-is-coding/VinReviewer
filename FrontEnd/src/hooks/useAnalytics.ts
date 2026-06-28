import { useMemo } from "react";
import { useEvaluations, useClasses, useSubmissions } from "./useData";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Evaluation, Submission } from "@/types/database";

// ---- Computed Analytics ----
export function useAnalyticsData(classId?: string, assignmentId?: string) {
  const { data: evaluations, isLoading: loadingEvals } = useEvaluations();
  const { data: classes, isLoading: loadingClasses } = useClasses();
  const { data: submissions, isLoading: loadingSubmissions } = useSubmissions();

  const { data: assignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ["assignments", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*, rubrics(name, id), classes(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredEvals = useMemo(() => {
    if (!evaluations) return [];
    let res = evaluations;
    if (classId && classId !== "all") {
      res = res.filter((e: any) => e.submissions?.class_id === classId);
    }
    if (assignmentId && assignmentId !== "all") {
      res = res.filter((e: any) => e.submissions?.assignment_id === assignmentId);
    }
    return res;
  }, [evaluations, classId, assignmentId]);

  const filteredSubs = useMemo(() => {
    if (!submissions) return [];
    let res = submissions;
    if (classId && classId !== "all") {
      res = res.filter((s: any) => s.class_id === classId);
    }
    if (assignmentId && assignmentId !== "all") {
      res = res.filter((s: any) => s.assignment_id === assignmentId);
    }
    return res;
  }, [submissions, classId, assignmentId]);

  const computed = useMemo(() => {
    if (!evaluations || !classes || !submissions || !assignments) return null;

    // Score percentages
    const scores: { pct: number; studentName: string; className: string; confidence: number; evalId: string; submissionId: string }[] = [];
    filteredEvals.forEach((e: Evaluation & { submissions?: Submission }) => {
      if (e.total_score != null && e.max_possible_score) {
        scores.push({
          pct: Math.round((Number(e.total_score) / Number(e.max_possible_score)) * 100),
          studentName: e.submissions?.students?.name || "Unknown",
          className: e.submissions?.classes?.name || "Unknown",
          confidence: Number(e.confidence || 0),
          evalId: e.id,
          submissionId: e.submission_id,
        });
      }
    });

    scores.sort((a, b) => a.pct - b.pct);

    // Distribution
    const distribution = [
      { range: "0-20", count: 0 },
      { range: "21-40", count: 0 },
      { range: "41-60", count: 0 },
      { range: "61-80", count: 0 },
      { range: "81-100", count: 0 },
    ];
    scores.forEach((s) => {
      if (s.pct <= 20) distribution[0].count++;
      else if (s.pct <= 40) distribution[1].count++;
      else if (s.pct <= 60) distribution[2].count++;
      else if (s.pct <= 80) distribution[3].count++;
      else distribution[4].count++;
    });

    // Percentiles
    const p25 = scores.length ? scores[Math.floor(scores.length * 0.25)]?.pct : 0;
    const median = scores.length ? scores[Math.floor(scores.length * 0.5)]?.pct : 0;
    const p75 = scores.length ? scores[Math.floor(scores.length * 0.75)]?.pct : 0;
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b.pct, 0) / scores.length) : 0;

    // Outliers (< Q1 - 1.5*IQR or > Q3 + 1.5*IQR)
    const iqr = p75 - p25;
    const outliers = scores.filter((s) => s.pct < p25 - 1.5 * iqr || s.pct > p75 + 1.5 * iqr);

    // Criteria breakdown
    const criteriaMap: Record<string, { scores: number[]; maxScores: number[]; name: string }> = {};
    filteredEvals.forEach((e: Evaluation & { submissions?: Submission }) => {
      e.criteria_scores?.forEach((cs: { score: number; criteria: { name: string; max_score: number; weight: number } | null }) => {
        const name = cs.criteria?.name || "Unknown";
        if (!criteriaMap[name]) criteriaMap[name] = { scores: [], maxScores: [], name };
        criteriaMap[name].scores.push(Number(cs.score));
        criteriaMap[name].maxScores.push(Number(cs.criteria?.max_score || 5));
      });
    });

    const criteriaBreakdown = Object.values(criteriaMap).map((c) => {
      const avgScore = c.scores.reduce((a, b) => a + b, 0) / c.scores.length;
      const avgMax = c.maxScores.reduce((a, b) => a + b, 0) / c.maxScores.length;
      const avgPct = Math.round((avgScore / avgMax) * 100);
      const mean = avgScore;
      const variance = c.scores.length > 1
        ? Math.round((c.scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / c.scores.length) * 100) / 100
        : 0;
      return { name: c.name, avgScore: Math.round(avgScore * 100) / 100, avgMax: Math.round(avgMax * 100) / 100, avgPct, variance, count: c.scores.length };
    });

    // Confidence analysis
    const confidences = filteredEvals.map((e: Evaluation & { submissions?: Submission }) => Number(e.confidence || 0)).filter((c: number) => c > 0);
    const avgConfidence = confidences.length ? Math.round(confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length) : 0;
    const CONFIDENCE_THRESHOLD = 70;
    const lowConfidence = confidences.filter((c: number) => c < CONFIDENCE_THRESHOLD);
    const lowConfidencePct = confidences.length ? Math.round((lowConfidence.length / confidences.length) * 100) : 0;

    // Per-class performance
    const classMap: Record<string, { scores: number[]; name: string; count: number }> = {};
    scores.forEach((s) => {
      if (!classMap[s.className]) classMap[s.className] = { scores: [], name: s.className, count: 0 };
      classMap[s.className].scores.push(s.pct);
      classMap[s.className].count++;
    });
    const classPerformance = Object.values(classMap).map((c) => ({
      name: c.name,
      avgScore: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
      count: c.count,
    }));

    // AI vs Human gap (evaluations that have been updated/reviewed)
    const reviewedEvals = filteredEvals.filter((e: Evaluation & { submissions?: Submission }) => e.status === "reviewed" || e.status === "approved");

    // Submission status breakdown
    const statusCounts: Record<string, number> = {};
    filteredSubs.forEach((s: Submission) => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });

    // Integrity stats
    const flaggedCount = filteredSubs.filter((s: Submission) => s.status === "flagged").length;
    const needsReviewCount = filteredSubs.filter((s: Submission) => s.status === "needs_review").length;

    // Criteria with unstable scoring (high variance)
    const unstableCriteria = criteriaBreakdown.filter((c) => c.variance > 1.5).sort((a, b) => b.variance - a.variance);

    return {
      scores,
      distribution,
      percentiles: { p25, median, p75 },
      avg,
      outliers,
      criteriaBreakdown,
      avgConfidence,
      lowConfidencePct,
      lowConfidenceCount: lowConfidence.length,
      totalEvaluations: filteredEvals.length,
      classPerformance,
      reviewedEvals,
      statusCounts,
      flaggedCount,
      needsReviewCount,
      unstableCriteria,
      totalSubmissions: filteredSubs.length,
      totalClasses: classes.length,
    };
  }, [filteredEvals, filteredSubs, classes, assignments]);

  return {
    data: computed,
    isLoading: loadingEvals || loadingClasses || loadingSubmissions || loadingAssignments,
    rawEvaluations: filteredEvals,
    rawSubmissions: filteredSubs,
    rawClasses: classes,
    rawAssignments: assignments,
  };
}

// ---- AI Insights ----
const getBackendUrl = () => {
  const evalUrl = import.meta.env.VITE_EVALUATE_API_URL;
  if (evalUrl) {
    try {
      const url = new URL(evalUrl);
      return url.origin;
    } catch (e) {
      return evalUrl.replace(/\/evaluate-sync$/, "");
    }
  }
  return "http://localhost:8000";
};

export function useAIInsights() {
  return useMutation({
    mutationFn: async (analyticsData: Record<string, unknown>) => {
      const response = await fetch(`${getBackendUrl()}/analyze-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_BACKEND_API_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ analyticsData }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "AI analysis failed");
      }
      return response.json();
    },
  });
}
