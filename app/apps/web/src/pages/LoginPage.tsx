import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { ApiRequestError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FromState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → skip the form.
  if (!loading && user) {
    const dest = (location.state as FromState | null)?.from?.pathname ?? "/";
    return <Navigate to={dest} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const dest = (location.state as FromState | null)?.from?.pathname ?? "/";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4">
      {/* Ambient brand glow — the one flourish on an otherwise quiet screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-4">
          {/* White badge keeps the navy wordmark legible in dark mode too. */}
          <div className="rounded-2xl bg-white px-6 py-4 shadow-sm ring-1 ring-black/5">
            <img
              src="/assets/logo.png"
              alt="emc² – Dienstleister fürs Leben"
              className="h-16 w-auto"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Konfigurator
          </p>
        </div>

        <div className="rounded-xl border bg-card p-8 shadow-lg shadow-primary/5">
          <h1 className="font-display text-xl font-semibold">Anmelden</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Melde dich mit deinem Firmenkonto an.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" autoComplete="on">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Wird angemeldet …" : "Anmelden"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
