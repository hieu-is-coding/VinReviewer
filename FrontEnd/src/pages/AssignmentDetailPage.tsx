import { DashboardLayout } from "@/components/DashboardLayout";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAssignment, useAssignmentSubmissions, useCreateAssignmentSubmission, useUpdateAssignment } from "@/hooks/useAssignments";
import { useClassStudents, useEvaluateSubmission, useUpdateSubmissionStatus, useCreateRubric, useCreateCriterion, useDeleteCriterion, useDeleteRubric } from "@/hooks/useData";
import { useAIInsights } from "@/hooks/useAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Play, Loader2, Eye, CheckCircle, Upload, FileText, Trash2, Star, BarChart3, Puzzle, Users, Brain, AlertTriangle, Target, Shield, Activity, Sparkles, TrendingUp, Award, Lightbulb, Settings } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { SubmissionDetail } from "@/components/SubmissionDetail";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { BulkSubmissionDialog } from "@/components/BulkSubmissionDialog";
import { SectionHeader } from "@/components/analytics/SectionHeader";
import { MiniStat } from "@/components/analytics/MiniStat";

const statusStyles: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  evaluating: "bg-primary/10 text-primary border-primary/20",
  ai_graded: "bg-accent text-accent-foreground border-accent",
  needs_review: "bg-warning/10 text-warning border-warning/20",
  human_reviewed: "bg-primary/10 text-primary border-primary/20",
  approved: "bg-success/10 text-success border-success/20",
};

