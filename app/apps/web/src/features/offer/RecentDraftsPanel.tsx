import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Loader2, ArrowUpRight } from "lucide-react";
import type { DraftListItem } from "@emc2/shared";
import { draftsApi } from "./drafts";

export function draftHref(d: DraftListItem): string {
  const q = new URLSearchParams({ dealId: d.dealId || "", draft: d.id });
  return `/angebote/${d.offerType || "bu"}?${q.toString()}`;
}

export function RecentDraftsPanel() {
  const [drafts, setDrafts] = useState<DraftListItem[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    draftsApi.list({}).then((d) => setDrafts(d.slice(0, 5))).catch(() => setDrafts([]));
  }, []);

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide">
          <FileText className="size-4 text-primary" /> Zuletzt bearbeitete Entwürfe
        </h2>
        <Link to="/entwuerfe" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Alle <ArrowUpRight className="size-3" />
        </Link>
      </div>
      {drafts == null ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Lädt …</p>
      ) : drafts.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Noch keine Entwürfe.</p>
      ) : (
        <ul className="divide-y">
          {drafts.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => navigate(draftHref(d))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.offerType.toUpperCase()}{d.dealId ? ` · Deal #${d.dealId}` : ""}{d.updatedAt ? ` · ${new Date(d.updatedAt).toLocaleString("de-DE")}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
