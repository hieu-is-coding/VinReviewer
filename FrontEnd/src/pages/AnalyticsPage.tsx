import { DashboardLayout } from "@/components/DashboardLayout";
import { useAnalyticsData, useAIInsights } from "@/hooks/useAnalytics";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  Brain, TrendingUp, AlertTriangle, Target, BookOpen, Shield,
  BarChart3, Users, Zap, ChevronDown, ChevronUp, Lightbulb,
  Activity, Award, PieChart, Sparkles,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const severityColor = { high: "text-destructive", medium: "text-warning", low: "text-success" };
const severityBg = { high: "bg-destructive/10 border-destructive/20", medium: "bg-warning/10 border-warning/20", low: "bg-success/10 border-success/20" };
const priorityBadge = { high: "bg-destructive/10 text-destructive", medium: "bg-warning/10 text-warning", low: "bg-success/10 text-success" };

const AnalyticsPage = () => {
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("all");

  const {
    data,
    isLoading,
    rawEvaluations,
    rawSubmissions,
    rawClasses,
    rawAssignments,
  } = useAnalyticsData(selectedClassId, selectedAssignmentId);

  const aiInsights = useAIInsights();
  const [insights, setInsights] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => setExpandedSections((p) => ({ ...p, [key]: !p[key] }));

  const filteredAssignments = useMemo(() => {
    if (!rawAssignments) return [];
    if (selectedClassId === "all") return rawAssignments;
    return rawAssignments.filter((a: any) => a.class_id === selectedClassId);
  }, [rawAssignments, selectedClassId]);

  const handleClassChange = (value: string) => {
    setSelectedClassId(value);
    setSelectedAssignmentId("all");
    setInsights(null);
  };

  const handleAssignmentChange = (value: string) => {
    setSelectedAssignmentId(value);
    setInsights(null);
    if (value !== "all" && rawAssignments) {
      const assignment = rawAssignments.find((a: any) => a.id === value);
      if (assignment && assignment.class_id !== selectedClassId) {
        setSelectedClassId(assignment.class_id);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!data || !rawEvaluations) return;
    try {
      const analyticsPayload = {
        totalEvaluations: data.totalEvaluations,
        avgScore: data.avg,
        percentiles: data.percentiles,
        distribution: data.distribution,
        criteriaBreakdown: data.criteriaBreakdown,
        avgConfidence: data.avgConfidence,
        classPerformance: data.classPerformance,
        outlierCount: data.outliers.length,
        flaggedCount: data.flaggedCount,
        needsReviewCount: data.needsReviewCount,
        reviewedCount: data.reviewedEvals.length,
        feedbackSamples: rawEvaluations.slice(0, 10).map((e: any) => ({
          overallFeedback: e.overall_feedback?.slice(0, 200),
          contentFeedback: e.content_feedback?.slice(0, 200),
          grammarFeedback: e.grammar_feedback?.slice(0, 200),
          structureFeedback: e.structure_feedback?.slice(0, 200),
          improvementSuggestions: e.improvement_suggestions?.slice(0, 200),
          score: e.total_score,
          maxScore: e.max_possible_score,
          confidence: e.confidence,
          criteriaScores: e.criteria_scores?.map((cs: any) => ({
            criterion: cs.criteria?.name,
            score: cs.score,
            maxScore: cs.criteria?.max_score,
          })),
        })),
      };
      const result = await aiInsights.mutateAsync(analyticsPayload);
      setInsights(result);
      toast.success("AI analysis complete!");
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const isEmptyFiltered = !data || data.totalEvaluations === 0;
  const isOverallEmpty = isEmptyFiltered && selectedClassId === "all" && selectedAssignmentId === "all";

  if (isOverallEmpty) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          <h2 className="text-2xl font-semibold text-foreground">Analytics</h2>
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">No evaluation data yet</p>
            <p className="text-sm text-muted-foreground mt-1">Evaluate some submissions to see analytics here</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const radarData = data ? data.criteriaBreakdown.map((c) => ({ criterion: c.name, score: c.avgPct, fullMark: 100 })) : [];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Analytics Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-1">Comprehensive insights across {data?.totalEvaluations || 0} evaluations</p>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={aiInsights.isPending || isEmptyFiltered}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {aiInsights.isPending ? "Analyzing…" : "AI Deep Analysis"}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 p-4 bg-card rounded-xl border border-border/80 shadow-sm">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Filter</label>
            <Select value={selectedClassId} onValueChange={handleClassChange}>
              <SelectTrigger className="w-full bg-background border-border/65">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {rawClasses?.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignment Filter</label>
            <Select value={selectedAssignmentId} onValueChange={handleAssignmentChange}>
              <SelectTrigger className="w-full bg-background border-border/65">
                <SelectValue placeholder="All Assignments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignments</SelectItem>
                {filteredAssignments?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title} {selectedClassId === "all" ? `(${a.classes?.name || "Unknown class"})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isEmptyFiltered ? (
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">No evaluation data found</p>
            <p className="text-sm text-muted-foreground mt-1">
              There are no evaluations matching the selected Class and Assignment filters.
            </p>
          </div>
        ) : (
          <>
            {/* ═══════════════════════════ SECTION A: Score Distribution ═══════════════════════════ */}
            <SectionHeader icon={BarChart3} title="Score Distribution" subtitle="Histogram, percentiles & outliers" sectionKey="distribution" expanded={expandedSections.distribution !== false} toggle={toggleSection} />
            {expandedSections.distribution !== false && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Histogram */}
                <div className="lg:col-span-2 bg-card rounded-lg shadow-card border border-border p-5">
                  <h4 className="text-sm font-medium text-foreground mb-4">Score Ranges</h4>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.distribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="range" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {insights?.conceptualWeaknesses && (
                    <AIComment text={`Most students cluster around ${data.percentiles.p25}–${data.percentiles.p75}%, indicating ${data.avg >= 70 ? "moderate to strong" : "moderate"} understanding.`} />
                  )}
                </div>
                {/* Percentiles */}
                <div className="space-y-4">
                  <StatCard label="Average Score" value={`${data.avg}%`} icon={TrendingUp} />
                  <StatCard label="Top 25% (P75)" value={`${data.percentiles.p75}%`} icon={Award} color="text-success" />
                  <StatCard label="Median (P50)" value={`${data.percentiles.median}%`} icon={Activity} />
                  <StatCard label="Bottom 25% (P25)" value={`${data.percentiles.p25}%`} icon={AlertTriangle} color="text-warning" />
                  {data.outliers.length > 0 && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                      <p className="text-xs font-medium text-destructive">{data.outliers.length} Outlier{data.outliers.length > 1 ? "s" : ""} Detected</p>
                      <div className="mt-2 space-y-1">
                        {data.outliers.slice(0, 3).map((o, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground">{o.studentName} — {o.pct}%</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════ SECTION B: Criteria Breakdown ═══════════════════════════ */}
            <SectionHeader icon={Target} title="Criteria-Level Breakdown" subtitle="Radar chart & per-criterion analysis" sectionKey="criteria" expanded={expandedSections.criteria !== false} toggle={toggleSection} />
            {expandedSections.criteria !== false && data.criteriaBreakdown.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Radar */}
                <div className="bg-card rounded-lg shadow-card border border-border p-5">
                  <h4 className="text-sm font-medium text-foreground mb-4">Criteria Radar</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {/* Bar per criterion */}
                <div className="bg-card rounded-lg shadow-card border border-border p-5">
                  <h4 className="text-sm font-medium text-foreground mb-4">Avg Score per Criterion</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.criteriaBreakdown} layout="vertical">
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
                  <div className="p-4 border-b border-border">
                    <h4 className="text-sm font-medium text-foreground">Criteria Variance Analysis</h4>
                  </div>
                  <div className="divide-y divide-border">
                    {data.criteriaBreakdown.map((c) => (
                      <div key={c.name} className="p-4 flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.count} evaluations</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{c.avgPct}%</p>
                          <p className={`text-[11px] ${c.variance > 1.5 ? "text-warning" : "text-muted-foreground"}`}>
                            variance: {c.variance}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {insights?.criteriaInsights && (
                    <div className="p-4 border-t border-border">
                      {insights.criteriaInsights.map((ci: any, i: number) => (
                        <AIComment key={i} text={`${ci.criterion}: ${ci.insight}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════ SECTION C: Conceptual Weakness Map ═══════════════════════════ */}
            {insights?.conceptualWeaknesses && (
              <>
                <SectionHeader icon={AlertTriangle} title="Conceptual Weakness Map" subtitle="AI-detected student struggles" sectionKey="weaknesses" expanded={expandedSections.weaknesses !== false} toggle={toggleSection} />
                {expandedSections.weaknesses !== false && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {insights.conceptualWeaknesses.map((w: any, i: number) => (
                      <div key={i} className={`rounded-lg border p-4 ${severityBg[w.severity as keyof typeof severityBg]}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className={`h-4 w-4 ${severityColor[w.severity as keyof typeof severityColor]}`} />
                          <span className={`text-xs font-medium uppercase ${severityColor[w.severity as keyof typeof severityColor]}`}>{w.severity}</span>
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

            {/* ═══════════════════════════ SECTION D: AI Pattern Recognition ═══════════════════════════ */}
            {insights?.studentClusters && (
              <>
                <SectionHeader icon={Users} title="Student Performance Clusters" subtitle="AI-detected learning patterns" sectionKey="clusters" expanded={expandedSections.clusters !== false} toggle={toggleSection} />
                {expandedSections.clusters !== false && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {insights.studentClusters.map((cluster: any, i: number) => (
                      <div key={i} className="bg-card rounded-lg shadow-card border border-border p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-3 h-3 rounded-full ${i === 0 ? "bg-success" : i === 1 ? "bg-warning" : "bg-destructive"}`} />
                          <h4 className="text-sm font-semibold text-foreground">{cluster.name}</h4>
                          <span className="ml-auto text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{cluster.count} students</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">{cluster.description}</p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-[11px] font-medium text-success uppercase tracking-wide">Strengths</p>
                            {cluster.strengths.map((s: string, j: number) => (
                              <p key={j} className="text-xs text-muted-foreground">• {s}</p>
                            ))}
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-destructive uppercase tracking-wide">Weaknesses</p>
                            {cluster.weaknesses.map((w: string, j: number) => (
                              <p key={j} className="text-xs text-muted-foreground">• {w}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ═══════════════════════════ SECTION E: Confidence & Reliability ═══════════════════════════ */}
            <SectionHeader icon={Shield} title="Confidence & Reliability Analysis" subtitle="AI scoring reliability metrics" sectionKey="confidence" expanded={expandedSections.confidence !== false} toggle={toggleSection} />
            {expandedSections.confidence !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Avg AI Confidence" value={`${data.avgConfidence}%`} icon={Shield} color={data.avgConfidence >= 75 ? "text-success" : "text-warning"} />
                <StatCard label="Low Confidence Evals" value={`${data.lowConfidencePct}%`} icon={AlertTriangle} color={data.lowConfidencePct > 30 ? "text-destructive" : "text-muted-foreground"} subtitle={`${data.lowConfidenceCount} of ${data.totalEvaluations}`} />
                <StatCard label="Unstable Criteria" value={`${data.unstableCriteria.length}`} icon={Activity} color={data.unstableCriteria.length > 0 ? "text-warning" : "text-success"} subtitle={data.unstableCriteria[0]?.name || "None"} />
                {data.unstableCriteria.length > 0 && (
                  <div className="sm:col-span-3">
                    <AIComment text={`${data.unstableCriteria[0]?.name} shows high variance (${data.unstableCriteria[0]?.variance}) → rubric may need clarification for this criterion.`} />
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════ SECTION F: AI vs Human Gap ═══════════════════════════ */}
            <SectionHeader icon={Zap} title="AI vs Human Scoring Gap" subtitle="Instructor overrides and adjustments" sectionKey="gap" expanded={expandedSections.gap !== false} toggle={toggleSection} />
            {expandedSections.gap !== false && (
              <div className="bg-card rounded-lg shadow-card border border-border p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{data.reviewedEvals.length}</p>
                    <p className="text-xs text-muted-foreground">Human-Reviewed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">
                      {data.totalEvaluations > 0 ? Math.round((data.reviewedEvals.length / data.totalEvaluations) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Override Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{data.totalEvaluations - data.reviewedEvals.length}</p>
                    <p className="text-xs text-muted-foreground">AI-Only Evaluations</p>
                  </div>
                </div>
                {insights && (
                  <AIComment text={insights.institutionalSummary || "Run AI analysis for deeper AI vs Human comparison."} />
                )}
              </div>
            )}

            {/* ═══════════════════════════ SECTION G: Integrity Analytics ═══════════════════════════ */}
            <SectionHeader icon={Shield} title="Integrity Analytics" subtitle="Plagiarism flags, citation issues" sectionKey="integrity" expanded={expandedSections.integrity !== false} toggle={toggleSection} />
            {expandedSections.integrity !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Flagged Submissions" value={`${data.flaggedCount}`} icon={AlertTriangle} color={data.flaggedCount > 0 ? "text-destructive" : "text-success"} />
                <StatCard label="Needs Review" value={`${data.needsReviewCount}`} icon={BookOpen} color={data.needsReviewCount > 0 ? "text-warning" : "text-success"} />
                <StatCard label="Total Submissions" value={`${data.totalSubmissions}`} icon={BarChart3} />
                {insights?.writingQuality && (
                  <div className="sm:col-span-3 bg-card rounded-lg shadow-card border border-border p-5">
                    <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" /> Writing Quality Assessment
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">{insights.writingQuality.overallAssessment}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1">Common Issues</p>
                        {insights.writingQuality.commonIssues.map((issue: string, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">• {issue}</p>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground mb-1">Trends</p>
                        {insights.writingQuality.trends.map((trend: string, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">• {trend}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════ SECTION H: Performance Across Classes ═══════════════════════════ */}
            {selectedClassId === "all" && expandedSections.classes !== false && data.classPerformance.length > 0 && (
              <>
                <SectionHeader icon={PieChart} title="Performance Across Classes" subtitle="Cross-class comparison & difficulty analysis" sectionKey="classes" expanded={expandedSections.classes !== false} toggle={toggleSection} />
                <div className="bg-card rounded-lg shadow-card border border-border p-5">
                  <ResponsiveContainer width="100%" height={Math.max(200, data.classPerformance.length * 50)}>
                    <BarChart data={data.classPerformance} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {data.classPerformance.length > 1 && (() => {
                    const sorted = [...data.classPerformance].sort((a, b) => a.avgScore - b.avgScore);
                    const lowest = sorted[0];
                    const diff = data.avg - lowest.avgScore;
                    return diff > 10 ? <AIComment text={`${lowest.name} is ${diff}% below average → assignment difficulty or student preparation may differ.`} /> : null;
                  })()}
                </div>
              </>
            )}

            {/* ═══════════════════════════ SECTION I: Teaching Insights ═══════════════════════════ */}
            {insights?.teachingInsights && (
              <>
                <SectionHeader icon={Lightbulb} title="Actionable Teaching Insights" subtitle="AI-generated problems & suggested actions" sectionKey="teaching" expanded={expandedSections.teaching !== false} toggle={toggleSection} />
                {expandedSections.teaching !== false && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Key Problems */}
                    <div className="bg-card rounded-lg shadow-card border border-border">
                      <div className="p-4 border-b border-border">
                        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-destructive" /> Key Problems
                        </h4>
                      </div>
                      <div className="divide-y divide-border">
                        {insights.teachingInsights.keyProblems.map((p: any, i: number) => (
                          <div key={i} className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${priorityBadge[p.urgency as keyof typeof priorityBadge]}`}>
                                {p.urgency}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{p.problem}</p>
                            <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Suggested Actions */}
                    <div className="bg-card rounded-lg shadow-card border border-border">
                      <div className="p-4 border-b border-border">
                        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-warning" /> Suggested Actions
                        </h4>
                      </div>
                      <div className="divide-y divide-border">
                        {insights.teachingInsights.suggestedActions.map((a: any, i: number) => (
                          <div key={i} className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${priorityBadge[a.priority as keyof typeof priorityBadge]}`}>
                                {a.priority}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{a.action}</p>
                            <p className="text-xs text-muted-foreground mt-1">{a.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══════════════════════════ SECTION J: Rubric Effectiveness ═══════════════════════════ */}
            {insights?.rubricEffectiveness && (
              <>
                <SectionHeader icon={Target} title="Rubric Effectiveness Analysis" subtitle="Which criteria need refinement" sectionKey="rubric" expanded={expandedSections.rubric !== false} toggle={toggleSection} />
                {expandedSections.rubric !== false && (
                  <div className="bg-card rounded-lg shadow-card border border-border overflow-hidden">
                    <div className="divide-y divide-border">
                      {insights.rubricEffectiveness.map((r: any, i: number) => (
                        <div key={i} className="p-4 flex items-center gap-4">
                          <div className={`w-2.5 h-2.5 rounded-full ${r.effectiveness === "high" ? "bg-success" : r.effectiveness === "medium" ? "bg-warning" : "bg-destructive"}`} />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{r.criterion}</p>
                            <p className="text-xs text-muted-foreground">{r.issue}</p>
                          </div>
                          <span className={`text-xs font-medium uppercase ${r.effectiveness === "high" ? "text-success" : r.effectiveness === "medium" ? "text-warning" : "text-destructive"}`}>
                            {r.effectiveness}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══════════════════════════ SECTION K: AI System Performance ═══════════════════════════ */}
            <SectionHeader icon={Activity} title="AI System Performance" subtitle="Confidence, error rate, override metrics" sectionKey="aiPerf" expanded={expandedSections.aiPerf !== false} toggle={toggleSection} />
            {expandedSections.aiPerf !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <StatCard label="Total Evaluations" value={`${data.totalEvaluations}`} icon={BarChart3} />
                <StatCard label="Avg Confidence" value={`${data.avgConfidence}%`} icon={Shield} color={data.avgConfidence >= 75 ? "text-success" : "text-warning"} />
                <StatCard
                  label="Human Override Rate"
                  value={`${data.totalEvaluations > 0 ? Math.round((data.reviewedEvals.length / data.totalEvaluations) * 100) : 0}%`}
                  icon={Users}
                />
                <StatCard label="Low Confidence" value={`${data.lowConfidencePct}%`} icon={AlertTriangle} color={data.lowConfidencePct > 30 ? "text-destructive" : "text-muted-foreground"} />
              </div>
            )}

            {/* ═══════════════════════════ SECTION L: Institutional Summary ═══════════════════════════ */}
            {insights?.institutionalSummary && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <Brain className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Institutional Learning Summary</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{insights.institutionalSummary}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════ SECTION M: Improvement Suggestions ═══════════════════════════ */}
            {insights?.improvementSuggestions && (
              <div className="bg-card rounded-lg shadow-card border border-border p-5">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Recommendations
                </h4>
                <div className="space-y-2">
                  {insights.improvementSuggestions.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
                      <p className="text-sm text-muted-foreground">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA for AI analysis */}
            {!insights && (
              <div className="bg-accent/50 border border-border rounded-lg p-8 text-center">
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Click "AI Deep Analysis" for advanced insights</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Conceptual weakness maps, student clusters, teaching recommendations, rubric effectiveness & more
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

// ═══════════════ Sub-components ═══════════════

function SectionHeader({ icon: Icon, title, subtitle, sectionKey, expanded, toggle }: {
  icon: any; title: string; subtitle: string; sectionKey: string; expanded: boolean; toggle: (k: string) => void;
}) {
  return (
    <button onClick={() => toggle(sectionKey)} className="w-full flex items-center gap-3 group">
      <Icon className="h-5 w-5 text-primary" />
      <div className="text-left flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function StatCard({ label, value, icon: Icon, color, subtitle }: {
  label: string; value: string; icon: any; color?: string; subtitle?: string;
}) {
  return (
    <div className="bg-card rounded-lg shadow-card border border-border p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color || "text-foreground"}`}>{value}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function AIComment({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
      <Brain className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

export default AnalyticsPage;
