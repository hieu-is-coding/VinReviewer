import { DashboardLayout } from "@/components/DashboardLayout";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAssignments, useCreateAssignment, useDeleteAssignment } from "@/hooks/useAssignments";
import { useClassStudents, useAddStudentToClass } from "@/hooks/useData";
import { useAIInsights } from "@/hooks/useAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, FileText, Users, BarChart3, Upload, Loader2, UserPlus, X, Brain, AlertTriangle, Target, Shield, Activity, Sparkles, TrendingUp, Award, Lightbulb } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { SectionHeader } from "@/components/analytics/SectionHeader";
import { MiniStat } from "@/components/analytics/MiniStat";
import { MAX_CSV_FILE_SIZE, MAX_CSV_ROWS } from "@/lib/constants";

const ClassDetailPage = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: classData, isLoading: classLoading } = useQuery({
    queryKey: ["class", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").eq("id", classId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(classId);
  const { data: classStudents } = useClassStudents(classId);
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const addStudentToClass = useAddStudentToClass();

  const [assignOpen, setAssignOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Student management state
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateAssignment = async () => {
    if (!title.trim() || !classId) return toast.error("Title is required");
    try {
      await createAssignment.mutateAsync({
        class_id: classId,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Assignment created");
      setAssignOpen(false);
      setTitle("");
      setDescription("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !classId) return toast.error("Student name is required");
    setAddingStudent(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create student
      const { data: student, error: studentErr } = await supabase
        .from("students")
        .insert({ name: newStudentName.trim(), email: newStudentEmail.trim() || null, user_id: user.id })
        .select()
        .single();
      if (studentErr) throw studentErr;

      // Enroll in class
      await addStudentToClass.mutateAsync({ class_id: classId, student_id: student.id });
      toast.success(`${student.name} added`);
      setNewStudentName("");
      setNewStudentEmail("");
      setAddStudentOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (classStudentId: string, studentName: string) => {
    try {
      const { error } = await supabase.from("class_students").delete().eq("id", classStudentId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["class_students", classId] });
      toast.success(`${studentName} removed`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !classId) return;

    const isCSV = file.name.endsWith(".csv");
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    if (!isCSV && !isExcel) return toast.error("Please upload a CSV or Excel file");

    if (file.size > MAX_CSV_FILE_SIZE) {
      toast.error("File must be under 5MB");
      return;
    }

    setBulkUploading(true);
    try {
      let rows: { name: string; email?: string }[] = [];

      if (isCSV) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes("name") || firstLine.includes("email") || firstLine.includes("student");
        const dataLines = hasHeader ? lines.slice(1) : lines;

        if (dataLines.length > MAX_CSV_ROWS) {
          toast.error(`Too many rows (${dataLines.length}). Maximum is ${MAX_CSV_ROWS}.`);
          setBulkUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const warnings: string[] = [];
        const seenNames = new Set<string>();

        for (const line of dataLines) {
          const parts = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(s => s.replace(/^"|"$/g, "").trim()) || [];
          const name = parts[0]?.trim();
          if (!name) continue;

          const email = parts[1]?.trim();
          if (email && !emailRe.test(email)) {
            warnings.push(`Invalid email for "${name}": ${email}`);
            continue;
          }

          const key = name.toLowerCase();
          if (seenNames.has(key)) {
            warnings.push(`Duplicate student skipped: "${name}"`);
            continue;
          }
          seenNames.add(key);

          rows.push({ name, email: email || undefined });
        }

        if (warnings.length > 0) {
          toast.warning(warnings.slice(0, 3).join("\n") + (warnings.length > 3 ? `\n...and ${warnings.length - 3} more` : ""));
        }
      } else {
        toast.error("For now, please use CSV format (.csv). Excel support coming soon.");
        setBulkUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      if (rows.length === 0) {
        toast.error("No valid students found in the file");
        setBulkUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Batch insert students
      const { data: students, error: insertErr } = await supabase
        .from("students")
        .insert(rows.map(r => ({ name: r.name, email: r.email || null, user_id: user.id })))
        .select();
      if (insertErr) throw insertErr;

      // Enroll all into class
      if (students && students.length > 0) {
        const enrollments = students.map(s => ({ class_id: classId, student_id: s.id, user_id: user.id }));
        const { error: enrollErr } = await supabase.from("class_students").insert(enrollments);
        if (enrollErr) throw enrollErr;
      }

      qc.invalidateQueries({ queryKey: ["class_students", classId] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(`${students?.length || 0} students added!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Analytics data
  const allSubs = assignments?.flatMap(a => a.submissions || []) || [];
  const evaluatedSubs = allSubs.filter((s: any) => s.evaluations?.length > 0);
  const scores = evaluatedSubs.map((s: any) => {
    const ev = s.evaluations[0];
    return ev.max_possible_score ? Math.round((Number(ev.total_score) / Number(ev.max_possible_score)) * 100) : 0;
  });
  const avgScore = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

  const distribution = [
    { range: "0-20", count: 0 }, { range: "21-40", count: 0 }, { range: "41-60", count: 0 },
    { range: "61-80", count: 0 }, { range: "81-100", count: 0 },
  ];
  scores.forEach((pct: number) => {
    if (pct <= 20) distribution[0].count++;
    else if (pct <= 40) distribution[1].count++;
    else if (pct <= 60) distribution[2].count++;
    else if (pct <= 80) distribution[3].count++;
    else distribution[4].count++;
  });

  if (classLoading) {
    return <DashboardLayout><div className="text-center text-sm text-muted-foreground py-12" role="status" aria-live="polite">Loading...</div></DashboardLayout>;
  }

  if (!classData) {
    return <DashboardLayout><div className="text-center text-sm text-muted-foreground py-12">Class not found</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/classes")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Classes
            </Button>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">{classData.name}</h2>
              {classData.description && <p className="text-sm text-muted-foreground mt-0.5">{classData.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>{classStudents?.length || 0} students</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              <span>{assignments?.length || 0} assignments</span>
            </div>
            {avgScore > 0 && (
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" />
                <span>Avg {avgScore}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="assignments">
          <TabsList>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Manage assignments for this class</p>
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Assignment</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground">Title</label>
                      <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Progress Report 1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Description</label>
                      <Textarea className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Assignment instructions..." />
                    </div>
                    <Button onClick={handleCreateAssignment} disabled={createAssignment.isPending} className="w-full">
                      {createAssignment.isPending ? "Creating..." : "Create Assignment"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {assignmentsLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
            ) : assignments && assignments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignments.map((a: any) => {
                  const subs = a.submissions || [];
                  const evalCount = subs.filter((s: any) => s.evaluations?.length > 0).length;
                  return (
                    <div
                      key={a.id}
                      className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => navigate(`/classes/${classId}/assignments/${a.id}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAssignment.mutateAsync(a.id).then(() => toast.success("Deleted")).catch((err: any) => toast.error(err.message));
                            }}
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            aria-label={`Delete assignment ${a.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                      {a.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                        <span>{subs.length} submissions</span>
                        <span>{evalCount} evaluated</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No assignments yet. Create your first one!</p>
              </div>
            )}
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Students enrolled in this class</p>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleBulkUpload} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bulkUploading}
                >
                  {bulkUploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {bulkUploading ? "Importing..." : "Import CSV"}
                </Button>
                <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Add Student</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-foreground">Name</label>
                        <Input className="mt-1" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Student name" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Email <span className="text-muted-foreground font-normal">(optional)</span></label>
                        <Input className="mt-1" type="email" value={newStudentEmail} onChange={(e) => setNewStudentEmail(e.target.value)} placeholder="student@email.com" />
                      </div>
                      <Button onClick={handleAddStudent} disabled={addingStudent} className="w-full">
                        {addingStudent ? "Adding..." : "Add Student"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground px-1 mb-1">
                💡 Import a CSV file with columns: <code className="bg-muted px-1 rounded text-[10px]">name, email</code> to add students in bulk
              </p>
            </div>

            {classStudents && classStudents.length > 0 ? (
              <div className="bg-card rounded-xl border border-border overflow-hidden divide-y divide-border">
                {classStudents.map((cs: any) => (
                  <div key={cs.id} className="p-4 flex items-center gap-3 group">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium text-primary">{cs.students?.name?.charAt(0)?.toUpperCase() || "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{cs.students?.name || "Unknown"}</p>
                      {cs.students?.email && <p className="text-xs text-muted-foreground">{cs.students.email}</p>}
                    </div>
                    <button
                      onClick={() => handleRemoveStudent(cs.id, cs.students?.name || "Student")}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      aria-label={`Remove ${cs.students?.name || "student"} from class`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No students enrolled yet. Add them individually or import a CSV.</p>
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <ClassAnalytics assignments={assignments || []} allSubs={allSubs} scores={scores} avgScore={avgScore} distribution={distribution} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ClassDetailPage;

// ═══════════════ Deep Class Analytics ═══════════════

const severityColor: Record<string, string> = { high: "text-destructive", medium: "text-warning", low: "text-success" };
const severityBg: Record<string, string> = { high: "bg-destructive/10 border-destructive/20", medium: "bg-warning/10 border-warning/20", low: "bg-success/10 border-success/20" };
const priorityBadge: Record<string, string> = { high: "bg-destructive/10 text-destructive", medium: "bg-warning/10 text-warning", low: "bg-success/10 text-success" };

function ClassAnalytics({ assignments, allSubs, scores, avgScore, distribution }: {
  assignments: any[]; allSubs: any[]; scores: number[]; avgScore: number; distribution: { range: string; count: number }[];
}) {
  const aiInsights = useAIInsights();
  const [insights, setInsights] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setExpandedSections((p) => ({ ...p, [key]: !p[key] }));

  const computed = useMemo(() => {
    const evaluatedSubs = allSubs.filter((s: any) => s.evaluations?.length > 0);
    const sortedScores = [...scores].sort((a, b) => a - b);
    const p25 = sortedScores.length ? sortedScores[Math.floor(sortedScores.length * 0.25)] : 0;
    const median = sortedScores.length ? sortedScores[Math.floor(sortedScores.length * 0.5)] : 0;
    const p75 = sortedScores.length ? sortedScores[Math.floor(sortedScores.length * 0.75)] : 0;
    const iqr = p75 - p25;
    const outliers = sortedScores.filter((s) => s < p25 - 1.5 * iqr || s > p75 + 1.5 * iqr);

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
      const avgS = c.scores.reduce((a, b) => a + b, 0) / c.scores.length;
      const avgM = c.maxScores.reduce((a, b) => a + b, 0) / c.maxScores.length;
      const avgPct = Math.round((avgS / avgM) * 100);
      const variance = c.scores.length > 1 ? Math.round((c.scores.reduce((sum, s) => sum + Math.pow(s - avgS, 2), 0) / c.scores.length) * 100) / 100 : 0;
      return { name: c.name, avgScore: Math.round(avgS * 100) / 100, avgPct, variance, count: c.scores.length };
    });

    const confidences = evaluatedSubs.map((s: any) => Number(s.evaluations[0]?.confidence || 0)).filter((c) => c > 0);
    const avgConfidence = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;
    const lowConfCount = confidences.filter((c) => c < 70).length;
    const lowConfPct = confidences.length ? Math.round((lowConfCount / confidences.length) * 100) : 0;
    const unstable = criteriaBreakdown.filter((c) => c.variance > 1.5).sort((a, b) => b.variance - a.variance);

    // Per-assignment performance
    const assignmentPerf = assignments.map((a: any) => {
      const subs = a.submissions || [];
      const evaled = subs.filter((s: any) => s.evaluations?.length > 0);
      const aScores = evaled.map((s: any) => {
        const ev = s.evaluations[0];
        return ev.max_possible_score ? Math.round((Number(ev.total_score) / Number(ev.max_possible_score)) * 100) : 0;
      });
      const aAvg = aScores.length ? Math.round(aScores.reduce((a: number, b: number) => a + b, 0) / aScores.length) : 0;
      return { name: a.title, avgScore: aAvg, count: subs.length };
    }).filter((a) => a.count > 0);

    return { p25, median, p75, outliers, criteriaBreakdown, avgConfidence, lowConfPct, lowConfCount, unstable, evaluatedCount: evaluatedSubs.length, assignmentPerf };
  }, [allSubs, scores, assignments]);

  const radarData = computed.criteriaBreakdown.map((c) => ({ criterion: c.name, score: c.avgPct, fullMark: 100 }));

  const handleAnalyze = async () => {
    if (computed.evaluatedCount === 0) return toast.error("No evaluations to analyze");
    try {
      const evaluatedSubs = allSubs.filter((s: any) => s.evaluations?.length > 0);
      const payload = {
        totalEvaluations: computed.evaluatedCount,
        avgScore,
        percentiles: { p25: computed.p25, median: computed.median, p75: computed.p75 },
        distribution,
        criteriaBreakdown: computed.criteriaBreakdown,
        avgConfidence: computed.avgConfidence,
        classPerformance: computed.assignmentPerf,
        outlierCount: computed.outliers.length,
        flaggedCount: 0, needsReviewCount: 0, reviewedCount: 0,
        feedbackSamples: evaluatedSubs.slice(0, 10).map((s: any) => {
          const ev = s.evaluations[0];
          return {
            overallFeedback: ev.overall_feedback?.slice(0, 200),
            contentFeedback: ev.content_feedback?.slice(0, 200),
            grammarFeedback: ev.grammar_feedback?.slice(0, 200),
            structureFeedback: ev.structure_feedback?.slice(0, 200),
            improvementSuggestions: ev.improvement_suggestions?.slice(0, 200),
            score: ev.total_score, maxScore: ev.max_possible_score, confidence: ev.confidence,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{computed.evaluatedCount} evaluations across {assignments.length} assignments</p>
        <button onClick={handleAnalyze} disabled={aiInsights.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          <Sparkles className="h-4 w-4" />
          {aiInsights.isPending ? "Analyzing…" : "AI Deep Analysis"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <MiniStat label="Total Submissions" value={`${allSubs.length}`} icon={FileText} />
        <MiniStat label="Average Score" value={avgScore > 0 ? `${avgScore}%` : "—"} icon={TrendingUp} />
        <MiniStat label="Assignments" value={`${assignments.length}`} icon={BarChart3} />
        <MiniStat label="Avg Confidence" value={`${computed.avgConfidence}%`} icon={Shield} color={computed.avgConfidence >= 75 ? "text-success" : "text-warning"} />
      </div>

      {/* Score Distribution */}
      <SectionHeader icon={BarChart3} title="Score Distribution" subtitle="Histogram & percentiles" sectionKey="dist" expanded={expandedSections.dist !== false} toggle={toggleSection} />
      {expandedSections.dist !== false && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card rounded-lg shadow-card border border-border p-5">
            {scores.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={distribution}>
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
            <MiniStat label="Top 25% (P75)" value={`${computed.p75}%`} icon={Award} color="text-success" />
            <MiniStat label="Median" value={`${computed.median}%`} icon={Activity} />
            <MiniStat label="Bottom 25%" value={`${computed.p25}%`} icon={AlertTriangle} color="text-warning" />
            {computed.outliers.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs font-medium text-destructive">{computed.outliers.length} outlier{computed.outliers.length > 1 ? "s" : ""}</p>
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
            </div>
          )}
        </>
      )}

      {/* Per-Assignment Performance */}
      {computed.assignmentPerf.length > 0 && (
        <>
          <SectionHeader icon={FileText} title="Per-Assignment Performance" subtitle="Compare across assignments" sectionKey="assign" expanded={expandedSections.assign !== false} toggle={toggleSection} />
          {expandedSections.assign !== false && (
            <div className="bg-card rounded-lg shadow-card border border-border p-5">
              <ResponsiveContainer width="100%" height={Math.max(160, computed.assignmentPerf.length * 45)}>
                <BarChart data={computed.assignmentPerf} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* AI Insight sections */}
      {insights?.conceptualWeaknesses?.length > 0 && (
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

      {insights?.studentClusters?.length > 0 && (
        <>
          <SectionHeader icon={Users} title="Student Clusters" subtitle="AI-detected patterns" sectionKey="clust" expanded={expandedSections.clust !== false} toggle={toggleSection} />
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
                    {cluster.strengths?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-success uppercase">Strengths</p>
                        {cluster.strengths.map((s: string, j: number) => <p key={j} className="text-xs text-muted-foreground">• {s}</p>)}
                      </div>
                    )}
                    {cluster.weaknesses?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-destructive uppercase">Weaknesses</p>
                        {cluster.weaknesses.map((w: string, j: number) => <p key={j} className="text-xs text-muted-foreground">• {w}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(insights?.teachingInsights?.keyProblems?.length > 0 || insights?.teachingInsights?.suggestedActions?.length > 0) && (
        <>
          <SectionHeader icon={Lightbulb} title="Teaching Insights" subtitle="AI recommendations" sectionKey="teach" expanded={expandedSections.teach !== false} toggle={toggleSection} />
          {expandedSections.teach !== false && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {insights.teachingInsights.keyProblems?.length > 0 && (
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
              )}
              {insights.teachingInsights.suggestedActions?.length > 0 && (
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
              )}
            </div>
          )}
        </>
      )}

      {insights?.institutionalSummary && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">Class Summary</h4>
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

