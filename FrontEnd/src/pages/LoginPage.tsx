import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bot, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";



// ── Validation schemas ────────────────────────────────────────
const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignInData = z.infer<typeof signInSchema>;
type SignUpData = z.infer<typeof signUpSchema>;

// ── Field wrapper ─────────────────────────────────────────────
function FormField({
  label,
  id,
  type = "text",
  placeholder,
  error,
  showToggle,
  onToggle,
  registration,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  error?: string;
  showToggle?: boolean;
  onToggle?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registration: any;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-200">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          {...registration}
          className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-violet-400 focus:ring-violet-400/30 pr-10 h-11 rounded-xl transition-all"
        />
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
          >
            {type === "password" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
          <span className="inline-block w-1 h-1 rounded-full bg-red-400 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Sign In form ──────────────────────────────────────────────
function SignInForm({ onSwitch }: { onSwitch: () => void }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInData>({ resolver: zodResolver(signInSchema) });

  const onSubmit = async (data: SignInData) => {
    setLoading(true);
    try {
      await signIn(data.email, data.password);
      toast.success("Welcome back!");
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" id="signin-form">
      <FormField
        label="Email"
        id="signin-email"
        type="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        registration={register("email")}
      />
      <FormField
        label="Password"
        id="signin-password"
        type={showPw ? "text" : "password"}
        placeholder="••••••••"
        error={errors.password?.message}
        showToggle
        onToggle={() => setShowPw((v) => !v)}
        registration={register("password")}
      />

      <Button
        type="submit"
        id="signin-submit-btn"
        disabled={loading}
        className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-violet-900/40 mt-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : null}
        {loading ? "Signing in…" : "Sign In with Email"}
      </Button>

      <p className="text-center text-sm text-slate-400">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
          id="switch-to-signup-btn"
        >
          Create one
        </button>
      </p>
    </form>
  );
}

// ── Sign Up form ──────────────────────────────────────────────
function SignUpForm({ onSwitch }: { onSwitch: () => void }) {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpData>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = async (data: SignUpData) => {
    setLoading(true);
    try {
      const res = await signUp(data.email, data.password, data.fullName);
      if (res?.session) {
        toast.success("Account created successfully!");
        navigate("/");
      } else {
        setDone(true);
        toast.success("Account created! Check your email to confirm.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign up failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="h-16 w-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto">
          <Sparkles className="h-8 w-8 text-violet-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Almost there!</h3>
          <p className="text-slate-400 text-sm mt-1">
            We've sent a confirmation link to your email. Click it to activate your account.
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitch}
          className="text-violet-400 hover:text-violet-300 font-medium text-sm transition-colors"
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" id="signup-form">
      <FormField
        label="Full Name"
        id="signup-fullname"
        placeholder="Jane Smith"
        error={errors.fullName?.message}
        registration={register("fullName")}
      />
      <FormField
        label="Email"
        id="signup-email"
        type="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        registration={register("email")}
      />
      <FormField
        label="Password"
        id="signup-password"
        type={showPw ? "text" : "password"}
        placeholder="••••••••"
        error={errors.password?.message}
        showToggle
        onToggle={() => setShowPw((v) => !v)}
        registration={register("password")}
      />
      <FormField
        label="Confirm Password"
        id="signup-confirm-password"
        type={showConfirm ? "text" : "password"}
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        showToggle
        onToggle={() => setShowConfirm((v) => !v)}
        registration={register("confirmPassword")}
      />

      <Button
        type="submit"
        id="signup-submit-btn"
        disabled={loading}
        className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-violet-900/40 mt-2"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {loading ? "Creating account…" : "Create Account with Email"}
      </Button>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
          id="switch-to-signin-btn"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

// ── Main LoginPage ────────────────────────────────────────────
export default function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0f0d1a]">
      {/* Animated gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(124,58,237,0.25) 0%, transparent 60%), " +
            "radial-gradient(ellipse 60% 60% at 80% 80%, rgba(79,70,229,0.20) 0%, transparent 60%), " +
            "radial-gradient(ellipse 40% 40% at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Floating glow particles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-violet-500/10 blur-2xl animate-pulse"
            style={{
              width: `${80 + i * 40}px`,
              height: `${80 + i * 40}px`,
              left: `${10 + i * 15}%`,
              top: `${5 + (i % 3) * 30}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${3 + i}s`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Glow ring */}
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-violet-600/40 via-indigo-600/20 to-transparent blur-sm" />

        <div className="relative rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Top accent line */}
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-violet-500 to-transparent" />

          <div className="p-8">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-8">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-none tracking-tight">
                  GradioAI
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">AI Evaluation Workspace</p>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex rounded-xl bg-white/5 border border-white/10 p-1 mb-6" role="tablist">
              {(["signin", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={mode === tab}
                  id={`tab-${tab}`}
                  onClick={() => setMode(tab)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${mode === tab
                      ? "bg-violet-600 text-white shadow-md shadow-violet-900/40"
                      : "text-slate-400 hover:text-white"
                    }`}
                >
                  {tab === "signin" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">
                {mode === "signin" ? "Welcome back" : "Get started"}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {mode === "signin"
                  ? "Sign in to your workspace to continue"
                  : "Create your account and start reviewing"}
              </p>
            </div>

            {/* Forms */}
            <div
              key={mode}
              className="animate-in fade-in slide-in-from-right-4 duration-200"
            >
              {mode === "signin" ? (
                <SignInForm onSwitch={() => setMode("signup")} />
              ) : (
                <SignUpForm onSwitch={() => setMode("signin")} />
              )}
            </div>
          </div>

          {/* Bottom accent */}
          <div className="px-8 py-4 border-t border-white/5 bg-white/[0.02]">
            <p className="text-center text-[11px] text-slate-500">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
