import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Shield, Lock, Eye, EyeOff, KeyRound, AlertCircle, ArrowRight, Server } from "lucide-react";

export function MasterAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, login } = useAuth();
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    setTimeout(() => {
      const success = login(passwordInput.trim());
      if (!success) {
        setErrorMsg("Invalid Master Password. Access Denied.");
        setPasswordInput("");
      }
      setIsSubmitting(false);
    }, 200);
  };

  return (
    <div className="min-h-screen w-full bg-[#05070d] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[350px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 h-[250px] w-[250px] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none" />

      {/* Central Glassmorphism Lock Card */}
      <div className="w-full max-w-md relative z-10 rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-8 shadow-[0_0_50px_rgba(34,211,238,0.15)] backdrop-blur-2xl">
        {/* Header Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.4)]">
              <Shield className="h-8 w-8 stroke-[2.5]" />
            </div>
            <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-slate-900 border border-cyan-400 text-cyan-300">
              <Lock className="h-3 w-3" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5 mb-8">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold tracking-widest text-cyan-300 uppercase">
            <Server className="h-3 w-3" /> Hostinger VPS Master Gate
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AKS SEO Console</h1>
          <p className="text-xs text-slate-400">
            Protected VPS Endpoint · Enter Master Password to Access System
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-300 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-cyan-400" /> Master Access Password
              </span>
              <span className="text-[10px] text-slate-500 font-mono">03335148974@...</span>
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter master password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/90 py-3 pl-4 pr-11 font-mono text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !passwordInput.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 py-3 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Unlock Master Console</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[10px] text-slate-500">
            Safaeewala SEO Hub &amp; CRM · All Sessions Encrypted &amp; Logged
          </p>
        </div>
      </div>
    </div>
  );
}
