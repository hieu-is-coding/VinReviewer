import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function levelLabel(score: number, max: number): string {
  if (max <= 0) return "Unscored";
  const pct = (score / max) * 100;
  if (pct >= 90) return "Exemplary";
  if (pct >= 75) return "Proficient";
  if (pct >= 55) return "Developing";
  if (pct >= 30) return "Beginning";
  return "Not Met";
}

// ---------- Evidence verification (anti-hallucination) ----------
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

function diceSimilarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ba = bigrams(a);
  const bb = bigrams(b);
  let overlap = 0;
  for (const [g, c] of ba) {
    const c2 = bb.get(g);
    if (c2) overlap += Math.min(c, c2);
  }
  const total = (a.length - 1) + (b.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
}

function verifyEvidence(quote: string, submission: string) {
  if (!quote || quote === "NO_EVIDENCE_IN_SUBMISSION") {
    return { verified: false, match_score: 0, start_offset: null as number | null, end_offset: null as number | null };
  }
  const subNorm = normalizeForMatch(submission);
  const qNorm = normalizeForMatch(quote);
  if (!qNorm) return { verified: false, match_score: 0, start_offset: null, end_offset: null };
  const idx = subNorm.indexOf(qNorm);
  if (idx >= 0) return { verified: true, match_score: 1, start_offset: idx, end_offset: idx + qNorm.length };
  const win = qNorm.length;
  if (win < 8 || subNorm.length < win) return { verified: false, match_score: 0, start_offset: null, end_offset: null };
  const stride = Math.max(8, Math.floor(win / 6));
  let best = 0, bestStart = -1;
  for (let i = 0; i + win <= subNorm.length; i += stride) {
    const sim = diceSimilarity(qNorm, subNorm.slice(i, i + win));
    if (sim > best) { best = sim; bestStart = i; if (best > 0.95) break; }
  }
  const verified = best >= 0.78;
  return { verified, match_score: best, start_offset: verified ? bestStart : null, end_offset: verified ? bestStart + win : null };
}

const GRADER_SYSTEM = `You are a RUBRIC-ANCHORED academic evaluator. The professor's rubric is the ONLY source of truth.

ABSOLUTE RULES:
1. Score every single criterion in the rubric. No skipping. No merging.
2. Every sentence of feedback MUST cite a specific criterion by name. Generic prose is FORBIDDEN.
3. For each criterion extract at least one EXACT verbatim quote from the submission as evidence. If no relevant text exists, set evidence to "NO_EVIDENCE_IN_SUBMISSION" and score that criterion 0.
4. Score each criterion on its own scale (0 to its max_score). Do not normalize. Do not invent criteria.
5. Per-criterion confidence reflects how clearly the submission maps to THAT criterion's intent.

Output via the submit_rubric_evaluation tool.`;

const graderTool = {
  type: "function",
  function: {
    name: "submit_rubric_evaluation",
    description: "Submit a rubric-anchored evaluation. Every rubric criterion must be scored.",
    parameters: {
      type: "object",
      properties: {
        criteria_scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterion_name: { type: "string" },
              score: { type: "number" },
              max_score: { type: "number" },
              evidence: { type: "string" },
              why_this_score: { type: "string" },
              to_reach_next_level: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["criterion_name", "score", "max_score", "evidence", "why_this_score", "to_reach_next_level", "confidence"],
            additionalProperties: false,
          },
        },
        rubric_synthesis: { type: "string" },
        top_strengths_by_criterion: { type: "array", items: { type: "string" } },
        top_gaps_by_criterion: { type: "array", items: { type: "string" } },
      },
      required: ["criteria_scores", "rubric_synthesis", "top_strengths_by_criterion", "top_gaps_by_criterion"],
      additionalProperties: false,
    },
  },
};

