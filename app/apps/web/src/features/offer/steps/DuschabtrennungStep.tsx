import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { StepCalc } from "../StepCalc";
import { DaWizard } from "../duschabtrennung/DaWizard";
import { loadDaModel, type DaSupplier } from "../duschabtrennung/daModel";
import * as E from "../duschabtrennung/daEngine";
import type { WizardModel, WizardState } from "../duschabtrennung/daEngine";
import { cn } from "@/lib/utils";

interface Card {
  supplier: DaSupplier;
  state: WizardState;
}

const SUPPLIERS: { id: DaSupplier; label: string }[] = [
  { id: "vigour", label: "VIGOUR" },
  { id: "badolux", label: "Badolux" },
];

export function DuschabtrennungStep() {
  const { payload, patchSection } = useOffer();
  const cards: Card[] = Array.isArray(payload.duschabtrennung?.cards) ? payload.duschabtrennung.cards : [];

  const [models, setModels] = useState<Partial<Record<DaSupplier, WizardModel>>>({});
  const [loading, setLoading] = useState<DaSupplier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelsRef = useRef(models);
  modelsRef.current = models;

  // Ensure the model for every supplier in use (and any being added) is loaded.
  async function ensureModel(supplier: DaSupplier): Promise<WizardModel | null> {
    if (modelsRef.current[supplier]) return modelsRef.current[supplier]!;
    setLoading(supplier);
    setError(null);
    try {
      const m = await loadDaModel(supplier);
      setModels((prev) => ({ ...prev, [supplier]: m }));
      return m;
    } catch (e: any) {
      setError(e?.message || "Modell konnte nicht geladen werden");
      return null;
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    for (const s of new Set(cards.map((c) => c.supplier))) if (!models[s]) void ensureModel(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((c) => c.supplier).join(",")]);

  // Rebuild the priced quickAdd lines from every resolvable card.
  function writeCards(next: Card[]) {
    const quickAdd: any[] = [];
    for (const c of next) {
      const m = modelsRef.current[c.supplier];
      if (!m) continue;
      const r = E.resolveConfiguration(m, c.state);
      if (!r) continue;
      for (const line of r.lines) {
        quickAdd.push({
          kind: "config",
          label: line.article.displayName || line.component,
          qty: 1,
          price: line.article.net,
          productId: line.article.articleNumber,
          finish: line.article.finishText || null,
        });
      }
    }
    patchSection("duschabtrennung", { cards: next, quickAdd });
  }

  async function addCard(supplier: DaSupplier) {
    const m = await ensureModel(supplier);
    if (!m) return;
    writeCards([...cards, { supplier, state: E.settle(m, E.initialState()) }]);
  }

  const updateCard = (i: number, state: WizardState) => writeCards(cards.map((c, idx) => (idx === i ? { ...c, state } : c)));
  const removeCard = (i: number) => writeCards(cards.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      <StepHeader title="Duschabtrennung" hint="Konfigurieren Sie eine oder mehrere Duschabtrennungen (VIGOUR oder Badolux)." />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {cards.map((card, i) => {
        const model = models[card.supplier];
        return (
          <div key={i} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">
                Duschabtrennung {i + 1}
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {SUPPLIERS.find((s) => s.id === card.supplier)?.label}
                </span>
              </span>
              <button type="button" onClick={() => removeCard(i)} aria-label="Entfernen" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="p-4">
              {model ? (
                <DaWizard model={model} state={card.state} onChange={(s) => updateCard(i, s)} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Modell wird geladen …
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Add a card */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Duschabtrennung hinzufügen:</span>
        {SUPPLIERS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={loading != null}
            onClick={() => void addCard(s.id)}
            className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:bg-accent disabled:opacity-50")}
          >
            {loading === s.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {s.label}
          </button>
        ))}
      </div>

      <StepCalc filter={(l) => l.category === "Duschabtrennung"} />
    </div>
  );
}
