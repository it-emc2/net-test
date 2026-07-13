import { useEffect, useState } from "react";
import { Users, UserCheck, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

interface AdminSummary {
  users: { total: number; active: number; admins: number };
}

export function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AdminSummary>("/api/admin/summary")
      .then((res) => !cancelled && setSummary(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = summary
    ? [
        { label: "Benutzer gesamt", value: summary.users.total, icon: Users },
        { label: "Aktiv", value: summary.users.active, icon: UserCheck },
        { label: "Administratoren", value: summary.users.admins, icon: ShieldCheck },
      ]
    : [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Administration
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Benutzer</h1>
        <p className="mt-2 text-muted-foreground">Überblick über die Benutzerkonten.</p>
      </header>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
                </CardContent>
              </Card>
            ))
          : stats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-center gap-4 p-5">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <stat.icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-display text-2xl font-bold tabular-nums">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