const AssignmentDetailPage = () => {
  const { classId, assignmentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: assignment, isLoading: assignmentLoading } = useAssignment(assignmentId);
  const { data: submissions, isLoading: subsLoading } = useAssignmentSubmissions(assignmentId);
  const { data: classStudents } = useClassStudents(classId);
  const createSubmission = useCreateAssignmentSubmission();
  const evaluateSubmission = useEvaluateSubmission();
  const updateStatus = useUpdateSubmissionStatus();
  const createRubric = useCreateRubric();
  const createCriterion = useCreateCriterion();
  const deleteCriterion = useDeleteCriterion();
  const deleteRubric = useDeleteRubric();
  const updateAssignment = useUpdateAssignment();

  const [open, setOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [content, setContent] = useState("");
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Rubric management state
  const [critName, setCritName] = useState("");
  const [critDesc, setCritDesc] = useState("");
  const [critWeight, setCritWeight] = useState("1");
  const [critMax, setCritMax] = useState("5");
  const [autoCreatingRubric, setAutoCreatingRubric] = useState(false);

  // Auto-create rubric when assignment has none and user visits rubric tab
  const ensureRubric = async () => {
    if (!assignment || assignment.rubric_id || autoCreatingRubric || !assignmentId || !classId) return;
    setAutoCreatingRubric(true);
    try {
      const rubric = await createRubric.mutateAsync({
        name: assignment.title,
        class_id: classId,
      });
      await updateAssignment.mutateAsync({ id: assignmentId, rubric_id: rubric.id });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAutoCreatingRubric(false);
    }
  };

  const handleDeleteRubric = async (rubricId: string) => {
    if (!assignmentId) return;
    try {
      await updateAssignment.mutateAsync({ id: assignmentId, rubric_id: null });
      await deleteRubric.mutateAsync(rubricId);
      toast.success("Rubric removed");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAddCriterion = async (rubricId: string) => {
    if (!critName.trim()) return toast.error("Criterion name is required");
    try {
      await createCriterion.mutateAsync({
        rubric_id: rubricId,
        name: critName.trim(),
        description: critDesc.trim() || undefined,
        weight: parseFloat(critWeight) || 1,
        max_score: parseInt(critMax) || 5,
      });
      toast.success("Criterion added");
      setCritName("");
      setCritDesc("");
      setCritWeight("1");
      setCritMax("5");
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const [draggingSingle, setDraggingSingle] = useState(false);

  const processPdfFile = async (file: File) => {
    if (file.type !== "application/pdf") { toast.error("Please upload a PDF file"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20MB"); return; }

    setUploadingPdf(true);
    setPdfFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse PDF");
      }
      const { text } = await response.json();
      setContent(text);
      toast.success("PDF text extracted");
    } catch (e: any) {
      toast.error(e.message);
      setPdfFileName(null);
    } finally {
      setUploadingPdf(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processPdfFile(file);
  };

  const handleSingleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingSingle(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processPdfFile(file);
  };

  const handleCreate = async () => {
    if (!studentId || !content.trim()) return toast.error("Student and content are required");
    if (!classId || !assignmentId) return;
    const studentName = classStudents?.find((cs: any) => cs.student_id === studentId)?.students?.name || "Submission";
    try {
      await createSubmission.mutateAsync({
        student_id: studentId,
        class_id: classId,
        assignment_id: assignmentId,
        rubric_id: assignment?.rubric_id || undefined,
        title: studentName,
        content: content.trim(),
      });
      toast.success("Submission added");
      setOpen(false);
      setContent("");
      setStudentId("");
      setPdfFileName(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleBulkSubmitAll = async (items: { studentId: string; studentName: string; content: string }[]) => {
    if (!classId || !assignmentId) return;
    for (const item of items) {
      await createSubmission.mutateAsync({
        student_id: item.studentId,
        class_id: classId,
        assignment_id: assignmentId,
        rubric_id: assignment?.rubric_id || undefined,
        title: item.studentName,
        content: item.content,
      });
    }
    toast.success(`${items.length} submission(s) added!`);
  };


  const hasCriteria = (assignment?.rubrics?.criteria?.length || 0) > 0;

  const handleEvaluate = async (id: string) => {
    if (!hasCriteria) {
      toast.error("Add rubric criteria first — that's how the AI knows what to grade.");
      return;
    }
    setEvaluatingIds(prev => new Set(prev).add(id));
    try {
      await evaluateSubmission.mutateAsync(id);
      toast.success("AI evaluation complete!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEvaluatingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await updateStatus.mutateAsync({ id, status: "approved" });
      toast.success("Approved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Analytics
  const evaluatedSubs = submissions?.filter((s: any) => s.evaluations?.length > 0) || [];
  const scores = evaluatedSubs.map((s: any) => {
    const ev = s.evaluations[0];
    return ev.max_possible_score ? Math.round((Number(ev.total_score) / Number(ev.max_possible_score)) * 100) : 0;
  });
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const distribution = [
    { range: "0-20", count: 0 }, { range: "21-40", count: 0 }, { range: "41-60", count: 0 },
    { range: "61-80", count: 0 }, { range: "81-100", count: 0 },
  ];
  scores.forEach(pct => {
    if (pct <= 20) distribution[0].count++;
    else if (pct <= 40) distribution[1].count++;
    else if (pct <= 60) distribution[2].count++;
    else if (pct <= 80) distribution[3].count++;
    else distribution[4].count++;
  });

  const selectedSub = submissions?.find((s: any) => s.id === selectedSubmission);

  if (selectedSub) {
    return (
      <DashboardLayout>
        <SubmissionDetail submission={selectedSub} onBack={() => setSelectedSubmission(null)} />
      </DashboardLayout>
    );
  }

  if (assignmentLoading) {
    return <DashboardLayout><div className="text-center text-sm text-muted-foreground py-12" role="status" aria-live="polite">Loading...</div></DashboardLayout>;
  }

  if (!assignment) {
    return <DashboardLayout><div className="text-center text-sm text-muted-foreground py-12">Assignment not found</div></DashboardLayout>;
  }

  const rubric = assignment.rubrics;
  const criteria = rubric?.criteria || [];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/classes/${classId}`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {assignment.classes?.name || "Back"}
            </Button>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">{assignment.title}</h2>
              {assignment.description && <p className="text-sm text-muted-foreground mt-0.5">{assignment.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{submissions?.length || 0} submissions</span>
          </div>

        </div>

        <Tabs defaultValue="submissions">
          <TabsList>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="rubric">Rubric</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="h-3.5 w-3.5 mr-1" />Settings</TabsTrigger>
          </TabsList>

          {/* Submissions Tab */}
          <TabsContent value="submissions" className="space-y-4">
            {!hasCriteria && (
              <div className="flex items-start gap-3 bg-warning/5 border border-warning/30 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">No rubric criteria yet</p>
                  <p className="text-xs text-muted-foreground">
                    The AI grades strictly against your rubric. Add at least one criterion so feedback is anchored to what you actually care about.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const trigger = document.querySelector<HTMLButtonElement>('[data-state][value="rubric"], [role="tab"][value="rubric"]');
                  trigger?.click();
                }}>Go to Rubric</Button>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {submissions && submissions.filter((s: any) => s.status === "pending").length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={evaluatingIds.size > 0}
                  onClick={async () => {
                    if (!hasCriteria) {
                      toast.error("Add rubric criteria first — that's how the AI knows what to grade.");
                      return;
                    }
                    const pending = submissions.filter((s: any) => s.status === "pending");
                    const allIds = pending.map((s: any) => s.id);
                    setEvaluatingIds(new Set(allIds));
                    let successCount = 0;
                    for (const s of pending) {
                      try {
                        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                          },
                          body: JSON.stringify({ submission_id: s.id }),
                        });
                        if (!response.ok) {
                          const err = await response.json();
                          toast.error(`Failed for ${s.students?.name || "student"}: ${err.error || "Error"}`);
                        } else {
                          successCount++;
                        }
                      } catch (e: any) {
                        toast.error(`Failed for ${s.students?.name || "student"}: ${e.message}`);
                      }
                      setEvaluatingIds(prev => { const n = new Set(prev); n.delete(s.id); return n; });
                    }
                    // Refresh data after all evaluations
                    queryClient.invalidateQueries({ queryKey: ["submissions"] });
                    queryClient.invalidateQueries({ queryKey: ["evaluations"] });
                    queryClient.invalidateQueries({ queryKey: ["assignment_submissions"] });
                    queryClient.invalidateQueries({ queryKey: ["assignments"] });
                    if (successCount > 0) {
                      toast.success(`${successCount}/${allIds.length} evaluations complete!`);
                    }
                  }}
                >
                  {evaluatingIds.size > 0 ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                  Evaluate All ({submissions.filter((s: any) => s.status === "pending").length})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                <Users className="h-4 w-4 mr-1" /> Bulk Upload
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Submission</Button>
                </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Add Submission</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-foreground">Student</label>
                        <Select value={studentId} onValueChange={setStudentId}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select student" /></SelectTrigger>
                          <SelectContent>
                            {classStudents?.map((cs: any) => (
                              <SelectItem key={cs.student_id} value={cs.student_id}>{cs.students?.name || "Unknown"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Upload PDF or paste text</label>
                        <div className="mt-1 space-y-2">
                          <div
                            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                              draggingSingle
                                ? "border-primary bg-primary/5 scale-[1.01]"
                                : "border-border hover:border-primary/50 hover:bg-accent/30"
                            }`}
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleSingleDrop}
                            onDragOver={(e) => { e.preventDefault(); setDraggingSingle(true); }}
                            onDragLeave={(e) => { e.preventDefault(); setDraggingSingle(false); }}
                          >
                            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                            {uploadingPdf ? (
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <p className="text-sm">Extracting text from PDF...</p>
                              </div>
                            ) : pdfFileName ? (
                              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                                <FileText className="h-4 w-4" /> {pdfFileName}
                                <button className="text-muted-foreground hover:text-destructive ml-1" onClick={(e) => { e.stopPropagation(); setPdfFileName(null); setContent(""); }}>×</button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1.5">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Upload className="h-5 w-5 text-primary" />
                                </div>
                                <p className="text-sm font-medium text-foreground">
                                  {draggingSingle ? "Drop PDF here" : "Drag & drop PDF here"}
                                </p>
                                <p className="text-xs text-muted-foreground">or click to browse · PDF up to 20MB</p>
                              </div>
                            )}
                          </div>
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                            <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or paste text</span></div>
                          </div>
                          <Textarea className="min-h-[120px]" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the student's submission text..." />
                        </div>
                      </div>
                      <Button onClick={handleCreate} disabled={createSubmission.isPending} className="w-full">
                        {createSubmission.isPending ? "Submitting..." : "Submit"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
            </div>

            {subsLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
            ) : submissions && submissions.length > 0 ? (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-medium text-muted-foreground p-4">Student</th>
                      <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-4">Score</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-4">Confidence</th>
                      <th className="text-right text-xs font-medium text-muted-foreground p-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {submissions.map((s: any) => {
                      const ev = s.evaluations?.[0];
                      const isEvaluating = evaluatingIds.has(s.id);
                      const scorePct = ev?.max_possible_score ? Math.round((Number(ev.total_score) / Number(ev.max_possible_score)) * 100) : null;
                      const conf = ev ? Math.round(Number(ev.confidence || 0)) : null;
                      return (
                        <tr key={s.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setSelectedSubmission(s.id)}>
                          <td className="p-4 text-sm font-medium text-foreground">{s.students?.name || "—"}</td>
                          <td className="p-4">
                            <Badge variant="outline" className={statusStyles[s.status] || ""}>{s.status.replace(/_/g, " ")}</Badge>
                          </td>
                          <td className="p-4 text-sm font-semibold text-foreground text-right">{scorePct !== null ? `${scorePct}%` : "—"}</td>
                          <td className="p-4 text-sm text-right">
                            {conf !== null ? (
                              <span className={conf >= 75 ? "text-success" : "text-warning"}>{conf}%</span>
                            ) : "—"}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              {s.status === "pending" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isEvaluating} onClick={() => handleEvaluate(s.id)}>
                                  {isEvaluating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                                  {isEvaluating ? "Evaluating..." : "Evaluate"}
                                </Button>
                              )}
                              {(s.status === "ai_graded" || s.status === "needs_review") && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedSubmission(s.id)}>
                                    <Eye className="h-3 w-3 mr-1" /> Review
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-success" onClick={() => handleApprove(s.id)}>
                                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                                  </Button>
                                </>
                              )}
                              {s.status === "approved" && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedSubmission(s.id)}>
                                  <Eye className="h-3 w-3 mr-1" /> View
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No submissions yet. Add one to get started!</p>
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <AssignmentAnalytics submissions={submissions || []} />
          </TabsContent>

          {/* Rubric Tab */}
          <TabsContent value="rubric" className="space-y-4">
            {rubric ? (              <div className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{rubric.name}</h3>
                    {rubric.description && <p className="text-sm text-muted-foreground mt-0.5">{rubric.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{criteria.length} criteria</Badge>
                    <button
                      onClick={() => handleDeleteRubric(rubric.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Delete rubric"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Existing criteria */}
                {criteria.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {criteria.map((c: any) => (
                      <div key={c.id} className="p-4 rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-foreground">{c.name}</p>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Weight: {c.weight}</span>
                              <span>Max: {c.max_score}</span>
                            </div>
                            <button
                              onClick={() => deleteCriterion.mutateAsync(c.id).then(() => toast.success("Removed")).catch((err: any) => toast.error(err.message))}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              aria-label={`Delete criterion ${c.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add criterion form */}
                <div className={`${criteria.length > 0 ? "border-t border-border pt-4" : ""} space-y-3`}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Add Criterion</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={critName} onChange={(e) => setCritName(e.target.value)} placeholder="e.g. Clarity & Focus" className="text-sm" />
                    <Input value={critDesc} onChange={(e) => setCritDesc(e.target.value)} placeholder="Description (optional)" className="text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Weight</label>
                      <Input type="number" value={critWeight} onChange={(e) => setCritWeight(e.target.value)} className="text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Max Score</label>
                      <Input type="number" value={critMax} onChange={(e) => setCritMax(e.target.value)} className="text-sm" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={() => handleAddCriterion(rubric.id)} disabled={createCriterion.isPending} className="w-full">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                {autoCreatingRubric ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Setting up rubric...
                  </div>
                ) : (
                  <>
                    <Puzzle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">No rubric yet.</p>
                    <Button onClick={ensureRubric} size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Create Rubric
                    </Button>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <AssignmentSettings assignment={assignment} onSave={async (fields) => {
              if (!assignmentId) return;
              try {
                await updateAssignment.mutateAsync({ id: assignmentId, ...fields });
                toast.success("Settings saved");
              } catch (e: any) {
                toast.error(e.message);
              }
            }} />
          </TabsContent>
        </Tabs>

        <BulkSubmissionDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          classStudents={classStudents || []}
          onSubmitAll={handleBulkSubmitAll}
          parsePdfUrl={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-pdf`}
          anonKey={import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}
        />
      </div>
    </DashboardLayout>
  );
};

// ─── Assignment Settings Panel ────────────────────────────────────────────────

function AssignmentSettings({ assignment, onSave }: { assignment: any; onSave: (fields: Record<string, any>) => Promise<void> }) {
  const [submissionType, setSubmissionType] = useState<string>(assignment?.submission_type ?? "essay");
  const [targetVenue, setTargetVenue] = useState<string>(assignment?.target_venue ?? "general");
  const [useAgentic, setUseAgentic] = useState<boolean>(assignment?.use_agentic_evaluation ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ submission_type: submissionType, target_venue: targetVenue, use_agentic_evaluation: useAgentic });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-6 max-w-lg">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Evaluation Settings</h3>
        <p className="text-xs text-muted-foreground">Configure how submissions are evaluated for this assignment.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="submission-type" className="text-sm font-medium">Submission Type</Label>
          <Select value={submissionType} onValueChange={setSubmissionType}>
            <SelectTrigger id="submission-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="essay">Essay (text)</SelectItem>
              <SelectItem value="research_paper">Research Paper (PDF)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Research papers are routed through GROBID for structured PDF parsing.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="target-venue" className="text-sm font-medium">Target Venue</Label>
          <Select value={targetVenue} onValueChange={setTargetVenue}>
            <SelectTrigger id="target-venue">
              <SelectValue placeholder="Select venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="neurips">NeurIPS</SelectItem>
              <SelectItem value="acl">ACL / EMNLP / NAACL</SelectItem>
              <SelectItem value="iclr">ICLR</SelectItem>
              <SelectItem value="icml">ICML</SelectItem>
              <SelectItem value="cvpr">CVPR / ICCV / ECCV</SelectItem>
              <SelectItem value="nature">Nature / Science</SelectItem>
              <SelectItem value="ieee">IEEE Transactions</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used by the pipeline to calibrate scores against venue-specific norms.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="use-agentic" className="text-sm font-medium flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-primary" /> Use Advanced Evaluation
            </Label>
            <p className="text-xs text-muted-foreground">
              Routes submissions through the multi-agent GradingSystem pipeline instead of the simple Gemini evaluator.
            </p>
          </div>
          <Switch id="use-agentic" checked={useAgentic} onCheckedChange={setUseAgentic} />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
        Save Settings
      </Button>
    </div>
  );
}


export default AssignmentDetailPage;

// ═══════════════ Deep Assignment Analytics ═══════════════

const severityColor: Record<string, string> = { high: "text-destructive", medium: "text-warning", low: "text-success" };
const severityBg: Record<string, string> = { high: "bg-destructive/10 border-destructive/20", medium: "bg-warning/10 border-warning/20", low: "bg-success/10 border-success/20" };
const priorityBadge: Record<string, string> = { high: "bg-destructive/10 text-destructive", medium: "bg-warning/10 text-warning", low: "bg-success/10 text-success" };

function AssignmentAnalytics({ submissions }: { submissions: any[] }) {
  const aiInsights = useAIInsights();
  const [insights, setInsights] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setExpandedSections((p) => ({ ...p, [key]: !p[key] }));

  const computed = useMemo(() => {
    const evaluatedSubs = submissions.filter((s: any) => s.evaluations?.length > 0);
    const scores = evaluatedSubs.map((s: any) => {
      const ev = s.evaluations[0];
      return {
        pct: ev.max_possible_score ? Math.round((Number(ev.total_score) / Number(ev.max_possible_score)) * 100) : 0,
        studentName: s.students?.name || "Unknown",
        confidence: Number(ev.confidence || 0),
      };
    }).sort((a, b) => a.pct - b.pct);

    const distribution = [
      { range: "0-20", count: 0 }, { range: "21-40", count: 0 }, { range: "41-60", count: 0 },
      { range: "61-80", count: 0 }, { range: "81-100", count: 0 },
    ];
    scores.forEach((s) => {
      if (s.pct <= 20) distribution[0].count++;
      else if (s.pct <= 40) distribution[1].count++;
      else if (s.pct <= 60) distribution[2].count++;
      else if (s.pct <= 80) distribution[3].count++;
      else distribution[4].count++;
    });

    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b.pct, 0) / scores.length) : 0;
    const p25 = scores.length ? scores[Math.floor(scores.length * 0.25)]?.pct : 0;
    const median = scores.length ? scores[Math.floor(scores.length * 0.5)]?.pct : 0;
    const p75 = scores.length ? scores[Math.floor(scores.length * 0.75)]?.pct : 0;
    const iqr = p75 - p25;
    const outliers = scores.filter((s) => s.pct < p25 - 1.5 * iqr || s.pct > p75 + 1.5 * iqr);

    // Criteria breakdown
    const criteriaMap: Record<string, { scores: number[]; maxScores: number[]; name: string }> = {};
    evaluatedSubs.forEach((s: any) => {
      s.evaluations?.[0]?.criteria_scores?.forEach((cs: any) => {
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
      const variance = c.scores.length > 1 ? Math.round((c.scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / c.scores.length) * 100) / 100 : 0;
      return { name: c.name, avgScore: Math.round(avgScore * 100) / 100, avgMax: Math.round(avgMax * 100) / 100, avgPct, variance, count: c.scores.length };
    });

    const confidences = evaluatedSubs.map((s: any) => Number(s.evaluations[0]?.confidence || 0)).filter((c) => c > 0);
    const avgConfidence = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;
    const lowConfidenceCount = confidences.filter((c) => c < 70).length;
    const lowConfidencePct = confidences.length ? Math.round((lowConfidenceCount / confidences.length) * 100) : 0;
    const unstableCriteria = criteriaBreakdown.filter((c) => c.variance > 1.5).sort((a, b) => b.variance - a.variance);

    return { scores, distribution, avg, p25, median, p75, outliers, criteriaBreakdown, avgConfidence, lowConfidenceCount, lowConfidencePct, unstableCriteria, evaluatedCount: evaluatedSubs.length, totalCount: submissions.length };
  }, [submissions]);

  const handleAnalyze = async () => {
    if (computed.evaluatedCount === 0) return toast.error("No evaluations to analyze");
    try {
      const evaluatedSubs = submissions.filter((s: any) => s.evaluations?.length > 0);
      const payload = {
        totalEvaluations: computed.evaluatedCount,
        avgScore: computed.avg,
        percentiles: { p25: computed.p25, median: computed.median, p75: computed.p75 },
        distribution: computed.distribution,
        criteriaBreakdown: computed.criteriaBreakdown,
        avgConfidence: computed.avgConfidence,
        classPerformance: [],
        outlierCount: computed.outliers.length,
        flaggedCount: 0,
        needsReviewCount: 0,
        reviewedCount: 0,
        feedbackSamples: evaluatedSubs.slice(0, 10).map((s: any) => {
          const ev = s.evaluations[0];
          return {
            overallFeedback: ev.overall_feedback?.slice(0, 200),
            contentFeedback: ev.content_feedback?.slice(0, 200),
            grammarFeedback: ev.grammar_feedback?.slice(0, 200),
            structureFeedback: ev.structure_feedback?.slice(0, 200),
            improvementSuggestions: ev.improvement_suggestions?.slice(0, 200),
            score: ev.total_score,
            maxScore: ev.max_possible_score,
            confidence: ev.confidence,
            criteriaScores: ev.criteria_scores?.map((cs: any) => ({ criterion: cs.criteria?.name, score: cs.score, maxScore: cs.criteria?.max_score })),
          };
        }),
      };
      const result = await aiInsights.mutateAsync(payload);
      setInsights(result);
      toast.success("AI analysis complete!");
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    }
  };

  const radarData = computed.criteriaBreakdown.map((c) => ({ criterion: c.name, score: c.avgPct, fullMark: 100 }));

  return (
    <div className="space-y-6">
      {/* Header with AI button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{computed.evaluatedCount} evaluated of {computed.totalCount} submissions</p>
        <button
          onClick={handleAnalyze}
          disabled={aiInsights.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          {aiInsights.isPending ? "Analyzing…" : "AI Deep Analysis"}
        </button>
      </div>

      {/* Score Distribution + Percentiles */}
      <SectionHeader icon={BarChart3} title="Score Distribution" subtitle="Histogram, percentiles & outliers" sectionKey="dist" expanded={expandedSections.dist !== false} toggle={toggleSection} />
      {expandedSections.dist !== false && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card rounded-lg shadow-card border border-border p-5">
            {computed.scores.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={computed.distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No evaluation data yet</p>
            )}
          </div>
          <div className="space-y-3">
            <MiniStat label="Average" value={`${computed.avg}%`} icon={TrendingUp} />
            <MiniStat label="Top 25% (P75)" value={`${computed.p75}%`} icon={Award} color="text-success" />
            <MiniStat label="Median" value={`${computed.median}%`} icon={Activity} />
            <MiniStat label="Bottom 25%" value={`${computed.p25}%`} icon={AlertTriangle} color="text-warning" />
            {computed.outliers.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs font-medium text-destructive">{computed.outliers.length} outlier{computed.outliers.length > 1 ? "s" : ""}</p>
                {computed.outliers.slice(0, 3).map((o, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground">{o.studentName} — {o.pct}%</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Criteria Breakdown */}
      {computed.criteriaBreakdown.length > 0 && (
        <>
          <SectionHeader icon={Target} title="Criteria-Level Breakdown" subtitle="Radar chart & variance" sectionKey="crit" expanded={expandedSections.crit !== false} toggle={toggleSection} />
          {expandedSections.crit !== false && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card rounded-lg shadow-card border border-border p-5">
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-lg shadow-card border border-border p-5">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={computed.criteriaBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="avgPct" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Variance table */}
              <div className="lg:col-span-2 bg-card rounded-lg shadow-card border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {computed.criteriaBreakdown.map((c) => (
                    <div key={c.name} className="p-3 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{c.avgPct}%</p>
                        <p className={`text-[11px] ${c.variance > 1.5 ? "text-warning" : "text-muted-foreground"}`}>variance: {c.variance}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confidence */}
      <SectionHeader icon={Shield} title="Confidence & Reliability" subtitle="AI scoring reliability" sectionKey="conf" expanded={expandedSections.conf !== false} toggle={toggleSection} />
      {expandedSections.conf !== false && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MiniStat label="Avg AI Confidence" value={`${computed.avgConfidence}%`} icon={Shield} color={computed.avgConfidence >= 75 ? "text-success" : "text-warning"} />
          <MiniStat label="Low Confidence" value={`${computed.lowConfidencePct}%`} icon={AlertTriangle} color={computed.lowConfidencePct > 30 ? "text-destructive" : "text-muted-foreground"} />
          <MiniStat label="Unstable Criteria" value={`${computed.unstableCriteria.length}`} icon={Activity} color={computed.unstableCriteria.length > 0 ? "text-warning" : "text-success"} />
        </div>
      )}

      {/* AI Insights sections */}
      {insights?.conceptualWeaknesses && (
        <>
          <SectionHeader icon={AlertTriangle} title="Conceptual Weakness Map" subtitle="AI-detected struggles" sectionKey="weak" expanded={expandedSections.weak !== false} toggle={toggleSection} />
          {expandedSections.weak !== false && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.conceptualWeaknesses.map((w: any, i: number) => (
                <div key={i} className={`rounded-lg border p-4 ${severityBg[w.severity] || ""}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`h-4 w-4 ${severityColor[w.severity] || ""}`} />
                    <span className={`text-xs font-medium uppercase ${severityColor[w.severity] || ""}`}>{w.severity}</span>
                    <span className="ml-auto text-sm font-bold text-foreground">{w.percentage}%</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{w.weakness}</p>
                  <p className="text-xs text-muted-foreground mt-1">{w.detail}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {insights?.studentClusters && (
        <>
          <SectionHeader icon={Users} title="Student Performance Clusters" subtitle="AI-detected patterns" sectionKey="clust" expanded={expandedSections.clust !== false} toggle={toggleSection} />
          {expandedSections.clust !== false && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.studentClusters.map((cluster: any, i: number) => (
                <div key={i} className="bg-card rounded-lg shadow-card border border-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-3 h-3 rounded-full ${i === 0 ? "bg-success" : i === 1 ? "bg-warning" : "bg-destructive"}`} />
                    <h4 className="text-sm font-semibold text-foreground">{cluster.name}</h4>
                    <span className="ml-auto text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{cluster.count}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{cluster.description}</p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[11px] font-medium text-success uppercase">Strengths</p>
                      {cluster.strengths.map((s: string, j: number) => <p key={j} className="text-xs text-muted-foreground">• {s}</p>)}
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-destructive uppercase">Weaknesses</p>
                      {cluster.weaknesses.map((w: string, j: number) => <p key={j} className="text-xs text-muted-foreground">• {w}</p>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {insights?.teachingInsights && (
        <>
          <SectionHeader icon={Lightbulb} title="Teaching Insights" subtitle="AI-generated recommendations" sectionKey="teach" expanded={expandedSections.teach !== false} toggle={toggleSection} />
          {expandedSections.teach !== false && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card rounded-lg shadow-card border border-border">
                <div className="p-4 border-b border-border"><h4 className="text-sm font-medium text-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Key Problems</h4></div>
                <div className="divide-y divide-border">
                  {insights.teachingInsights.keyProblems.map((p: any, i: number) => (
                    <div key={i} className="p-4">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${priorityBadge[p.urgency] || ""}`}>{p.urgency}</span>
                      <p className="text-sm font-medium text-foreground mt-1">{p.problem}</p>
                      <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card rounded-lg shadow-card border border-border">
                <div className="p-4 border-b border-border"><h4 className="text-sm font-medium text-foreground flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" /> Suggested Actions</h4></div>
                <div className="divide-y divide-border">
                  {insights.teachingInsights.suggestedActions.map((a: any, i: number) => (
                    <div key={i} className="p-4">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${priorityBadge[a.priority] || ""}`}>{a.priority}</span>
                      <p className="text-sm font-medium text-foreground mt-1">{a.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{a.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {insights?.institutionalSummary && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">Summary</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{insights.institutionalSummary}</p>
            </div>
          </div>
        </div>
      )}

      {!insights && computed.evaluatedCount > 0 && (
        <div className="bg-accent/50 border border-border rounded-lg p-6 text-center">
          <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Click "AI Deep Analysis" for deeper insights</p>
          <p className="text-xs text-muted-foreground mt-1">Weakness maps, student clusters, teaching recommendations & more</p>
        </div>
      )}
    </div>
  );
}