async function callAI(opts: { apiKey: string; model: string; systemPrompt: string; userPrompt: string }) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      tools: [graderTool],
      tool_choice: { type: "function", function: { name: "submit_rubric_evaluation" } },
    }),
  });
  if (!resp.ok) return { ok: false, status: resp.status, errorText: await resp.text(), args: null as any };
  const data = await resp.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  let args: any = null;
  if (tc?.function?.arguments) { try { args = JSON.parse(tc.function.arguments); } catch (_e) { args = null; } }
  return { ok: true, status: 200, args, errorText: "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { submission_id, use_agentic } = body;
    if (!submission_id) throw new Error("submission_id required");

    // -----------------------------------------------------------------------
    // Phase 2, Option C: Thin proxy to BackEnd when agentic evaluation is
    // requested or the assignment is configured for it.
    // -----------------------------------------------------------------------
    const BACKEND_URL = Deno.env.get("BACKEND_URL");
    const BACKEND_API_KEY = Deno.env.get("BACKEND_API_KEY");

    if (BACKEND_URL && BACKEND_API_KEY) {
      const supabaseForCheck = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: subCheck } = await supabaseForCheck
        .from("submissions")
        .select("assignment_id, assignments(submission_type, use_agentic_evaluation)")
        .eq("id", submission_id)
        .single();

      const assignment = (subCheck as any)?.assignments;
      const shouldUseAgentic =
        use_agentic === true ||
        assignment?.use_agentic_evaluation === true ||
        assignment?.submission_type === "research_paper";

      if (shouldUseAgentic) {
        const backendResp = await fetch(`${BACKEND_URL}/evaluate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": BACKEND_API_KEY,
          },
          body: JSON.stringify({ submission_id, use_agentic: true }),
        });
        const backendData = await backendResp.json();
        return new Response(JSON.stringify(backendData), {
          status: backendResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("*, classes(name), students(name), rubrics(name, description)")
      .eq("id", submission_id)
      .single();
    if (subErr || !submission) throw new Error("Submission not found");

    let criteria: any[] = [];
    if (submission.rubric_id) {
      const { data } = await supabase.from("criteria").select("*").eq("rubric_id", submission.rubric_id).order("sort_order");
      criteria = data || [];
    }
    if (!criteria.length) {
      return new Response(
        JSON.stringify({ error: "This assignment has no rubric criteria. Add at least one criterion in the Rubric tab — the AI grades strictly against your rubric." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("submissions").update({ status: "evaluating" }).eq("id", submission_id);

    const totalMaxScore = criteria.reduce((s: number, c: any) => s + Number(c.max_score), 0);
    const rubricBlock = criteria.map((c: any, i: number) => {
      const desc = c.description ? `\n     Description: ${c.description}` : "";
      return `  [${i + 1}] "${c.name}" — max ${c.max_score}, weight ${c.weight}${desc}`;
    }).join("\n");
    const rubricMeta = (submission as any).rubrics
      ? `Rubric: "${(submission as any).rubrics.name}"${(submission as any).rubrics.description ? ` — ${(submission as any).rubrics.description}` : ""}`
      : "Rubric: (unnamed)";

    const userPrompt = `${rubricMeta}
Class: ${(submission as any).classes?.name || "Unknown"}
Student: ${(submission as any).students?.name || "Unknown"}

RUBRIC CRITERIA (use these exact names, in this exact order):
${rubricBlock}

STUDENT SUBMISSION:
---
${submission.content}
---

Evaluate STRICTLY against the rubric above. Return your result by calling submit_rubric_evaluation.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let grader = await callAI({ apiKey: LOVABLE_API_KEY, model: "google/gemini-2.5-pro", systemPrompt: GRADER_SYSTEM, userPrompt });
    if (!grader.ok && (grader.status === 429 || grader.status === 503)) {
      grader = await callAI({ apiKey: LOVABLE_API_KEY, model: "google/gemini-3-flash-preview", systemPrompt: GRADER_SYSTEM, userPrompt });
    }
    if (!grader.ok) {
      await supabase.from("submissions").update({ status: "pending" }).eq("id", submission_id);
      console.error("Grader failed:", grader.status, grader.errorText);
      if (grader.status === 429) return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (grader.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("Grader failed");
    }
    if (!grader.args?.criteria_scores?.length) {
      await supabase.from("submissions").update({ status: "pending" }).eq("id", submission_id);
      throw new Error("Grader returned no criteria scores");
    }

    const graderByName = new Map<string, any>();
    (grader.args.criteria_scores as any[]).forEach((cs) => {
      if (cs?.criterion_name) graderByName.set(String(cs.criterion_name).toLowerCase().trim(), cs);
    });

    const submissionText: string = String(submission.content || "");
    const evidenceSpansToInsert: any[] = [];

    const { data: evalRow, error: evalCreateErr } = await supabase
      .from("evaluations")
      .insert({ submission_id, status: "in_progress" })
      .select().single();
    if (evalCreateErr) throw evalCreateErr;
    const evaluationId = evalRow.id;

    const reconciled = criteria.map((c: any) => {
      const g = graderByName.get(c.name.toLowerCase().trim());
      const max = Number(c.max_score);
      const raw = Number(g?.score ?? 0);
      const score = Math.max(0, Math.min(max, isFinite(raw) ? raw : 0));

      const rawEvidence = g?.evidence ?? "NO_EVIDENCE_IN_SUBMISSION";
      const v = verifyEvidence(rawEvidence, submissionText);
      const noEvidence = !rawEvidence || rawEvidence === "NO_EVIDENCE_IN_SUBMISSION";
      const hallucinated = !noEvidence && !v.verified;

      const selfReport = Number(g?.confidence ?? 60);
      const evidenceBoost = v.verified ? 10 : (noEvidence ? -25 : -40);
      const calibrated = Math.max(0, Math.min(100, Math.round(selfReport + evidenceBoost)));

      const why = g?.why_this_score || "No justification provided.";
      const next = g?.to_reach_next_level || "Strengthen alignment with this criterion.";
      const explanation = `[Level: ${levelLabel(score, max)} (${score}/${max}) · Confidence ${calibrated}%]\n${why}\n\n💡 To improve: ${next}`;

      evidenceSpansToInsert.push({
        evaluation_id: evaluationId, submission_id, criterion_id: c.id,
        quote: noEvidence ? "" : rawEvidence,
        start_offset: v.start_offset, end_offset: v.end_offset,
        verified: v.verified, match_score: Number((v.match_score ?? 0).toFixed(3)),
      });

      return { criterion: c, score, ai_score: score, max, evidence: noEvidence ? "" : rawEvidence, explanation, confidence: calibrated, evidence_verified: v.verified, hallucinated, noEvidence };
    });

    const totalScore = reconciled.reduce((s, r) => s + r.score, 0);
    const minConfidence = reconciled.length ? Math.min(...reconciled.map((r) => r.confidence)) : 0;
    const avgConfidence = reconciled.length ? reconciled.reduce((s, r) => s + r.confidence, 0) / reconciled.length : 0;
    const anyHallucinated = reconciled.some((r) => r.hallucinated);
    const anyNoEvidence = reconciled.some((r) => r.noEvidence);
    const needsReview = anyHallucinated || anyNoEvidence || minConfidence < 70;

    const synthesis = String(grader.args.rubric_synthesis || "").trim() || "Rubric-anchored synthesis unavailable.";
    const gaps: string[] = Array.isArray(grader.args.top_gaps_by_criterion) ? grader.args.top_gaps_by_criterion : [];
    const improvementSuggestions = gaps.length ? gaps.map((g: string) => `• ${g}`).join("\n") : "See per-criterion 'To improve' notes.";

    const confidenceBreakdown = {
      avg: Math.round(avgConfidence),
      min: Math.round(minConfidence),
      evidence_verified_rate: Number((reconciled.filter((r) => r.evidence_verified).length / reconciled.length).toFixed(2)),
      hallucinated_count: reconciled.filter((r) => r.hallucinated).length,
      no_evidence_count: reconciled.filter((r) => r.noEvidence).length,
    };

    const { error: updEvalErr } = await supabase
      .from("evaluations")
      .update({
        total_score: totalScore,
        max_possible_score: totalMaxScore,
        confidence: Math.round(minConfidence),
        confidence_breakdown: confidenceBreakdown,
        overall_feedback: synthesis,
        grammar_feedback: null, content_feedback: null, structure_feedback: null,
        improvement_suggestions: improvementSuggestions,
        status: "completed",
      })
      .eq("id", evaluationId);
    if (updEvalErr) throw updEvalErr;

    const scoresToInsert = reconciled.map((r) => ({
      evaluation_id: evaluationId,
      criterion_id: r.criterion.id,
      score: r.score,
      ai_score: r.ai_score,
      confidence: Math.round(r.confidence),
      hallucinated_evidence: r.hallucinated,
      explanation: r.explanation,
      evidence: r.evidence,
    }));
    if (scoresToInsert.length > 0) {
      const { error: csErr } = await supabase.from("criteria_scores").insert(scoresToInsert);
      if (csErr) console.error("criteria_scores insert error:", csErr);
    }
    if (evidenceSpansToInsert.length > 0) {
      const { error: esErr } = await supabase.from("evidence_spans").insert(evidenceSpansToInsert);
      if (esErr) console.error("evidence_spans insert error:", esErr);
    }

    const newStatus = needsReview ? "needs_review" : "ai_graded";
    await supabase.from("submissions").update({ status: newStatus }).eq("id", submission_id);

    return new Response(
      JSON.stringify({
        evaluation_id: evaluationId, status: newStatus,
        needs_review: needsReview,
        min_confidence: Math.round(minConfidence),
        avg_confidence: Math.round(avgConfidence),
        any_no_evidence: anyNoEvidence, any_hallucinated: anyHallucinated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("evaluate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
