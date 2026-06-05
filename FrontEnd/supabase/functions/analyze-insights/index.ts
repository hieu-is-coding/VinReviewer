import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analyticsData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an expert educational analytics AI working in a RUBRIC-ANCHORED grading platform.

YOUR JOB: Always produce useful, concrete insights from whatever data is provided. Even with limited data (e.g. 3-12 submissions), you MUST analyze what's there — never refuse with "data insufficient". Work with the criteriaBreakdown, distribution, and feedbackSamples given.

GUIDELINES:
- Anchor every insight in a specific rubric criterion when criteriaBreakdown is provided (use the exact criterion name).
- Low avg score on a criterion = a conceptual weakness. High variance = inconsistent understanding / possibly unclear rubric.
- For studentClusters: group by score profile — e.g. "High performers (>80%)", "Mid (50-80%)", "At-risk (<50%)" based on the distribution. Use counts from the distribution buckets.
- For teachingInsights: derive Key Problems from the lowest-scoring criteria, and Suggested Actions as concrete teaching tactics for those criteria.
- For institutionalSummary: write a 2-3 sentence narrative summary of class performance based on avg score, percentiles, and top/bottom criteria. Never say "data insufficient" — summarize what you have.
- Use concrete numbers from the data. Don't fabricate statistics, but DO produce qualitative analysis from feedback samples.

You must always return populated arrays — minimum 2-3 items in each (conceptualWeaknesses, studentClusters, teachingInsights.keyProblems, teachingInsights.suggestedActions).`;

    const userPrompt = `Analyze this evaluation data and provide comprehensive insights:\n\n${JSON.stringify(analyticsData, null, 2)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_analytics_insights",
              description: "Provide structured analytics insights from evaluation data",
              parameters: {
                type: "object",
                properties: {
                  conceptualWeaknesses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        weakness: { type: "string" },
                        percentage: { type: "number" },
                        severity: { type: "string", enum: ["high", "medium", "low"] },
                        detail: { type: "string" },
                      },
                      required: ["weakness", "percentage", "severity", "detail"],
                    },
                  },
                  studentClusters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        count: { type: "number" },
                        strengths: { type: "array", items: { type: "string" } },
                        weaknesses: { type: "array", items: { type: "string" } },
                      },
                      required: ["name", "description", "count", "strengths", "weaknesses"],
                    },
                  },
                  teachingInsights: {
                    type: "object",
                    properties: {
                      keyProblems: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            problem: { type: "string" },
                            urgency: { type: "string", enum: ["high", "medium", "low"] },
                            detail: { type: "string" },
                          },
                          required: ["problem", "urgency", "detail"],
                        },
                      },
                      suggestedActions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            action: { type: "string" },
                            priority: { type: "string", enum: ["high", "medium", "low"] },
                            rationale: { type: "string" },
                          },
                          required: ["action", "priority", "rationale"],
                        },
                      },
                    },
                    required: ["keyProblems", "suggestedActions"],
                  },
                  criteriaInsights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        criterion: { type: "string" },
                        avgScore: { type: "number" },
                        variance: { type: "number" },
                        insight: { type: "string" },
                        confidenceNote: { type: "string" },
                      },
                      required: ["criterion", "avgScore", "variance", "insight", "confidenceNote"],
                    },
                  },
                  writingQuality: {
                    type: "object",
                    properties: {
                      commonIssues: { type: "array", items: { type: "string" } },
                      trends: { type: "array", items: { type: "string" } },
                      overallAssessment: { type: "string" },
                    },
                    required: ["commonIssues", "trends", "overallAssessment"],
                  },
                  rubricEffectiveness: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        criterion: { type: "string" },
                        effectiveness: { type: "string", enum: ["high", "medium", "low"] },
                        issue: { type: "string" },
                      },
                      required: ["criterion", "effectiveness", "issue"],
                    },
                  },
                  institutionalSummary: { type: "string" },
                  improvementSuggestions: { type: "array", items: { type: "string" } },
                },
                required: [
                  "conceptualWeaknesses",
                  "studentClusters",
                  "teachingInsights",
                  "criteriaInsights",
                  "writingQuality",
                  "rubricEffectiveness",
                  "institutionalSummary",
                  "improvementSuggestions",
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_analytics_insights" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const insights = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
