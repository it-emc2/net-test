import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Check, X, Receipt } from "lucide-react";
import { OfferProvider, useOffer } from "@/features/offer/OfferContext";
import { PricingSidebar } from "@/features/offer/PricingSidebar";
import { useLivePricing } from "@/features/offer/pricing";
import { KundendatenStep, StepHeader } from "@/features/offer/steps/KundendatenStep";
import { ArbeitszeitStep } from "@/features/offer/steps/ArbeitszeitStep";
import { ArbeitenStep } from "@/features/offer/steps/ArbeitenStep";
import { DuschwanneStep } from "@/features/offer/steps/DuschwanneStep";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
  el: ReactNode;
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="space-y-6">
      <StepHeader title={title} />
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {note}
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  { key: "kundendaten", label: "Kundendaten", el: <KundendatenStep /> },
  { key: "arbeitszeit", label: "Arbeitszeit", el: <ArbeitszeitStep /> },
  { key: "arbeiten", label: "Arbeiten", el: <ArbeitenStep /> },
  { key: "duschwanne", label: "Duschwanne", el: <DuschwanneStep /> },
  { key: "fussboden", label: "Fußboden", el: <Placeholder title="Fußboden" note="Folgt." /> },
  { key: "wandverkleidung", label: "Wandverkleidung", el: <Placeholder title="Wandverkleidung" note="Folgt." /> },
  { key: "duschabtrennung", label: "Duschabtrennung", el: <Placeholder title="Duschabtrennung" note="Folgt." /> },
  { key: "optional", label: "Optional", el: <Placeholder title="Optional" note="Folgt." /> },
  { key: "rabatt", label: "Rabatt", el: <Placeholder title="Rabatt & Bonus" note="Folgt." /> },
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

  return (
    <div className="pb-24 lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8 lg:pb-0">
      <div className="min-w-0">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Neues Angebot · Badumbau
          </p>
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

        <div className="animate-fade-in">{step.el}</div>

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
