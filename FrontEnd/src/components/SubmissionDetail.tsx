import { useState, useMemo, useEffect } from "react";
import { ArrowLeft, Brain, BookOpen, Lightbulb, CheckCircle, AlertTriangle, Edit3, Save, X, Star, Shield, Quote, ArrowUp, ScanSearch, Clock, Loader2, Play, ChevronDown, ChevronUp, Terminal, FileText, Settings, Database, Activity, Check, Cpu, Network, RefreshCw } from "lucide-react";
import { escapeHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateEvaluation, useUpdateSubmissionStatus, useUpdateCriteriaScore, useEvaluateSubmission } from "@/hooks/useData";
import { toast } from "sonner";


interface SubmissionDetailProps {
  submission: any;
  onBack: () => void;
}

const PHASES = [
  { key: "phase_0_ingestion", label: "0. Ingest Manuscript", desc: "Extract and parse text from PDF/TXT document" },
  { key: "phase_1a_rubric", label: "1.1. Build Rubric Tree", desc: "Generate rubric dimensions based on venue and assignment" },
  { key: "phase_1b_retrieval", label: "1.2. Retrieve Literature", desc: "Search literature databases for related papers" },
  { key: "phase_2_features", label: "2.1. Extract Features", desc: "Compute quantitative text features and readability scores" },
  { key: "phase_2b_ref_validation", label: "2.2. Validate References", desc: "Cross-reference citations with Crossref/OpenAlex" },
  { key: "phase_3_evidence", label: "3.1. Evidence Audit", desc: "Assess factual claims and citation similarity" },
  { key: "phase_3b_novelty", label: "3.2. Novelty Assessment", desc: "Analyze research novelty and claim redundancy" },
  { key: "phase_4_1_deliberation", label: "4.1. Deliberation", desc: "Run multi-persona deliberation (methodology, domain, style)" },
  { key: "phase_4_2_supervisor", label: "4.2. Supervisor Check", desc: "Run red-line verification and validation checks" },
  { key: "phase_5_calibration", label: "5. Score Calibration", desc: "Calibrate score based on venue expectations" },
];

const statusFlow = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "evaluating", label: "Evaluating", icon: Loader2 },
  { key: "ai_graded", label: "AI Graded", icon: Brain },
  { key: "human_reviewed", label: "Human Reviewed", icon: Shield },
  { key: "approved", label: "Approved", icon: CheckCircle },
];

const getPdfUrl = (submission: any) => {
  if (submission?.pdf_path) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const cleanUrl = supabaseUrl.replace(/\/$/, "");
    return `${cleanUrl}/storage/v1/object/public/pdfs/${submission.pdf_path}`;
  }
  const evaluateUrl = import.meta.env.VITE_EVALUATE_API_URL || "http://localhost:8000/evaluate-sync";
  try {
    const origin = new URL(evaluateUrl).origin;
    return `${origin}/static/pdfs/${submission.id}.pdf`;
  } catch (e) {
    return `http://localhost:8000/static/pdfs/${submission.id}.pdf`;
  }
};

// Parse the structured explanation our edge function writes:
//   [Level: Proficient (4/5) · Confidence 82%]
//   <why text>
//   💡 To improve: <next-step>
function parseExplanation(raw?: string | null) {
  if (!raw) return { level: null as string | null, confidence: null as number | null, why: "", improve: "" };
  let level: string | null = null;
  let confidence: number | null = null;
  let body = raw;

  const headerMatch = raw.match(/^\[Level:\s*([^·\]]+?)(?:\s*\(([^)]+)\))?\s*·\s*Confidence\s*(\d+)%\]\s*\n?/);
  if (headerMatch) {
    level = headerMatch[1].trim();
    confidence = Number(headerMatch[3]);
    body = raw.slice(headerMatch[0].length);
  }

  let why = body;
  let improve = "";
  const improveIdx = body.indexOf("💡 To improve:");
  if (improveIdx >= 0) {
    why = body.slice(0, improveIdx).trim();
    improve = body.slice(improveIdx + "💡 To improve:".length).trim();
  }
  return { level, confidence, why: why.trim(), improve };
}

