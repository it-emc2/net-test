import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Package, X } from "lucide-react";
import type { TraySuggestItem, TraySuggestResponse } from "@emc2/shared";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { suggestTrays, SLATE_COLORS } from "../trays";
import { productsApi } from "@/features/products/api";
import { StockBadge } from "@/features/products/StockBadge";
import { formatEUR } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AccessoryDef {
  key: string;
  label: string;
  /** Resolve the product id, which may depend on budget mode. */
  id: (budget: boolean) => string;
}

const ACCESSORIES: AccessoryDef[] = [
  { key: "abdichtSet", label: "Wannenabdichtband-Set", id: () => "TRWDB" },
  { key: "drainSet", label: "Ablaufgarnitur", id: (b) => (b ? "AGB001" : "AGD9060") },
  { key: "smallMaterial", label: "Kleinmaterial", id: (b) => (b ? "AC004" : "KM02") },
  { key: "stelzlager", label: "Stelzlager (Plattenlager)", id: () => "PLA5282" },
];

export function DuschwanneStep() {
  const { payload, patchSection } = useOffer();
  const d = payload.duschwanne;
  const set = (patch: Record<string, any>) => patchSection("duschwanne", patch);

  // Accessory images (Vigor). Ids depend on budget mode.
  const budget = !!d.budgetMode;
  const accIds = ACCESSORIES.map((a) => a.id(budget));
  const [accImages, setAccImages] = useState<Record<string, { image: string | null; name: string }>>({});
  useEffect(() => {
    let cancelled = false;
    productsApi
      .images(accIds)
      .then((m) => !cancelled && setAccImages(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget]);

  const [results, setResults] = useState<TraySuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const w = d.tray_w_cm ?? "";
  const l = d.tray_l_cm ?? "";
  const isSlate = String(d.chosenTrayProductId || "").toUpperCase().startsWith("SLA");

  useEffect(() => {
    if (!w && !l) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      suggestTrays(String(w), String(l))
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults(null))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [w, l]);

  function selectTray(t: TraySuggestItem) {
    const color = t.family === "sla" ? d.trayColor || "Weiss" : "";
    set({
      chosenTrayProductId: t.productId,
      traySize: t.sizeLabel,
      tray_w_cm: t.widthCm ? String(t.widthCm) : w,
      tray_l_cm: t.lengthCm ? String(t.lengthCm) : l,
      trayColor: color,
      // snapshot so the selection stays visible after the search changes
      selectedTrayInfo: {
        productId: t.productId,
        name: t.name,
        sizeLabel: t.sizeLabel,
        image: t.image,
        netPrice: t.netPrice,
        family: t.family,
        color,
      },
    });
  }

  function removeTray() {
    set({ chosenTrayProductId: "", traySize: "", trayColor: "", selectedTrayInfo: null });
  }

  const sel = d.selectedTrayInfo;

  return (
    <div className="space-y-8">
      <StepHeader title="Duschwanne" hint="Maße eingeben, passende Wanne wählen und Zubehör bestätigen." />

      {/* Selected tray — stays visible even after the search changes */}
      {d.chosenTrayProductId && sel && (
        <div className="flex items-center gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
            {sel.image ? (
              <img src={sel.image} alt="" className="size-full object-contain" />
            ) : (
              <Package className="size-6 text-muted-foreground" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Ausgewählte Duschwanne</p>
            <p className="truncate font-medium">{sel.name}</p>
            <p className="text-xs text-muted-foreground">
              {[sel.sizeLabel, sel.color, sel.productId].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-semibold tabular-nums">{formatEUR(Number(sel.netPrice) || 0)}</span>
            <button
              type="button"
              onClick={removeTray}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <X className="size-3.5" /> entfernen
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <Section title="Wanne suchen">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Breite (cm)" className="w-32">
            <Input inputMode="numeric" value={w} onChange={(e) => set({ tray_w_cm: e.target.value })} />
          </Field>
          <Field label="Länge (cm)" className="w-32">
            <Input inputMode="numeric" value={l} onChange={(e) => set({ tray_l_cm: e.target.value })} />
          </Field>
          {loading && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" />}
        </div>

        {results && (
          <div className="grid gap-4 md:grid-cols-2">
            <TrayList
              title="Slate (VIGOUR)"
              items={results.sla}
              selectedId={d.chosenTrayProductId}
              onSelect={selectTray}
              showStock
            />
            <TrayList
              title="Badolux"
              items={results.badolux}
              selectedId={d.chosenTrayProductId}
              onSelect={selectTray}
            />
          </div>
        )}
        {!results && !loading && (
          <p className="text-sm text-muted-foreground">Breite und/oder Länge eingeben, um passende Duschwannen zu finden.</p>
        )}
      </Section>

      {/* Slate colour — only when an SLA tray is chosen */}
      {isSlate && (
        <Section title="Farbe (Slate)">
          <div className="flex flex-wrap gap-2">
            {SLATE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ trayColor: c, selectedTrayInfo: sel ? { ...sel, color: c } : sel })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  d.trayColor === c ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Accessories */}
      <Section title="Zubehör">
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESSORIES.map((a) => {
            const pid = a.id(budget);
            const img = accImages[pid]?.image;
            const checked = !!d[a.key];
            return (
              <div
                key={a.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                  checked && "border-primary/40 bg-primary/[0.03]",
                )}
              >
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                  {img ? (
                    <img src={img} alt="" className="size-full object-contain p-1" loading="lazy" />
                  ) : (
                    <Package className="size-6 text-muted-foreground" />
                  )}
                </span>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => set({ [a.key]: e.target.checked })}
                    className="size-4 shrink-0 rounded border-input accent-[hsl(var(--primary))]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{pid}</span>
                  </span>
                </label>
                {a.key === "stelzlager" && checked && (
                  <Input
                    inputMode="numeric"
                    value={d.stelzlagerQty ?? "8"}
                    onChange={(e) => set({ stelzlagerQty: e.target.value })}
                    className="w-16 shrink-0"
                    aria-label="Stelzlager Menge"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Toggles */}
      <Section title="Optionen">
        <Check
          label="Budget-Modus (Badolux priorisieren, günstigere Ablauf-/Kleinmaterial-Varianten)"
          checked={!!d.budgetMode}
          onChange={(v) => set({ budgetMode: v })}
        />
        <Check
          label="Ebenerdige Montage — Hinweis zu möglichen Zusatzkosten einblenden"
          checked={!!d.ebenerdigeMontage}
          onChange={(v) => set({ ebenerdigeMontage: v })}
        />
      </Section>
    </div>
  );
}

function TrayList({
  title,
  items,
  selectedId,
  onSelect,
  showStock,
}: {
  title: string;
  items: TraySuggestItem[];
  selectedId: string;
  onSelect: (t: TraySuggestItem) => void;
  showStock?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">Keine Treffer.</p>}
      {items.map((t) => {
        const active = selectedId === t.productId;
        return (
          <button
            key={t.productId}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
            )}
          >
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-input")}>
              {active && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
              {t.image ? (
                <img src={t.image} alt="" className="size-full object-contain" loading="lazy" />
              ) : (
                <Package className="size-5 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">
                {t.sizeLabel || "—"} · {t.productId}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums">{formatEUR(t.netPrice)}</span>
              {showStock && <StockBadge inStock={t.inStock} quantity={t.stockQuantity} className="mt-0.5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      {label}
    </label>
  );
}
