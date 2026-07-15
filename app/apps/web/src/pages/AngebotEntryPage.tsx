import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Link2, FileText, Trash2, Plus, Loader2, ArrowRight } from "lucide-react";
import type { DealPrefillResponse, DraftListItem } from "@emc2/shared";
import { bitrixApi } from "@/features/offer/bitrix";
import { draftsApi } from "@/features/offer/drafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Offer types (legacy OFFERS). Only BU is built in the new app; the rest are
// shown as "folgt" so the picker is complete and easy to extend.
const OFFER_TYPES: { key: string; label: string; enabled: boolean }[] = [
  { key: "bu", label: "BU · Badumbau", enabled: true },
  { key: "bwt", label: "BWT · Badewannentür", enabled: false },
  { key: "hl", label: "HL · Handlauf", enabled: false },
  { key: "ah", label: "AH · Alltagshilfe", enabled: false },
  { key: "bl", label: "BL · Badelift", enabled: false },
  { key: "hms", label: "HMS · Hausmeisterservice", enabled: false },
  { key: "wd", label: "WD · Winterdienst", enabled: false },
];

export function AngebotEntryPage() {
  const [params, setParams] = useSearchParams();
  const dealId = (params.get("dealId") || "").trim();

  if (!dealId) return <DealIdPrompt onOpen={(id) => setParams({ dealId: id })} />;
  return <DealHome dealId={dealId} />;
}

function DealIdPrompt({ onOpen }: { onOpen: (id: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="font-display text-2xl font-bold">Neues Angebot</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ein Angebot beginnt mit einer Bitrix-Deal-ID.</p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = val.trim();
          if (id) onOpen(id);
        }}
      >
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Deal-ID eingeben …" inputMode="numeric" autoFocus />
        <Button type="submit" disabled={!val.trim()}>Öffnen <ArrowRight /></Button>
      </form>
    </div>
  );
}

function DealHome({ dealId }: { dealId: string }) {
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DealPrefillResponse | null>(null);
  const [dealErr, setDealErr] = useState(false);
  const [drafts, setDrafts] = useState<DraftListItem[] | null>(null);

  useEffect(() => {
    bitrixApi.dealPrefill(dealId).then(setDeal).catch(() => setDealErr(true));
  }, [dealId]);

  const reloadDrafts = () => draftsApi.list({ dealId }).then(setDrafts).catch(() => setDrafts([]));
  useEffect(() => { void reloadDrafts(); /* eslint-disable-next-line */ }, [dealId]);

  async function removeDraft(id: string) {
    await draftsApi.remove(id).catch(() => {});
    void reloadDrafts();
  }

  const startFresh = (type: string) => navigate(`/angebote/${type}?dealId=${encodeURIComponent(dealId)}`);
  const loadDraft = (d: DraftListItem) =>
    navigate(`/angebote/${d.offerType || "bu"}?dealId=${encodeURIComponent(dealId)}&draft=${encodeURIComponent(d.id)}`);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm font-semibold text-primary">
          <Link2 className="size-3.5" /> Deal #{dealId}
          {deal?.title ? ` · ${deal.title}` : dealErr ? " · nicht geladen" : ""}
        </span>
        {deal?.prefill && (deal.prefill.firstName || deal.prefill.lastName) && (
          <p className="mt-2 text-sm text-muted-foreground">
            {deal.prefill.salutation} {deal.prefill.firstName} {deal.prefill.lastName}
            {deal.prefill.city ? ` · ${deal.prefill.postalCode} ${deal.prefill.city}` : ""}
          </p>
        )}
      </header>

      {/* Existing drafts for this deal */}
      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Entwürfe für diesen Deal</h2>
        {drafts == null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Lädt …</p>
        ) : drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Noch keine Entwürfe.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <button type="button" onClick={() => loadDraft(d)} className="min-w-0 flex-1 text-left hover:underline">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.offerType.toUpperCase()}{d.customerName ? ` · ${d.customerName}` : ""}
                    {d.updatedAt ? ` · ${new Date(d.updatedAt).toLocaleString("de-DE")}` : ""}
                  </span>
                </button>
                <Button variant="outline" size="sm" onClick={() => loadDraft(d)}>Laden</Button>
                <button type="button" onClick={() => removeDraft(d.id)} aria-label="Löschen" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Start a new offer */}
      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Neues Angebot</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OFFER_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!t.enabled}
              onClick={() => t.enabled && startFresh(t.key)}
              className={cn(
                "flex items-center justify-between rounded-lg border p-4 text-left transition-colors",
                t.enabled ? "hover:border-primary hover:bg-accent" : "cursor-not-allowed opacity-50",
              )}
            >
              <span className="text-sm font-medium">{t.label}</span>
              {t.enabled ? <Plus className="size-4 text-primary" /> : <span className="text-xs text-muted-foreground">folgt</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
