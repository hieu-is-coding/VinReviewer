import { DashboardLayout } from "@/components/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { useSubmissions, useEvaluations, useClasses } from "@/hooks/useData";
import { FileText, Eye, AlertTriangle, RotateCcw, ArrowRight, Brain, Info } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { data: submissions } = useSubmissions();
  const { data: classes } = useClasses();
  const { data: evaluations } = useEvaluations();

  const pending = submissions?.filter((s) => s.status === "pending").length || 0;
  const needsReview = submissions?.filter((s) => s.status === "needs_review").length || 0;
  const flagged = submissions?.filter((s) => s.status === "flagged").length || 0;
  const evaluating = submissions?.filter((s) => s.status === "evaluating").length || 0;

  const workflowItems = [
    { label: "Pending evaluations", count: pending, icon: FileText, action: "Resume grading" },
    { label: "Needs human review", count: needsReview, icon: Eye, action: "Review now" },
    { label: "Flagged issues", count: flagged, icon: AlertTriangle, action: "Review flagged" },
    { label: "Evaluating", count: evaluating, icon: RotateCcw, action: "View all" },
  ];

  const avgScore = evaluations?.length
    ? Math.round(evaluations.reduce((sum, e) => sum + (e.max_possible_score ? (Number(e.total_score) / Number(e.max_possible_score)) * 100 : 0), 0) / evaluations.length)
    : 0;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Your evaluation command center</p>
        </div>

        {/* Today's Workflow */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Today's Workflow</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {workflowItems.map((item) => (
              <div key={item.label} className="bg-card rounded-lg p-4 shadow-card border border-border hover:shadow-soft transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-2xl font-semibold text-foreground">{item.count}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-3">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Class Overview */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-lg shadow-card border border-border">
              <div className="p-5 border-b border-border">
                <h3 className="text-sm font-medium text-foreground">Class Overview</h3>
              </div>
              {classes && classes.length > 0 ? (
                <div className="divide-y divide-border">
                  {classes.map((c) => {
                    const classSubmissions = submissions?.filter((s) => s.class_id === c.id) || [];
                    const graded = classSubmissions.filter((s) => s.status === "ai_graded" || s.status === "approved").length;
                    return (
                      <div key={c.id} className="p-4 flex items-center gap-4 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate(`/classes/${c.id}`)}>
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{classSubmissions.length} submissions</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-success">{classSubmissions.length > 0 ? Math.round((graded / classSubmissions.length) * 100) : 0}%</p>
                          <p className="text-[11px] text-muted-foreground">graded</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => navigate("/classes")}>
                  No classes yet. Click here to create one.
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-6">
            <div className="bg-card rounded-lg shadow-card border border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Quick Stats</h3>
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-accent/60">
                  <p className="text-sm text-foreground">Total submissions</p>
                  <p className="text-2xl font-semibold text-foreground">{submissions?.length || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/60">
                  <p className="text-sm text-foreground">Avg score</p>
                  <p className="text-2xl font-semibold text-foreground">{avgScore}%</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/60">
                  <p className="text-sm text-foreground">Total classes</p>
                  <p className="text-2xl font-semibold text-foreground">{classes?.length || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
