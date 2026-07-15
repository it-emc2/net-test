import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, RefreshCw, MapPin, Phone, ArrowRight, Loader2 } from "lucide-react";
import { bitrixApi } from "@/features/offer/bitrix";
import { useTodaysPlanning, formatSlot, type PlanningEntry } from "./planning";
import { cn } from "@/lib/utils";

export function PlanningPanel() {
  const { entries, error, refresh } = useTodaysPlanning();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function open(e: PlanningEntry) {
    const id = String(e.id);
    if (e.importDealId) return navigate(`/angebote?dealId=${encodeURIComponent(String(e.importDealId))}`);
    const contact = e.bitrixContactId ?? e.contactId;
    if (contact) {
      setBusyId(id);
      try {
        const deals = await bitrixApi.dealsForContact(String(contact)).catch(() => []);
        if (deals[0]) return navigate(`/angebote?dealId=${encodeURIComponent(deals[0].id)}`);
      } finally {
        setBusyId(null);
      }
    }
    // No deal resolvable — send the user to the deal-id prompt.
    navigate("/angebote");
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide">
          <CalendarClock className="size-4 text-primary" /> Heutige Termine
        </h2>
        <button type="button" onClick={() => void refresh()} aria-label="Aktualisieren" className="rounded-md p-1 text-muted-foreground hover:bg-accent">
          <RefreshCw className="size-4" />
        </button>
      </div>

      {error ? (
        <p className="px-4 py-6 text-sm text-destructive">{error}</p>
      ) : entries == null ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Lädt …</p>
      ) : entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Keine Termine für heute.</p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => {
            const addr = e.address || [e.contactAddress?.street, [e.contactAddress?.postalCode, e.contactAddress?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
            return (
              <li key={String(e.id)} className={cn("flex items-center gap-3 px-4 py-3", e.cancelled && "opacity-50")}>
                <div className="w-16 shrink-0 text-sm font-semibold tabular-nums text-primary">{formatSlot(e) || "—"}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{e.name}</span>
                    {e.taetigkeitenBadge && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{e.taetigkeitenBadge}</span>}
                    {e.cancelled && <span className="shrink-0 text-[11px] text-destructive">abgesagt</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {addr && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {addr}</span>}
                    {e.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {e.phone}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void open(e)}
                  disabled={busyId === String(e.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:border-primary hover:bg-accent disabled:opacity-50"
                >
                  {busyId === String(e.id) ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Öffnen
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
