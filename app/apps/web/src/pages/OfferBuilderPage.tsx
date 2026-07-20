import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Check, X, Receipt, Loader2, Link2, Save, FileText, Mail } from "lucide-react";
import { OfferProvider, useOffer } from "@/features/offer/OfferContext";
import { bitrixApi } from "@/features/offer/bitrix";
import { draftsApi, autoDraftName, customerNameFromPayload } from "@/features/offer/drafts";
import { documentsApi } from "@/features/offer/documents";
import { SendOfferDialog } from "@/features/offer/SendOfferDialog";
import { PricingSidebar } from "@/features/offer/PricingSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLivePricing } from "@/features/offer/pricing";
import { KundendatenStep } from "@/features/offer/steps/KundendatenStep";
import { ArbeitszeitStep } from "@/features/offer/steps/ArbeitszeitStep";
import { ArbeitenStep } from "@/features/offer/steps/ArbeitenStep";
import { DuschwanneStep } from "@/features/offer/steps/DuschwanneStep";
import { FussbodenStep } from "@/features/offer/steps/FussbodenStep";
import { WandverkleidungStep } from "@/features/offer/steps/WandverkleidungStep";
import { OptionalStep } from "@/features/offer/steps/OptionalStep";
import { RabattStep } from "@/features/offer/steps/RabattStep";
import { DuschabtrennungStep } from "@/features/offer/steps/DuschabtrennungStep";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
  el: ReactNode;
}

const STEPS: Step[] = [
  { key: "kundendaten", label: "Kundendaten", el: <KundendatenStep /> },
  { key: "arbeitszeit", label: "Arbeitszeit", el: <ArbeitszeitStep /> },
  { key: "arbeiten", label: "Arbeiten", el: <ArbeitenStep /> },
  { key: "duschwanne", label: "Duschwanne", el: <DuschwanneStep /> },
  { key: "fussboden", label: "Fußboden", el: <FussbodenStep /> },
  { key: "wandverkleidung", label: "Wandverkleidung", el: <WandverkleidungStep /> },
  { key: "duschabtrennung", label: "Duschabtrennung", el: <DuschabtrennungStep /> },
  { key: "optional", label: "Optional", el: <OptionalStep /> },
  { key: "rabatt", label: "Aufschlag / Rabatt", el: <RabattStep /> },
];

export function OfferBuilderPage() {
  return (
    <OfferProvider>
      <BuilderInner />
    </OfferProvider>
  );
}

