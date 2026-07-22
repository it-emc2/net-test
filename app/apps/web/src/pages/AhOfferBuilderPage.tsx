import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Check, Loader2, Link2, Save } from "lucide-react";
import { AhOfferProvider, useAhOffer } from "@/features/offer/alltagshilfe/AhOfferContext";
import type { AhPayload } from "@/features/offer/alltagshilfe/ahPayload";
import { AhKundendatenStep } from "@/features/offer/alltagshilfe/AhKundendatenStep";
import { AhLeistungenStep } from "@/features/offer/alltagshilfe/AhLeistungenStep";
import { AhKostenStep } from "@/features/offer/alltagshilfe/AhKostenStep";
import { AhZusammenfassungStep } from "@/features/offer/alltagshilfe/AhZusammenfassungStep";
import { bitrixApi } from "@/features/offer/bitrix";
import { draftsApi } from "@/features/offer/drafts";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
  el: ReactNode;
}

// One step for now (Phase 1). Later phases append: Arbeitszeit, Alltagshilfe,
// Kosten, Zusammenfassung.
const STEPS: Step[] = [
  { key: "kundendaten", label: "Kundendaten", el: <AhKundendatenStep /> },
  { key: "leistungen", label: "Alltagshilfe", el: <AhLeistungenStep /> },
  { key: "kosten", label: "Kosten", el: <AhKostenStep /> },
  { key: "zusammenfassung", label: "Zusammenfassung", el: <AhZusammenfassungStep /> },
];

function customerName(p: AhPayload): string {
  const k = p.Kundendaten;
  return `${k.firstName || ""} ${k.lastName || ""}`.trim();
}

function autoDraftName(p: AhPayload): string {
  const k = p.Kundendaten;
  const who = (k.lastName || k.firstName || "Kunde").trim().replace(/\s+/g, "");
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  const stamp = `${z(d.getDate())}${z(d.getMonth() + 1)}${d.getFullYear()}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  return `ANG-AH-${who}-${stamp}`;
}

export function AhOfferBuilderPage() {
  return (
    <AhOfferProvider>
      <BuilderInner />
    </AhOfferProvider>
  );
}

function BuilderInner() {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const { payload, patchSection, replacePayload } = useAhOffer();

  const [params] = useSearchParams();
  const urlDealId = (params.get("dealId") || "").trim();
  const urlDraftId = (params.get("draft") || "").trim();
  const appliedRef = useRef<string>("");
  const loadedRef = useRef<string>("");
  const [deal, setDeal] = useState<{ status: "idle" | "loading" | "ok" | "error"; title: string }>({ status: "idle", title: "" });

  // Prefill Kundendaten from the Bitrix deal (once per deal id; a loaded draft owns the payload).
  useEffect(() => {
    if (!urlDealId || urlDraftId || appliedRef.current === urlDealId) return;
    appliedRef.current = urlDealId;
    patchSection("Kundendaten", { dealId: urlDealId });
    setDeal({ status: "loading", title: "" });
    bitrixApi
      .dealPrefill(urlDealId)
      .then((r) => {
        const p = r.prefill;
        const patch: Record<string, string> = { bitrixContactId: r.contactId };
        (Object.keys(p) as (keyof typeof p)[]).forEach((key) => { if (p[key]) patch[key] = p[key] as string; });
        patchSection("Kundendaten", patch);
        setDeal({ status: "ok", title: r.title });
      })
      .catch(() => setDeal({ status: "error", title: "" }));
  }, [urlDealId, urlDraftId, patchSection]);

  const dealId = payload.Kundendaten.dealId;

  // Draft save.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; msg?: string }>({ status: "idle" });

  useEffect(() => {
    if (!urlDraftId || loadedRef.current === urlDraftId) return;
    loadedRef.current = urlDraftId;
    draftsApi
      .get(urlDraftId)
      .then((d) => {
        replacePayload(d.payload as unknown as AhPayload);
        setDraftId(d.id);
        setDraftName(d.name);
      })
      .catch(() => { /* fall back to a fresh payload */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDraftId]);

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
        customerName: customerName(payload),
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
    <div className="mx-auto max-w-3xl pb-24">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Neues Angebot · Alltagshilfe
          </p>
          {dealId && (
            <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary" title={deal.title || undefined}>
              {deal.status === "loading" ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
              Deal #{dealId}
              {deal.status === "ok" && deal.title ? ` · ${deal.title}` : ""}
              {deal.status === "error" ? " · nicht geladen" : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saveState.status === "saved" && (
            <span className="flex items-center gap-1 text-xs text-emerald-600" title={saveState.msg}>
              <Check className="size-3.5" /> Gespeichert
            </span>
          )}
          {saveState.status === "error" && <span className="text-xs text-destructive" title={saveState.msg}>Fehler</span>}
          <Button variant="default" size="sm" disabled={saveState.status === "saving"} onClick={() => saveDraft(false)}>
            {saveState.status === "saving" ? <Loader2 className="animate-spin" /> : <Save />} Speichern
          </Button>
          <Button variant="outline" size="sm" disabled={saveState.status === "saving"} onClick={() => saveDraft(true)}>
            Speichern unter…
          </Button>
        </div>
      </header>

      <nav className="mb-8 flex gap-2 overflow-x-auto pb-2" aria-label="Schritte">
        {STEPS.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setI(idx)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              idx === i ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <span className={cn("flex size-5 items-center justify-center rounded-full text-xs font-semibold", idx === i ? "bg-primary text-primary-foreground" : "bg-muted")}>
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

      <div className="mt-10 flex items-center justify-between border-t pt-6">
        <Button variant="outline" disabled={i === 0} onClick={() => setI((v) => Math.max(0, v - 1))}>
          <ChevronLeft /> Zurück
        </Button>
        <span className="text-sm text-muted-foreground">Schritt {i + 1} / {STEPS.length}</span>
        <Button disabled={i === STEPS.length - 1} onClick={() => setI((v) => Math.min(STEPS.length - 1, v + 1))}>
          Weiter <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
