export interface Class {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
}

export interface ClassStudent {
  id: string;
  class_id: string;
  student_id: string;
  students: Student;
}

export interface Rubric {
  id: string;
  name: string;
  description: string | null;
  class_id: string | null;
  created_at: string;
  criteria: Criterion[];
  classes: { name: string } | null;
}

export interface Criterion {
  id: string;
  rubric_id: string;
  name: string;
  description: string | null;
  weight: number;
  max_score: number;
  sort_order: number;
}

export interface CriteriaScore {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  score: number;
  ai_score: number | null;
  explanation: string | null;
  evidence: string | null;
  confidence: number | null;
  hallucinated_evidence: boolean | null;
  criteria: {
    name: string;
    max_score: number;
    weight: number;
  } | null;
}

export interface Evaluation {
  id: string;
  submission_id: string;
  total_score: number;
  max_possible_score: number;
  confidence: number | null;
  overall_feedback: string | null;
  content_feedback: string | null;
  structure_feedback: string | null;
  improvement_suggestions: string | null;
  evaluation_type: string;
  status: string;
  created_at: string;
  criteria_scores: CriteriaScore[];
}

export interface Submission {
  id: string;
  student_id: string;
  class_id: string;
  assignment_id: string | null;
  rubric_id: string | null;
  title: string | null;
  content: string;
  status: string;
  created_at: string;
  students: { name: string } | null;
  classes: { name: string } | null;
  rubrics: { name: string } | null;
  evaluations: Evaluation[];
}

export interface Assignment {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  rubric_id: string | null;
  target_venue: string | null;
  submission_type: string | null;
  use_agentic_evaluation: boolean;
  due_date: string | null;
  created_at: string;
  rubrics: { name: string; id: string } | null;
  submissions: AssignmentSubmission[];
}

export interface AssignmentSubmission {
  id: string;
  student_id: string;
  status: string;
  title: string | null;
  created_at: string;
  students: { name: string } | null;
  evaluations: Evaluation[];
}

export interface EvaluationDetail {
  id: string;
  evaluation_id: string;
  uncited_claims: unknown[];
  low_similarity_citations: unknown[];
  novelty_score: number | null;
  novelty_claims: unknown[];
  persona_reviews: unknown[];
  disagreement_flags: string[];
  red_line_violations: unknown[];
  human_flag: boolean;
  overall_percentile: number | null;
  venue_tier: string | null;
  dimension_percentiles: Record<string, number>;
  verified_ratio: number | null;
  fabricated_refs: string[];
  pipeline_run_id: string | null;
}

export type SubmissionStatus =
  | "pending"
  | "evaluating"
  | "ai_graded"
  | "needs_review"
  | "flagged"
  | "approved";