function BuilderInner() {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const { payload, patchSection, replacePayload } = useOffer();
  const budget = !!payload.duschwanne.budgetMode;

  // The offer begins from a Bitrix deal: /angebote?dealId=12345 → store the id
  // and prefill Kundendaten from the deal's linked contact (once per deal id).
  const [params] = useSearchParams();
  const urlDealId = (params.get("dealId") || "").trim();
  const urlDraftId = (params.get("draft") || "").trim();
  const appliedRef = useRef<string>("");
  const loadedRef = useRef<string>("");
  const [deal, setDeal] = useState<{ status: "idle" | "loading" | "ok" | "error"; title: string; msg: string }>({
    status: "idle", title: "", msg: "",
  });

  useEffect(() => {
    // Loading a saved draft owns the payload — skip the deal prefill.
    if (!urlDealId || urlDraftId || appliedRef.current === urlDealId) return;
    appliedRef.current = urlDealId;
    patchSection("Kundendaten", { dealId: urlDealId });
    setDeal({ status: "loading", title: "", msg: "" });
    bitrixApi
      .dealPrefill(urlDealId)
      .then((r) => {
        const p = r.prefill;
        const patch: Record<string, string> = { bitrixContactId: r.contactId };
        // Only fill fields the deal actually provides (don't wipe with blanks).
        (Object.keys(p) as (keyof typeof p)[]).forEach((k) => { if (p[k]) patch[k] = p[k]; });
        patchSection("Kundendaten", patch);
        setDeal({ status: "ok", title: r.title, msg: "" });
      })
      .catch((e) => setDeal({ status: "error", title: "", msg: e?.message || "Bitrix-Fehler" }));
  }, [urlDealId, patchSection]);

  const dealId = payload.Kundendaten.dealId;

  // Angebot actions (PDF preview + email send).
  const [sendOpen, setSendOpen] = useState(false);
  const [pdfState, setPdfState] = useState<{ status: "idle" | "loading" | "error"; msg?: string }>({ status: "idle" });
  async function openPdf() {
    setPdfState({ status: "loading" });
    try {
      await documentsApi.openPdf(payload);
      setPdfState({ status: "idle" });
    } catch (e: any) {
      setPdfState({ status: "error", msg: e?.message || "PDF fehlgeschlagen" });
    }
  }

  // Draft save (Phase 2). draftId is tracked so "Speichern" updates in place.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; msg?: string }>({ status: "idle" });

  // Load a saved draft (?draft=<id>) → replace the whole payload once; track its
  // id/name so subsequent "Speichern" updates it in place.
  useEffect(() => {
    if (!urlDraftId || loadedRef.current === urlDraftId) return;
    loadedRef.current = urlDraftId;
    draftsApi
      .get(urlDraftId)
      .then((d) => {
        replacePayload(d.payload as unknown as typeof payload);
        setDraftId(d.id);
        setDraftName(d.name);
      })
      .catch(() => { /* fall back to a fresh payload */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDraftId]);

  // Clear the saved/error badge as soon as the offer is edited again.
  useEffect(() => {
    setSaveState((s) => (s.status === "saved" || s.status === "error" ? { status: "idle" } : s));
  }, [payload]);

  async function saveDraft(asNew: boolean) {
    const name = asNew
      ? (window.prompt("Name des Entwurfs:", autoDraftName(payload)) || "").trim()
      : draftName || autoDraftName(payload);
    if (!name) return;
    setSaveState({ status: "saving" });
    try {
      const saved = await draftsApi.save({
        id: asNew ? undefined : draftId || undefined,
        name,
        offerType: payload.offerType,
        dealId: payload.Kundendaten.dealId || "",
        customerName: customerNameFromPayload(payload),
        payload: payload as unknown as Record<string, unknown>,
      });
      setDraftId(saved.id);
      setDraftName(saved.name);
      setSaveState({ status: "saved", msg: saved.name });
    } catch (e: any) {
      setSaveState({ status: "error", msg: e?.message || "Speichern fehlgeschlagen" });
    }
  }

  return (
    <div className="pb-24 lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8 lg:pb-0">
      <div className="min-w-0">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Neues Angebot · Badumbau
            </p>
            {dealId && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"
                title={deal.title || undefined}
              >
                {deal.status === "loading" ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
                Deal #{dealId}
                {deal.status === "ok" && deal.title ? ` · ${deal.title}` : ""}
                {deal.status === "error" ? " · nicht geladen" : ""}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Save status */}
            {saveState.status === "saved" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600" title={saveState.msg}>
                <Check className="size-3.5" /> Gespeichert
              </span>
            )}
            {saveState.status === "error" && (
              <span className="text-xs text-destructive" title={saveState.msg}>Fehler</span>
            )}
            <Button variant="default" size="sm" disabled={saveState.status === "saving"} onClick={() => saveDraft(false)}>
              {saveState.status === "saving" ? <Loader2 className="animate-spin" /> : <Save />} Speichern
            </Button>
            <Button variant="outline" size="sm" disabled={saveState.status === "saving"} onClick={() => saveDraft(true)}>
              Speichern unter…
            </Button>

            {/* Angebot output: preview PDF + send by email */}
            <Button variant="outline" size="sm" disabled={pdfState.status === "loading"} onClick={openPdf} title={pdfState.msg}>
              {pdfState.status === "loading" ? <Loader2 className="animate-spin" /> : <FileText />} PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSendOpen(true)}>
              <Mail /> Senden
            </Button>

            {/* Global Budget-Modus — affects tray/accessory swaps and budget floors */}
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                budget ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              <input
                type="checkbox"
                checked={budget}
                onChange={(e) => patchSection("duschwanne", { budgetMode: e.target.checked })}
                className="size-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              Budget-Modus
            </label>
          </div>
        </header>

        {/* Step nav — horizontal scroll, works on mobile + desktop */}
        <nav className="mb-8 flex gap-2 overflow-x-auto pb-2" aria-label="Schritte">
          {STEPS.map((s, idx) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setI(idx)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                idx === i
                  ? "border-primary bg-primary/10 text-primary"
                  : idx < i
                    ? "text-muted-foreground hover:bg-accent"
                    : "text-muted-foreground hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-xs font-semibold",
                  idx === i ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {idx < i ? <Check className="size-3" /> : idx + 1}
              </span>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="animate-fade-in">
          <ErrorBoundary key={step.key} area={step.label}>
            {step.el}
          </ErrorBoundary>
        </div>

        {/* Prev / Next */}
        <div className="mt-10 flex items-center justify-between border-t pt-6">
          <Button variant="outline" disabled={i === 0} onClick={() => setI((v) => Math.max(0, v - 1))}>
            <ChevronLeft /> Zurück
          </Button>
          <span className="text-sm text-muted-foreground">
            Schritt {i + 1} / {STEPS.length}
          </span>
          <Button disabled={i === STEPS.length - 1} onClick={() => setI((v) => Math.min(STEPS.length - 1, v + 1))}>
            Weiter <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Desktop: sticky pricing sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-8">
          <PricingSidebar />
        </div>
      </aside>

      {/* Mobile: sticky bottom pricing bar + sheet */}
      <MobilePricing />

      <SendOfferDialog payload={payload} open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  );
}

function MobilePricing() {
  const { payload } = useOffer();
  const { result } = useLivePricing(payload);
  const [open, setOpen] = useState(false);
  const isKK = payload.Kundendaten.payer === "Kassenkunde";
  const headline = isKK ? result?.selfPayAmount : result?.total;
  const headlineLabel = isKK ? "Selbstkostenanteil" : "Gesamt";

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t bg-card/95 px-4 py-3 backdrop-blur"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Receipt className="size-4" /> {headlineLabel}
        </span>
        <span className="font-display text-lg font-bold tabular-nums text-primary">
          {headline == null ? "—" : formatEUR(headline)}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-semibold">Kalkulation</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Schließen" className="rounded-md p-1 hover:bg-accent">
                <X className="size-5" />
              </button>
            </div>
            <PricingSidebar />
          </div>
        </div>
      )}
    </div>
  );
}
