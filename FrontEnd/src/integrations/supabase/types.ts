export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          class_id: string
          created_at: string
          description: string | null
          id: string
          rubric_id: string | null
          status: string
          submission_type: string | null
          target_venue: string | null
          title: string
          updated_at: string
          use_agentic_evaluation: boolean
        }
        Insert: {
          class_id: string
          created_at?: string
          description?: string | null
          id?: string
          rubric_id?: string | null
          status?: string
          submission_type?: string | null
          target_venue?: string | null
          title: string
          updated_at?: string
          use_agentic_evaluation?: boolean
        }
        Update: {
          class_id?: string
          created_at?: string
          description?: string | null
          id?: string
          rubric_id?: string | null
          status?: string
          submission_type?: string | null
          target_venue?: string | null
          title?: string
          updated_at?: string
          use_agentic_evaluation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_assignment_links: {
        Row: {
          assignment_id: string
          canvas_assignment_id: number
          canvas_assignment_name: string | null
          canvas_connection_id: string
          created_at: string
          id: string
        }
        Insert: {
          assignment_id: string
          canvas_assignment_id: number
          canvas_assignment_name?: string | null
          canvas_connection_id: string
          created_at?: string
          id?: string
        }
        Update: {
          assignment_id?: string
          canvas_assignment_id?: number
          canvas_assignment_name?: string | null
          canvas_connection_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      canvas_connections: {
        Row: {
          access_token: string | null
          auto_sync_enabled: boolean
          canvas_course_id: number
          canvas_course_name: string | null
          canvas_domain: string
          class_id: string
          created_at: string
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          sync_interval_minutes: number
          token_secret_name: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          auto_sync_enabled?: boolean
          canvas_course_id: number
          canvas_course_name?: string | null
          canvas_domain: string
          class_id: string
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          sync_interval_minutes?: number
          token_secret_name?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          auto_sync_enabled?: boolean
          canvas_course_id?: number
          canvas_course_name?: string | null
          canvas_domain?: string
          class_id?: string
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          sync_interval_minutes?: number
          token_secret_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      canvas_submission_links: {
        Row: {
          canvas_attempt: number | null
          canvas_connection_id: string
          canvas_submission_id: number
          canvas_user_id: number | null
          id: string
          imported_at: string
          submission_id: string
        }
        Insert: {
          canvas_attempt?: number | null
          canvas_connection_id: string
          canvas_submission_id: number
          canvas_user_id?: number | null
          id?: string
          imported_at?: string
          submission_id: string
        }
        Update: {
          canvas_attempt?: number | null
          canvas_connection_id?: string
          canvas_submission_id?: number
          canvas_user_id?: number | null
          id?: string
          imported_at?: string
          submission_id?: string
        }
        Relationships: []
      }
      class_students: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      criteria: {
        Row: {
          created_at: string
          description: string | null
          id: string
          max_score: number
          name: string
          rubric_id: string
          sort_order: number
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          max_score?: number
          name: string
          rubric_id: string
          sort_order?: number
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          max_score?: number
          name?: string
          rubric_id?: string
          sort_order?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "criteria_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria_scores: {
        Row: {
          ai_score: number | null
          confidence: number | null
          created_at: string
          criterion_id: string
          evaluation_id: string
          evidence: string | null
          explanation: string | null
          hallucinated_evidence: boolean | null
          id: string
          score: number
        }
        Insert: {
          ai_score?: number | null
          confidence?: number | null
          created_at?: string
          criterion_id: string
          evaluation_id: string
          evidence?: string | null
          explanation?: string | null
          hallucinated_evidence?: boolean | null
          id?: string
          score: number
        }
        Update: {
          ai_score?: number | null
          confidence?: number | null
          created_at?: string
          criterion_id?: string
          evaluation_id?: string
          evidence?: string | null
          explanation?: string | null
          hallucinated_evidence?: boolean | null
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "criteria_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "criteria_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          confidence: number | null
          confidence_breakdown: Json | null
          content_feedback: string | null
          created_at: string
          grammar_feedback: string | null
          id: string
          improvement_suggestions: string | null
          max_possible_score: number | null
          overall_feedback: string | null
          status: string
          structure_feedback: string | null
          submission_id: string
          total_score: number | null
        }
        Insert: {
          confidence?: number | null
          confidence_breakdown?: Json | null
          content_feedback?: string | null
          created_at?: string
          grammar_feedback?: string | null
          id?: string
          improvement_suggestions?: string | null
          max_possible_score?: number | null
          overall_feedback?: string | null
          status?: string
          structure_feedback?: string | null
          submission_id: string
          total_score?: number | null
        }
        Update: {
          confidence?: number | null
          confidence_breakdown?: Json | null
          content_feedback?: string | null
          created_at?: string
          grammar_feedback?: string | null
          id?: string
          improvement_suggestions?: string | null
          max_possible_score?: number | null
          overall_feedback?: string | null
          status?: string
          structure_feedback?: string | null
          submission_id?: string
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_details: {
        Row: {
          dimension_percentiles: Json | null
          disagreement_flags: string[] | null
          evaluation_id: string
          fabricated_refs: string[] | null
          human_flag: boolean
          id: string
          low_similarity_citations: Json | null
          novelty_claims: Json | null
          novelty_score: number | null
          overall_percentile: number | null
          persona_reviews: Json | null
          pipeline_run_id: string | null
          red_line_violations: Json | null
          uncited_claims: Json | null
          venue_tier: string | null
          verified_ratio: number | null
        }
        Insert: {
          dimension_percentiles?: Json | null
          disagreement_flags?: string[] | null
          evaluation_id: string
          fabricated_refs?: string[] | null
          human_flag?: boolean
          id?: string
          low_similarity_citations?: Json | null
          novelty_claims?: Json | null
          novelty_score?: number | null
          overall_percentile?: number | null
          persona_reviews?: Json | null
          pipeline_run_id?: string | null
          red_line_violations?: Json | null
          uncited_claims?: Json | null
          venue_tier?: string | null
          verified_ratio?: number | null
        }
        Update: {
          dimension_percentiles?: Json | null
          disagreement_flags?: string[] | null
          evaluation_id?: string
          fabricated_refs?: string[] | null
          human_flag?: boolean
          id?: string
          low_similarity_citations?: Json | null
          novelty_claims?: Json | null
          novelty_score?: number | null
          overall_percentile?: number | null
          persona_reviews?: Json | null
          pipeline_run_id?: string | null
          red_line_violations?: Json | null
          uncited_claims?: Json | null
          venue_tier?: string | null
          verified_ratio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_details_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_spans: {
        Row: {
          created_at: string
          criterion_id: string
          end_offset: number | null
          evaluation_id: string
          id: string
          match_score: number | null
          quote: string
          start_offset: number | null
          submission_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          criterion_id: string
          end_offset?: number | null
          evaluation_id: string
          id?: string
          match_score?: number | null
          quote: string
          start_offset?: number | null
          submission_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          criterion_id?: string
          end_offset?: number | null
          evaluation_id?: string
          id?: string
          match_score?: number | null
          quote?: string
          start_offset?: number | null
          submission_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      instructor_corrections: {
        Row: {
          ai_explanation: string | null
          ai_score: number | null
          class_id: string | null
          created_at: string
          criterion_id: string | null
          delta: number | null
          evaluation_id: string
          human_note: string | null
          human_score: number | null
          id: string
          rubric_id: string | null
          submission_id: string
        }
        Insert: {
          ai_explanation?: string | null
          ai_score?: number | null
          class_id?: string | null
          created_at?: string
          criterion_id?: string | null
          delta?: number | null
          evaluation_id: string
          human_note?: string | null
          human_score?: number | null
          id?: string
          rubric_id?: string | null
          submission_id: string
        }
        Update: {
          ai_explanation?: string | null
          ai_score?: number | null
          class_id?: string | null
          created_at?: string
          criterion_id?: string | null
          delta?: number | null
          evaluation_id?: string
          human_note?: string | null
          human_score?: number | null
          id?: string
          rubric_id?: string | null
          submission_id?: string
        }
        Relationships: []
      }
      integrity_signals: {
        Row: {
          ai_text_likelihood: number | null
          avg_sentence_len: number | null
          burstiness: number | null
          created_at: string
          id: string
          max_similarity: number | null
          most_similar_submission_id: string | null
          notes: string | null
          sentence_len_stddev: number | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          ai_text_likelihood?: number | null
          avg_sentence_len?: number | null
          burstiness?: number | null
          created_at?: string
          id?: string
          max_similarity?: number | null
          most_similar_submission_id?: string | null
          notes?: string | null
          sentence_len_stddev?: number | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          ai_text_likelihood?: number | null
          avg_sentence_len?: number | null
          burstiness?: number | null
          created_at?: string
          id?: string
          max_similarity?: number | null
          most_similar_submission_id?: string | null
          notes?: string | null
          sentence_len_stddev?: number | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rubric_quality_metrics: {
        Row: {
          ai_suggestion: string | null
          avg_confidence: number | null
          avg_score: number | null
          criterion_id: string
          effectiveness: string | null
          hallucination_rate: number | null
          id: string
          override_rate: number | null
          rubric_id: string
          sample_count: number
          score_variance: number | null
          updated_at: string
        }
        Insert: {
          ai_suggestion?: string | null
          avg_confidence?: number | null
          avg_score?: number | null
          criterion_id: string
          effectiveness?: string | null
          hallucination_rate?: number | null
          id?: string
          override_rate?: number | null
          rubric_id: string
          sample_count?: number
          score_variance?: number | null
          updated_at?: string
        }
        Update: {
          ai_suggestion?: string | null
          avg_confidence?: number | null
          avg_score?: number | null
          criterion_id?: string
          effectiveness?: string | null
          hallucination_rate?: number | null
          id?: string
          override_rate?: number | null
          rubric_id?: string
          sample_count?: number
          score_variance?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rubrics: {
        Row: {
          class_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_skill_profile: {
        Row: {
          avg_score_pct: number | null
          criterion_name: string
          id: string
          last_evaluated_at: string | null
          recent_score_pct: number | null
          sample_count: number
          student_id: string
          trend: number | null
          updated_at: string
        }
        Insert: {
          avg_score_pct?: number | null
          criterion_name: string
          id?: string
          last_evaluated_at?: string | null
          recent_score_pct?: number | null
          sample_count?: number
          student_id: string
          trend?: number | null
          updated_at?: string
        }
        Update: {
          avg_score_pct?: number | null
          criterion_name?: string
          id?: string
          last_evaluated_at?: string | null
          recent_score_pct?: number | null
          sample_count?: number
          student_id?: string
          trend?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          canvas_user_id: number | null
          created_at: string
          email: string | null
          id: string
          name: string
        }
        Insert: {
          canvas_user_id?: number | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          canvas_user_id?: number | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: string | null
          class_id: string
          content: string
          created_at: string
          id: string
          pdf_path: string | null
          rubric_id: string | null
          source: string
          status: string
          student_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          class_id: string
          content: string
          created_at?: string
          id?: string
          pdf_path?: string | null
          rubric_id?: string | null
          source?: string
          status?: string
          student_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          class_id?: string
          content?: string
          created_at?: string
          id?: string
          pdf_path?: string | null
          rubric_id?: string | null
          source?: string
          status?: string
          student_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
