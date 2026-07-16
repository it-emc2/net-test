import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useOffer } from "./OfferContext";
import { useLivePricing } from "./pricing";
import { formatEUR } from "@/lib/format";

type LineFilter = (line: any) => boolean;

/** Small, low-key per-step calculation breakdown. Collapsed by default; the
 *  pricing hook only mounts when expanded, so unused = no extra API call. */
export function StepCalc({ filter, service = false }: { filter: LineFilter; service?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} Berechnung anzeigen
      </button>
      {open && <StepCalcBody filter={filter} service={service} />}
    </div>
  );
}

function clean(s: unknown): string {
  return String(s ?? "").replace(/^[\s•·–—-]+/, "").trim();
}

function StepCalcBody({ filter, service }: { filter: LineFilter; service: boolean }) {
  const { payload } = useOffer();
  const { result, loading } = useLivePricing(payload);

  if (loading && !result) {
    return <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> …</p>;
  }
  const all: any[] = (service ? result?.servicesDisplayUI?.lines ?? result?.services?.lines : result?.materialsDisplayUI?.lines ?? result?.materials?.lines) ?? [];
  const val = (l: any) => Number(service ? l.amount : l.lineTotal) || 0;
  const lines = all.filter(filter);
  const sum = lines.reduce((a, l) => a + val(l), 0);

  if (lines.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">Keine Positionen auf dieser Seite.</p>;
  }
  return (
    <div className="mt-2 space-y-1 text-xs">
      {lines.map((l, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3 text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{clean(l.label || l.name || l.productId || l.id)}</span>
          <span className="shrink-0 tabular-nums">{formatEUR(val(l))}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t pt-1 font-medium">
        <span>Zwischensumme (netto)</span>
        <span className="tabular-nums">{formatEUR(sum)}</span>
      </div>
    </div>
  );
}
