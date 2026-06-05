import { useState, useMemo } from "react";
import { ArrowLeft, Brain, BookOpen, Lightbulb, CheckCircle, AlertTriangle, Edit3, Save, X, Star, Shield, Quote, ArrowUp, ScanSearch } from "lucide-react";
import { escapeHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateEvaluation, useUpdateSubmissionStatus, useUpdateCriteriaScore } from "@/hooks/useData";
import { toast } from "sonner";


interface SubmissionDetailProps {
  submission: any;
  onBack: () => void;
}

const statusFlow = [
  { key: "pending", label: "Pending", color: "bg-muted text-muted-foreground" },
  { key: "evaluating", label: "Evaluating", color: "bg-primary/10 text-primary" },
  { key: "ai_graded", label: "AI Graded", color: "bg-accent text-accent-foreground" },
  { key: "needs_review", label: "Needs Review", color: "bg-warning/10 text-warning" },
  { key: "human_reviewed", label: "Human Reviewed", color: "bg-primary/10 text-primary" },
  { key: "approved", label: "Approved", color: "bg-success/10 text-success" },
];

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

  const updateEvaluation = useUpdateEvaluation();
  const updateStatus = useUpdateSubmissionStatus();
  const updateCriteriaScore = useUpdateCriteriaScore();


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

  const currentStatusIndex = statusFlow.findIndex(s => s.key === submission.status);
  const currentStatus = statusFlow.find(s => s.key === submission.status);

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
          <Badge variant="outline" className={currentStatus?.color || ""}>
            {currentStatus?.label || submission.status}
          </Badge>
        </div>
      </div>

      {/* Status Pipeline */}
      {evaluation && (
        <div className="bg-card rounded-lg shadow-card border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Review Pipeline</p>
          <div className="flex items-center gap-1">
            {statusFlow.map((step, i) => {
              const isActive = step.key === submission.status;
              const isPast = i < currentStatusIndex;
              return (
                <div key={step.key} className="flex items-center gap-1 flex-1">
                  <div className={`flex-1 h-2 rounded-full transition-all ${isPast ? "bg-primary" : isActive ? "bg-primary/60" : "bg-border"}`} />
                  {i < statusFlow.length - 1 && <div className="w-1" />}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            {statusFlow.map((step) => (
              <span key={step.key} className={`text-[10px] ${step.key === submission.status ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {evaluation && (
        <div className="flex items-center gap-2 flex-wrap">
          {(submission.status === "ai_graded" || submission.status === "needs_review") && (
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
            <Button size="sm" onClick={() => handleStatusChange("approved")} className="bg-success hover:bg-success/90 text-success-foreground">
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve Final Grade
            </Button>
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
        <div className="bg-card rounded-lg shadow-card border border-border p-6">
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> Submission
          </h3>
          <div
            className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: escapeHtml(submission.content || "") }}
          />
        </div>

        {/* Right: Evaluation */}
        <div className="space-y-4">
          {evaluation ? (
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
                                  {(submission.status === "ai_graded" || submission.status === "needs_review") && (
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
            <div className="bg-card rounded-lg shadow-card border border-border p-12 text-center">
              <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No evaluation yet. Run AI evaluation from the submissions table.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
