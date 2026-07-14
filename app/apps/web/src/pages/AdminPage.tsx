import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AdminUser } from "@emc2/shared";
import { Users, UserCheck, ShieldCheck, Plus, Pencil, Package } from "lucide-react";
import { adminApi } from "@/features/admin/api";
import { UserDialog } from "@/features/admin/UserDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .listUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const stats = useMemo(
    () => [
      { label: "Benutzer gesamt", value: users.length, icon: Users },
      { label: "Aktiv", value: users.filter((u) => u.active).length, icon: UserCheck },
      { label: "Administratoren", value: users.filter((u) => u.role === "admin").length, icon: ShieldCheck },
    ],
    [users],
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(user: AdminUser) {
    setEditing(user);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Administration
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Benutzer</h1>
          <p className="mt-2 text-muted-foreground">Benutzerkonten verwalten.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/optional">
              <Package /> Optional-Katalog
            </Link>
          </Button>
          <Button onClick={openCreate}>
            <Plus /> Neuer Benutzer
          </Button>
        </div>
      </header>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <stat.icon className="size-5" />
              </span>
              <div>
                <p className="font-display text-2xl font-bold tabular-nums">
                  {loading ? "–" : stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">E-Mail</th>
                <th className="px-5 py-3 font-semibold">Rolle</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Letzte Anmeldung</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    Wird geladen …
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    Keine Benutzer vorhanden.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-5 py-3 font-medium">{u.name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-5 py-3">
                      <Badge tone={u.role === "admin" ? "primary" : "neutral"}>
                        {u.role === "admin" ? "Administrator" : "Benutzer"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={u.active ? "success" : "muted"}>
                        {u.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {u.lastLoginAt ? dateFmt.format(new Date(u.lastLoginAt)) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        <Pencil /> Bearbeiten
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} user={editing} onSaved={load} />
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "primary" | "success" | "neutral" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "success" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
