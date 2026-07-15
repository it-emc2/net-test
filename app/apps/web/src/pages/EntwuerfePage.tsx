import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, Loader2, Trash2 } from "lucide-react";
import type { DraftListItem } from "@emc2/shared";
import { draftsApi } from "@/features/offer/drafts";
import { draftHref } from "@/features/offer/RecentDraftsPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function EntwuerfePage() {
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<DraftListItem[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      draftsApi.list({ q: q.trim() || undefined }).then(setDrafts).catch(() => setDrafts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function remove(id: string) {
    await draftsApi.remove(id).catch(() => {});
    setDrafts((d) => (d ? d.filter((x) => x.id !== id) : d));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Angebote</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Entwürfe</h1>
      </header>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nach Name suchen …" className="pl-9" />
      </div>

      {drafts == null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Lädt …</p>
      ) : drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Keine Entwürfe gefunden.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => navigate(draftHref(d))} className="min-w-0 flex-1 text-left hover:underline">
                <span className="block truncate text-sm font-medium">{d.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {d.offerType.toUpperCase()}
                  {d.customerName ? ` · ${d.customerName}` : ""}
                  {d.dealId ? ` · Deal #${d.dealId}` : ""}
                  {d.updatedAt ? ` · ${new Date(d.updatedAt).toLocaleString("de-DE")}` : ""}
                </span>
              </button>
              <Button variant="outline" size="sm" onClick={() => navigate(draftHref(d))}>Laden</Button>
              <button type="button" onClick={() => remove(d.id)} aria-label="Löschen" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