export function SubmissionDetail({ submission, onBack }: SubmissionDetailProps) {
  const evaluation = submission.evaluations?.[0];
  const scorePercent = evaluation?.max_possible_score
    ? Math.round((Number(evaluation.total_score) / Number(evaluation.max_possible_score)) * 100)
    : null;

  const [isEditing, setIsEditing] = useState(false);
  const [editFeedback, setEditFeedback] = useState({
    overall_feedback: evaluation?.overall_feedback || "",
    improvement_suggestions: evaluation?.improvement_suggestions || "",
    total_score: evaluation?.total_score || 0,
  });
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editScoreValue, setEditScoreValue] = useState<number>(0);
  const [editScoreExplanation, setEditScoreExplanation] = useState("");

  const [hasPdf, setHasPdf] = useState(false);
  const [viewMode, setViewMode] = useState<"text" | "pdf">("text");
  const pdfUrl = getPdfUrl(submission);

  useEffect(() => {
    if (submission?.pdf_path) {
      setHasPdf(true);
      setViewMode("pdf");
      return;
    }

    fetch(pdfUrl, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          setHasPdf(true);
          setViewMode("pdf");
        } else {
          setHasPdf(false);
          setViewMode("text");
        }
      })
      .catch(() => {
        setHasPdf(false);
        setViewMode("text");
      });
  }, [pdfUrl, submission?.pdf_path]);

  const [phaseData, setPhaseData] = useState<Record<string, any>>({});
  const [prevStatus, setPrevStatus] = useState(submission.status);

  useEffect(() => {
    if (submission.status === "evaluating" && prevStatus !== "evaluating") {
      setPhaseData({});
    }
    setPrevStatus(submission.status);
  }, [submission.status, prevStatus]);

  useEffect(() => {
    const evaluateUrl = import.meta.env.VITE_EVALUATE_API_URL || "http://localhost:8000/evaluate-sync";
    let origin = "http://localhost:8000";
    try {
      origin = new URL(evaluateUrl).origin;
    } catch (e) {
      // fallback
    }

    let isMounted = true;
    let interval: any;

    const checkPhases = async () => {
      setPhaseData((current) => {
        const missingKeys = PHASES.filter(p => !current[p.key]).map(p => p.key);
        if (missingKeys.length === 0) {
          if (interval) clearInterval(interval);
          return current;
        }

        Promise.all(
          missingKeys.map(async (key) => {
            try {
              const res = await fetch(`${origin}/static/eval_output/${submission.id}/phases/${key}.json`);
              if (res.ok) {
                const json = await res.json();
                if (isMounted) {
                  setPhaseData(prev => ({
                    ...prev,
                    [key]: json
                  }));
                }
              }
            } catch (err) {
              // not ready yet
            }
          })
        );

        return current;
      });
    };

    if (submission.status === "evaluating") {
      checkPhases();
      interval = setInterval(checkPhases, 2000);
    } else if (submission.status !== "pending") {
      checkPhases();
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [submission.status, submission.id]);

  const updateEvaluation = useUpdateEvaluation();
  const updateStatus = useUpdateSubmissionStatus();
  const updateCriteriaScore = useUpdateCriteriaScore();
  const evaluateSubmission = useEvaluateSubmission();
  const [evaluating, setEvaluating] = useState(false);

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      await evaluateSubmission.mutateAsync(submission.id);
      toast.success("AI evaluation complete!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEvaluating(false);
    }
  };


  const handleSaveFeedback = async () => {
    if (!evaluation) return;
    try {
      await updateEvaluation.mutateAsync({ id: evaluation.id, ...editFeedback });
      toast.success("Evaluation updated");
      setIsEditing(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveCriteriaScore = async (csId: string) => {
    try {
      await updateCriteriaScore.mutateAsync({ id: csId, score: editScoreValue, explanation: editScoreExplanation });
      toast.success("Score updated");
      setEditingScoreId(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatus.mutateAsync({ id: submission.id, status: newStatus });
      toast.success(`Status changed to ${newStatus.replace("_", " ")}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const displayStatus = (submission.status === "needs_review" || submission.status === "flagged") ? "ai_graded" : submission.status;
  const currentStatusIndex = statusFlow.findIndex(s => s.key === displayStatus);
  const currentStatus = statusFlow.find(s => s.key === displayStatus);

  const criteriaScores = evaluation?.criteria_scores || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{submission.students?.name || "Unknown Student"}</h2>
            <p className="text-xs text-muted-foreground">
              {submission.classes?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={
            displayStatus === "pending" ? "bg-muted text-muted-foreground border-border" :
              displayStatus === "evaluating" ? "bg-primary/10 text-primary border-primary/20" :
                displayStatus === "ai_graded" ? "bg-accent text-accent-foreground border-accent" :
                  displayStatus === "human_reviewed" ? "bg-primary/10 text-primary border-primary/20" :
                    displayStatus === "approved" ? "bg-success/10 text-success border-success/20" :
                      ""
          }>
            {currentStatus?.label || displayStatus}
          </Badge>
        </div>
      </div>

      {/* Status Pipeline */}
      <div className="bg-card rounded-xl border border-border pt-6 px-6 pb-10 shadow-sm overflow-hidden relative mb-4">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-accent" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">
          Review Pipeline
        </p>
        <div className="relative flex items-center justify-between w-full px-6">
          {/* Connecting background line */}
          <div className="absolute left-12 right-12 top-[20px] h-0.5 bg-muted rounded-full z-0" />

          {/* Connecting active line */}
          <div
            className="absolute left-12 top-[20px] h-0.5 bg-primary rounded-full transition-all duration-500 z-0"
            style={{ width: `calc(${(currentStatusIndex / (statusFlow.length - 1)) * 100}% - ${currentStatusIndex === 0 ? 0 : 32}px)` }}
          />

          {statusFlow.map((step, i) => {
            const isActive = step.key === displayStatus;
            const isPast = i < currentStatusIndex;
            const StepIcon = step.icon;

            return (
              <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center border transition-all duration-300 ${isActive
                    ? "bg-background border-primary text-primary shadow-[0_0_12px_rgba(59,130,246,0.3)] scale-110"
                    : isPast
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-muted text-muted-foreground"
                    }`}
                >
                  {StepIcon && <StepIcon className={`h-5 w-5 ${isActive && step.key === "evaluating" ? "animate-spin" : ""}`} />}
                </div>
                <span
                  className={`text-xs mt-3 font-medium transition-colors ${isActive
                    ? "text-primary font-semibold"
                    : isPast
                      ? "text-foreground"
                      : "text-muted-foreground"
                    }`}
                >
                  {step.label}
                </span>
                {isActive && (
                  <span className="absolute -bottom-6 text-[9px] font-semibold text-primary animate-pulse bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 whitespace-nowrap">
                    Active
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      {evaluation && (
        <div className="flex items-center gap-2 flex-wrap">
          {(displayStatus === "ai_graded") && (
            <>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(!isEditing)} aria-label={isEditing ? "Cancel editing evaluation" : "Edit evaluation"}>
                <Edit3 className="h-3.5 w-3.5 mr-1" /> {isEditing ? "Cancel Edit" : "Edit Evaluation"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("human_reviewed")} aria-label="Mark as reviewed">
                <Shield className="h-3.5 w-3.5 mr-1" /> Mark as Reviewed
              </Button>
              <Button size="sm" onClick={() => handleStatusChange("approved")} className="bg-success hover:bg-success/90 text-success-foreground" aria-label="Approve evaluation">
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
            </>
          )}
          {submission.status === "human_reviewed" && (
            <>
              <Button size="sm" onClick={() => handleStatusChange("approved")} className="bg-success hover:bg-success/90 text-success-foreground" aria-label="Approve final grade">
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve Final Grade
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("ai_graded")} aria-label="Cancel human review">
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </>
          )}
          {submission.status === "approved" && (
            <Badge className="bg-success/10 text-success border-success/20 px-3 py-1">
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approved
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Document */}
        <div className="flex flex-col gap-6">
          <div className="bg-card rounded-lg shadow-card border border-border p-6 flex flex-col h-[750px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Submission
              </h3>
              {hasPdf && (
                <div className="flex bg-muted rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setViewMode("pdf")}
                    className={`px-3 py-1 rounded-md transition-all ${viewMode === "pdf" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    PDF View
                  </button>
                  <button
                    onClick={() => setViewMode("text")}
                    className={`px-3 py-1 rounded-md transition-all ${viewMode === "text" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Text View
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {viewMode === "pdf" ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-0 rounded-md bg-muted"
                  title="PDF Submission Viewer"
                />
              ) : (
                <div
                  className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: escapeHtml(submission.content || "") }}
                />
              )}
            </div>
          </div>

          {/* Trace Panel saved under Submission box (visible after evaluation completes) */}
          {submission.status !== "evaluating" && submission.status !== "pending" && (
            <PipelineTracePanel 
              submission={submission} 
              phaseData={phaseData} 
            />
          )}
        </div>

        {/* Right: Evaluation or Real-time Trace Panel */}
        <div className="space-y-4">
          {submission.status === "evaluating" ? (
            <PipelineTracePanel 
              submission={submission} 
              phaseData={phaseData} 
              isEvaluating={true}
            />
          ) : evaluation ? (
            <>
              {/* Score header */}
              <div className="bg-card rounded-lg shadow-card border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          className="w-20 h-8 text-lg font-bold"
                          value={editFeedback.total_score}
                          onChange={e => setEditFeedback(f => ({ ...f, total_score: Number(e.target.value) }))}
                        />
                        <span className="text-sm text-muted-foreground">/ {evaluation.max_possible_score}</span>
                      </div>
                    ) : (
                      <p className="text-3xl font-bold text-foreground">{scorePercent}%</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Min Criterion Confidence</p>
                    <p className={`text-2xl font-bold ${Number(evaluation.confidence) >= 75 ? "text-success" : "text-warning"}`}>
                      {Math.round(Number(evaluation.confidence))}%
                    </p>
                    {Number(evaluation.confidence) < 75 && (
                      <p className="text-[10px] text-warning flex items-center gap-1 mt-1 justify-end">
                        <AlertTriangle className="h-3 w-3" /> Needs human review
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${scorePercent}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>{evaluation.total_score} / {evaluation.max_possible_score} points</span>
                  <span>{scorePercent}%</span>
                </div>
              </div>

              {/* (multi-pass evaluation trace removed) */}

              {criteriaScores.length > 0 ? (
                <div className="bg-card rounded-lg shadow-card border border-border p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" /> Rubric Breakdown
                    </h4>
                    <Badge variant="outline" className="text-[10px]">{criteriaScores.length} criteria</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">Every score below is anchored to a criterion you defined.</p>
                  <div className="space-y-3">
                    {criteriaScores.map((cs: any) => {
                      const maxScore = cs.criteria?.max_score || 5;
                      const pct = Math.round((cs.score / maxScore) * 100);
                      const isEditingThis = editingScoreId === cs.id;
                      const parsed = parseExplanation(cs.explanation);
                      const noEvidence = !cs.evidence || cs.evidence === "NO_EVIDENCE_IN_SUBMISSION";
                      const hallucinated = !!cs.hallucinated_evidence;
                      const wasOverridden = cs.ai_score != null && Number(cs.ai_score) !== Number(cs.score);

                      return (
                        <div key={cs.id} className="p-3 rounded-lg border border-border bg-background/40">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">{cs.criteria?.name || "Criterion"}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {parsed.level && (
                                  <Badge variant="secondary" className="text-[10px]">{parsed.level}</Badge>
                                )}
                                {parsed.confidence !== null && (
                                  <span className={`text-[10px] ${parsed.confidence >= 75 ? "text-success" : "text-warning"}`}>
                                    Confidence {parsed.confidence}%
                                  </span>
                                )}
                                {!noEvidence && !hallucinated && (
                                  <Badge variant="outline" className="text-[10px] border-success/30 text-success">
                                    <ScanSearch className="h-2.5 w-2.5 mr-1" /> Evidence verified
                                  </Badge>
                                )}
                                {hallucinated && (
                                  <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Quote not in submission
                                  </Badge>
                                )}
                                {noEvidence && (
                                  <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> No evidence found
                                  </Badge>
                                )}
                                {wasOverridden && (

                                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                                    <Edit3 className="h-2.5 w-2.5 mr-1" /> You overrode AI ({cs.ai_score} → {cs.score})
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isEditingThis ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    className="w-16 h-6 text-xs"
                                    value={editScoreValue}
                                    onChange={e => setEditScoreValue(Number(e.target.value))}
                                    max={maxScore}
                                    min={0}
                                  />
                                  <span className="text-xs text-muted-foreground">/ {maxScore}</span>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleSaveCriteriaScore(cs.id)} aria-label="Save score">
                                    <Save className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingScoreId(null)} aria-label="Cancel edit">
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <Badge variant="outline" className={pct >= 70 ? "border-success/30 text-success" : pct >= 40 ? "border-warning/30 text-warning" : "border-destructive/30 text-destructive"}>
                                    {cs.score} / {maxScore}
                                  </Badge>
                                  {(displayStatus === "ai_graded") && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      aria-label={`Edit score for ${cs.criteria?.name || "criterion"}`}
                                      onClick={() => {
                                        setEditingScoreId(cs.id);
                                        setEditScoreValue(cs.score);
                                        setEditScoreExplanation(cs.explanation || "");
                                      }}
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Score bar */}
                          <div className="h-1.5 rounded-full bg-border overflow-hidden mb-2">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          {/* Criterion description (helps verify alignment) */}
                          {cs.criteria?.description && (
                            <p className="text-[11px] text-muted-foreground/80 italic mb-2">
                              Rubric says: {cs.criteria.description}
                            </p>
                          )}

                          {isEditingThis ? (
                            <Textarea
                              className="text-xs min-h-[60px]"
                              value={editScoreExplanation}
                              onChange={e => setEditScoreExplanation(e.target.value)}
                              placeholder="Explanation..."
                            />
                          ) : (
                            <div className="space-y-2">
                              {parsed.why && (
                                <p className="text-xs text-foreground/90 leading-relaxed">{parsed.why}</p>
                              )}
                              {!noEvidence && cs.evidence && (
                                <div className="flex gap-2 text-xs italic text-primary/90 border-l-2 border-primary/40 pl-2 py-0.5">
                                  <Quote className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span>"{cs.evidence}"</span>
                                </div>
                              )}
                              {parsed.improve && (
                                <div className="flex gap-2 text-xs text-foreground bg-warning/5 border border-warning/20 rounded-md px-2 py-1.5">
                                  <ArrowUp className="h-3 w-3 shrink-0 mt-0.5 text-warning" />
                                  <span><span className="font-medium">To reach next level:</span> {parsed.improve}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-warning flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> No rubric criteria were scored
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This evaluation isn't anchored to a rubric. Add criteria in the Rubric tab and re-evaluate.
                  </p>
                </div>
              )}

              {/* Rubric synthesis (replaces generic Overall Feedback) */}
              <div className="bg-card rounded-lg shadow-card border border-border p-5">
                <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" /> Rubric Synthesis
                </h4>
                {isEditing ? (
                  <Textarea
                    className="text-sm min-h-[80px]"
                    value={editFeedback.overall_feedback}
                    onChange={e => setEditFeedback(f => ({ ...f, overall_feedback: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{evaluation.overall_feedback}</p>
                )}
              </div>

              {isEditing && (
                <div className="flex gap-2">
                  <Button onClick={handleSaveFeedback} disabled={updateEvaluation.isPending} className="flex-1">
                    <Save className="h-3.5 w-3.5 mr-1" /> Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                </div>
              )}

              {/* Prioritized gaps (criterion-anchored) */}
              {evaluation.improvement_suggestions && (
                <div className="bg-card rounded-lg shadow-card border border-border p-5">
                  <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-warning" /> Top Gaps by Criterion
                  </h4>
                  {isEditing ? (
                    <Textarea
                      className="text-sm min-h-[60px]"
                      value={editFeedback.improvement_suggestions}
                      onChange={e => setEditFeedback(f => ({ ...f, improvement_suggestions: e.target.value }))}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{evaluation.improvement_suggestions}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-card rounded-lg shadow-card border border-border p-12 text-center flex flex-col items-center justify-center gap-3">
              <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-1" />
              <p className="text-sm text-muted-foreground">No evaluation yet.</p>
              <Button onClick={handleEvaluate} disabled={evaluating}>
                {evaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {evaluating ? "Evaluating..." : "Run AI Evaluation"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real-time Agentic Pipeline Trace Components
// ---------------------------------------------------------------------------

interface PipelineTracePanelProps {
  submission: any;
  phaseData: Record<string, any>;
  isEvaluating?: boolean;
}

const getPhaseIcon = (key: string) => {
  switch (key) {
    case "phase_0_ingestion": return FileText;
    case "phase_1a_rubric": return Settings;
    case "phase_1b_retrieval": return Database;
    case "phase_2_features": return Activity;
    case "phase_2b_ref_validation": return Check;
    case "phase_3_evidence": return Network;
    case "phase_3b_novelty": return Lightbulb;
    case "phase_4_1_deliberation": return Brain;
    case "phase_4_2_supervisor": return Shield;
    case "phase_5_calibration": return Cpu;
    default: return Terminal;
  }
};

export function PipelineTracePanel({ submission, phaseData, isEvaluating = false }: PipelineTracePanelProps) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const phasesWithStatus = useMemo(() => {
    let foundFirstUncompleted = false;
    return PHASES.map((phase) => {
      const data = phaseData[phase.key];
      const completed = !!data;
      let status: "completed" | "processing" | "pending" = "pending";

      if (completed) {
        status = "completed";
      } else if (submission.status === "evaluating" && !foundFirstUncompleted) {
        status = "processing";
        foundFirstUncompleted = true;
      }

      return {
        ...phase,
        status,
        data,
      };
    });
  }, [phaseData, submission.status]);

  const completedCount = Object.keys(phaseData).length;
  const progressPercent = Math.round((completedCount / PHASES.length) * 100);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-accent" />
      
      <div className="p-5 border-b border-border bg-background/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className={`h-5 w-5 text-primary ${isEvaluating ? "animate-pulse" : ""}`} />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Agentic Pipeline Trace</h3>
              <p className="text-xs text-muted-foreground">
                {isEvaluating ? "Real-time execution log of grading agents" : "Saved intermediate output logs"}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] font-mono">
            {completedCount} / {PHASES.length} Phases
          </Badge>
        </div>

        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-4 divide-y divide-border/60 max-h-[600px] overflow-y-auto">
        {phasesWithStatus.map((phase) => {
          const IconComponent = getPhaseIcon(phase.key);
          const isExpanded = expandedPhase === phase.key;
          const isCompleted = phase.status === "completed";
          const isProcessing = phase.status === "processing";

          return (
            <div key={phase.key} className="py-3 first:pt-0 last:pb-0">
              <div 
                className={`flex items-center justify-between cursor-pointer rounded-lg p-2 transition-all hover:bg-muted/50 ${isExpanded ? "bg-muted/30" : ""}`}
                onClick={() => {
                  if (isCompleted) {
                    setExpandedPhase(isExpanded ? null : phase.key);
                  }
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center border transition-all ${
                    isCompleted 
                      ? "bg-success/10 border-success/30 text-success shadow-[0_0_8px_rgba(34,197,94,0.15)]" 
                      : isProcessing 
                        ? "bg-primary/10 border-primary/30 text-primary animate-pulse" 
                        : "bg-background border-border text-muted-foreground"
                  }`}>
                    {isProcessing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconComponent className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${isCompleted ? "text-foreground" : isProcessing ? "text-primary" : "text-muted-foreground"}`}>
                      {phase.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[280px]">
                      {phase.desc}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCompleted && (
                    <Badge variant="outline" className="text-[9px] bg-success/5 border-success/20 text-success py-0 px-1.5">
                      Completed
                    </Badge>
                  )}
                  {isProcessing && (
                    <Badge variant="outline" className="text-[9px] bg-primary/5 border-primary/20 text-primary py-0 px-1.5 animate-pulse">
                      Running
                    </Badge>
                  )}
                  {phase.status === "pending" && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-muted-foreground border-border bg-transparent">
                      Pending
                    </Badge>
                  )}
                  {isCompleted && (
                    isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && isCompleted && (
                <div className="mt-2 ml-11 p-3 rounded-lg border border-border bg-background/50 text-xs text-foreground space-y-2 animate-fade-in">
                  {renderPhaseDetails(phase.key, phase.data)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderPhaseDetails(key: string, data: any) {
  if (!data) return <p className="text-muted-foreground italic">No details available</p>;

  switch (key) {
    case "phase_0_ingestion": {
      return (
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">{data.title || "Untitled Manuscript"}</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <div>Word Count: <span className="text-foreground font-mono">{data.word_count || 0}</span></div>
            <div>Language: <span className="text-foreground font-mono">{data.language || "en"}</span></div>
            <div>References: <span className="text-foreground font-mono">{data.references?.length || 0}</span></div>
            <div>Citations: <span className="text-foreground font-mono">{data.inline_citations?.length || 0}</span></div>
          </div>
        </div>
      );
    }
    case "phase_1a_rubric": {
      const dims = data.dimensions || [];
      return (
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">Generated Rubric Criteria:</p>
          <ul className="space-y-1 pl-3 list-disc text-muted-foreground text-[11px]">
            {dims.map((d: any, idx: number) => (
              <li key={idx}>
                <span className="text-foreground font-medium">{d.label}</span> (weight: {d.weight})
                {d.children && d.children.length > 0 && (
                  <ul className="pl-3 list-circle space-y-0.5 mt-0.5">
                    {d.children.map((c: any, cidx: number) => (
                      <li key={cidx}>{c.label} (weight: {c.weight})</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "phase_1b_retrieval": {
      const entries = data.entries || [];
      const keywords = data.query_keywords || [];
      return (
        <div className="space-y-2">
          {keywords.length > 0 && (
            <div>
              <span className="font-semibold text-foreground">Search Keywords: </span>
              <span className="text-muted-foreground text-[11px] font-mono">{keywords.join(", ")}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <span className="font-semibold text-foreground">Retrieved Related Papers:</span>
            {entries.length === 0 ? (
              <p className="text-muted-foreground italic text-[11px]">No entries found</p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {entries.map((entry: any, idx: number) => (
                  <div key={idx} className="p-1.5 bg-muted/40 rounded text-[11px] space-y-0.5">
                    <p className="font-medium text-foreground line-clamp-1">{entry.title}</p>
                    <div className="flex justify-between text-muted-foreground text-[10px]">
                      <span>{entry.authors?.slice(0, 2).join(", ") || "Unknown Authors"} ({entry.year || "N/A"})</span>
                      <span className="text-primary font-mono font-medium">Sim: {(entry.relevance_score || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    case "phase_2_features": {
      const values = data.values || {};
      const featuresList = Object.values(values);
      return (
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">Quantitative Text Features:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
            {featuresList.map((f: any, idx: number) => {
              const zVal = f.z_score;
              const isHigh = zVal !== null && zVal > 1.5;
              const isLow = zVal !== null && zVal < -1.5;
              return (
                <div key={idx} className="flex justify-between items-center p-1 bg-muted/40 rounded text-[11px]">
                  <span className="text-muted-foreground truncate max-w-[120px]" title={f.label}>{f.label || f.id}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium">{f.raw_value?.toFixed(2)}</span>
                    {zVal !== null && (
                      <span className={`text-[9px] px-1 rounded font-mono font-medium ${
                        isHigh ? "bg-destructive/10 text-destructive border border-destructive/20" : isLow ? "bg-warning/10 text-warning border border-warning/20" : "bg-success/10 text-success border border-success/20"
                      }`}>
                        Z: {zVal.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case "phase_2b_ref_validation": {
      const results = data.results || [];
      const verifiedRatio = data.verified_ratio || 0;
      const fabricated = data.fabricated_refs || [];
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Verified References:</span>
            <span className="font-mono font-bold text-success">{(verifiedRatio * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-success rounded-full" style={{ width: `${verifiedRatio * 100}%` }} />
          </div>
          {fabricated.length > 0 && (
            <div className="p-1.5 bg-destructive/10 border border-destructive/20 text-destructive rounded text-[10px] flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Flagged fabricated: {fabricated.join(", ")}</span>
            </div>
          )}
          <div className="max-h-24 overflow-y-auto space-y-1 pr-1 text-[10px]">
            {results.map((r: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center py-0.5 border-b border-border/40 last:border-0">
                <span className="text-muted-foreground font-mono truncate max-w-[120px]">{r.ref_id}</span>
                <div className="flex items-center gap-1">
                  <span className="capitalize text-muted-foreground">{r.source || "unverified"}</span>
                  <Badge variant="outline" className={`text-[8px] py-0 px-1 leading-none ${
                    r.status === "verified" || r.status === "likely_valid"
                      ? "border-success/30 bg-success/5 text-success"
                      : "border-destructive/30 bg-destructive/5 text-destructive"
                  }`}>
                    {r.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "phase_3_evidence": {
      const uncited = data.uncited_claims || [];
      const lowSim = data.low_similarity_citations || [];
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2 bg-muted/40 rounded border border-border/40">
              <p className="text-lg font-bold text-warning font-mono">{uncited.length}</p>
              <p className="text-[9px] text-muted-foreground font-medium">Uncited Claims</p>
            </div>
            <div className="p-2 bg-muted/40 rounded border border-border/40">
              <p className="text-lg font-bold text-destructive font-mono">{lowSim.length}</p>
              <p className="text-[9px] text-muted-foreground font-medium">Weak Citations</p>
            </div>
          </div>
          {(uncited.length > 0 || lowSim.length > 0) && (
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {uncited.slice(0, 2).map((c: any, idx: number) => (
                <div key={idx} className="p-1.5 bg-warning/5 border border-warning/10 rounded text-[10px] text-muted-foreground">
                  <span className="font-semibold text-warning">Uncited claim:</span> "{c.text?.slice(0, 100)}..."
                </div>
              ))}
              {lowSim.slice(0, 2).map((c: any, idx: number) => (
                <div key={idx} className="p-1.5 bg-destructive/5 border border-destructive/10 rounded text-[10px] text-muted-foreground">
                  <span className="font-semibold text-destructive">Weak support (sim={c.evidence_similarity?.toFixed(2)}):</span> "{c.text?.slice(0, 100)}..."
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "phase_3b_novelty": {
      const claims = data.claims || [];
      return (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-foreground">Novelty Score:</span>
            <span className="font-mono font-bold text-primary">{((data.overall_novelty_score || 0) * 100).toFixed(0)}/100</span>
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
            {claims.map((c: any, idx: number) => (
              <div key={idx} className="p-1.5 bg-muted/40 rounded text-[10px] space-y-1">
                <p className="text-muted-foreground italic">"{c.claim_text?.slice(0, 80)}..."</p>
                <div className="flex justify-between items-center text-[9px]">
                  <span className="text-muted-foreground truncate max-w-[150px]">Closest: {c.closest_paper_title?.slice(0, 30) || "None"}</span>
                  <Badge className={`text-[8px] py-0 px-1 leading-none ${
                    c.classification === "NOVEL" 
                      ? "bg-success/10 text-success border border-success/20" 
                      : c.classification === "INCREMENTAL"
                        ? "bg-warning/10 text-warning border border-warning/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}>
                    {c.classification}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "phase_4_1_deliberation": {
      const reviews = data.persona_reviews || [];
      return (
        <div className="space-y-2">
          <div className="flex justify-between items-center border-b border-border/40 pb-1">
            <span className="font-semibold text-foreground">Consensus score:</span>
            <span className="font-mono font-bold text-primary">{((data.final_score || 0) * 100).toFixed(0)}%</span>
          </div>
          <div className="space-y-1.5">
            {reviews.map((r: any, idx: number) => (
              <div key={idx} className="p-1.5 bg-muted/40 rounded text-[11px] space-y-1">
                <div className="flex justify-between items-center font-semibold text-foreground">
                  <span className="capitalize">{r.persona} Expert</span>
                  <span className="font-mono text-primary font-medium">{Math.round(r.overall_score * 100)}%</span>
                </div>
                <p className="text-muted-foreground text-[10px] italic line-clamp-2">"{r.summary}"</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "phase_4_2_supervisor": {
      const violations = data.violations || [];
      const passed = data.passed;
      return (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-foreground">Supervisor Check:</span>
            <Badge className={passed ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
              {passed ? "PASSED" : "FAILED"}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground space-y-1">
            <div>Regen count: <span className="font-mono text-foreground font-medium">{data.regen_count || 0}</span></div>
            <div>Human flag: <span className="font-mono text-foreground font-medium">{data.human_flag ? "Required" : "Not needed"}</span></div>
          </div>
          {violations.length > 0 && (
            <div className="p-1.5 bg-destructive/10 border border-destructive/20 text-destructive rounded text-[10px] space-y-1">
              <span className="font-semibold">Violations:</span>
              <ul className="list-disc pl-3 text-[9px] space-y-0.5">
                {violations.map((v: any, idx: number) => (
                  <li key={idx} className="break-all">{v.rule_id}: {v.detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "phase_5_calibration": {
      const comp = data.comparative || {};
      const statements = comp.comparative_statements || [];
      return (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
            <div className="p-1 bg-muted/40 rounded border border-border/40">
              <p className="text-muted-foreground text-[9px]">Calibrated Score</p>
              <p className="text-sm font-bold text-success font-mono">{(data.calibrated_score * 100)?.toFixed(0)}%</p>
            </div>
            <div className="p-1 bg-muted/40 rounded border border-border/40">
              <p className="text-muted-foreground text-[9px]">Percentile (Venue: {comp.venue_tier || "N/A"})</p>
              <p className="text-sm font-bold text-primary font-mono">{comp.overall_percentile || 50}th</p>
            </div>
          </div>
          {statements.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
              {statements.map((stmt: string, idx: number) => (
                <div key={idx} className="flex gap-1 items-start">
                  <span className="text-primary font-bold">•</span>
                  <span>{stmt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    default:
      return <pre className="font-mono text-[9px] bg-muted/30 p-2 rounded overflow-auto max-h-32">{JSON.stringify(data, null, 2)}</pre>;
  }
}

