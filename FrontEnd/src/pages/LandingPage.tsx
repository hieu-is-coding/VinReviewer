import { DashboardLayout } from "@/components/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Bot,
  ArrowRight,
  Target,
  LayoutDashboard,
  BookOpen,
  BarChart3,
  Settings,
  Upload,
  Brain,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-20 pb-16 animate-fade-in">

        {/* Hero */}
        <section className="text-center space-y-6 pt-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome to GradioAI
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-[1.15]">
            Hello, {displayName}! 👋
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
              AI-Powered Document Evaluation
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Automate your grading workflow with intelligent AI agents. Evaluate
            assignments, identify issues, and provide instant feedback with
            unprecedented accuracy and speed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate("/classes")}
              className="h-11 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-200 shadow-sm flex items-center gap-2"
            >
              Go to Classes
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="h-11 px-6 rounded-xl bg-accent hover:bg-accent/80 text-foreground font-semibold transition-all border border-border flex items-center gap-2"
            >
              View Dashboard
            </button>
          </div>
        </section>

        {/* Objectives */}
        <section className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground mb-2">Our Objectives</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              GradioAI is built to solve the core challenges of modern education and assessment.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                title: "Save Time",
                desc: "Cut grading time by up to 90% while maintaining high standards of evaluation.",
                icon: Target,
                color: "text-violet-500",
                bg: "bg-violet-500/10",
              },
              {
                title: "Ensure Consistency",
                desc: "Eliminate bias and ensure every student is evaluated against the exact same criteria.",
                icon: CheckCircle2,
                color: "text-emerald-500",
                bg: "bg-emerald-500/10",
              },
              {
                title: "Provide Deep Insights",
                desc: "Go beyond simple scores with detailed analytics and feedback generation.",
                icon: Brain,
                color: "text-blue-500",
                bg: "bg-blue-500/10",
              },
            ].map((obj, i) => (
              <div
                key={i}
                className="p-5 rounded-xl bg-card border border-border shadow-card hover:shadow-soft transition-shadow"
              >
                <div className={`h-10 w-10 rounded-lg ${obj.bg} flex items-center justify-center mb-4`}>
                  <obj.icon className={`h-5 w-5 ${obj.color}`} />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1.5">{obj.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{obj.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features / Pages Breakdown */}
        <section className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground mb-2">Platform Features</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Everything you need to manage your evaluation workflow in one place.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                title: "Dashboard",
                icon: LayoutDashboard,
                url: "/dashboard",
                desc: "Your evaluation command center. Get a bird's-eye view of pending grading, flagged issues, and overall class performance at a glance.",
              },
              {
                title: "Classes & Assignments",
                icon: BookOpen,
                url: "/classes",
                desc: "Organize your workload. Create classes, manage students, and configure assignments with custom grading rubrics and criteria.",
              },
              {
                title: "Analytics",
                icon: BarChart3,
                url: "/analytics",
                desc: "Deep dive into the data. Track average scores, identify common mistakes, and monitor the AI's grading performance over time.",
              },
              {
                title: "Settings & Prompts",
                icon: Settings,
                url: "/settings",
                desc: "Customize the AI. Tweak evaluation prompts, adjust strictness levels, and tailor the feedback style to your specific needs.",
              },
            ].map((feature, i) => (
              <button
                key={i}
                onClick={() => navigate(feature.url)}
                className="group p-6 rounded-xl bg-card border border-border shadow-card hover:border-primary/30 hover:shadow-soft text-left transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <feature.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Full Tutorial */}
        <section className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground mb-2">How to Submit & Evaluate a Document</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              A step-by-step tutorial to get your first AI-graded submission done.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: 1,
                title: "Create a Class and Assignment",
                icon: BookOpen,
                action: "Go to Classes →",
                url: "/classes",
                details: [
                  'Click "New Class" on the Classes page to set up your course.',
                  "Inside the class, click 'New Assignment' and fill in the title and description.",
                  "Define the grading rubric: add criteria, point values, and descriptions so the AI knows what to evaluate.",
                ],
              },
              {
                step: 2,
                title: "Upload Student Submissions",
                icon: Upload,
                action: "Go to an Assignment →",
                url: "/classes",
                details: [
                  'Open an assignment, then click "New Submission" or "Bulk Upload".',
                  "Upload a single PDF or a ZIP file containing multiple student PDFs.",
                  "Each file becomes an individual submission and is queued for evaluation.",
                ],
              },
              {
                step: 3,
                title: "AI Evaluation Pipeline Runs",
                icon: Brain,
                action: null,
                url: null,
                details: [
                  "The AI pipeline automatically starts processing: text extraction, rubric matching, and scoring.",
                  "You can monitor real-time progress — each pipeline phase (extraction, analysis, scoring) updates live.",
                  "The AI drafts initial scores and written feedback for every criterion in your rubric.",
                ],
              },
              {
                step: 4,
                title: "Review, Edit & Approve",
                icon: CheckCircle2,
                action: "Go to Dashboard →",
                url: "/dashboard",
                details: [
                  'Submissions flagged for review appear in the Dashboard under "Needs Human Review".',
                  "Click into a submission to see the AI's proposed scores and feedback side-by-side with the original document.",
                  'Edit any scores or feedback you disagree with, then click "Approve" to finalize the grade.',
                ],
              },
            ].map(({ step, title, icon: Icon, action, url, details }) => (
              <div
                key={step}
                className="rounded-xl bg-card border border-border shadow-card overflow-hidden"
              >
                <div className="flex items-center gap-4 p-5 border-b border-border">
                  <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                    {step}
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground flex-1">{title}</h3>
                  {action && url && (
                    <button
                      onClick={() => navigate(url)}
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                    >
                      {action}
                    </button>
                  )}
                </div>
                <ul className="p-5 space-y-2.5">
                  {details.map((d, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="text-sm text-muted-foreground leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* CTA Banner */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-6 text-center space-y-3">
            <Bot className="h-8 w-8 text-primary mx-auto" />
            <h3 className="text-base font-semibold text-foreground">Ready to start?</h3>
            <p className="text-sm text-muted-foreground">
              Create your first class and let the AI do the heavy lifting.
            </p>
            <button
              onClick={() => navigate("/classes")}
              className="h-10 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-200 shadow-sm inline-flex items-center gap-2"
            >
              Create a Class
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

      </div>
    </DashboardLayout>
  );
}
