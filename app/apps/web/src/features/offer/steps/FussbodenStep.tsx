import { useEffect, useState, type ReactNode } from "react";
import { Package } from "lucide-react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { StepCalc } from "../StepCalc";
import { productsApi } from "@/features/products/api";
import { StockBadge } from "@/features/products/StockBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Decor {
  value: string;
  label: string;
  img?: string;
}

// Standard V5 / Aluverbund decors (priced via V5FB02 / AVP-W).
const DECORS: Decor[] = [
  { value: "AVP-W|Weiß", label: "Aluverbundplatte Weiß", img: "/assets/floor/aluverbund-weiss.jpg" },
  { value: "V5FB02|Lava-Beige", label: "Lava-Beige", img: "/assets/floor/lava-beige.jpg" },
  { value: "V5FB02|Schiefer-Beige", label: "Schiefer-Beige", img: "/assets/floor/schiefer-beige.jpg" },
  { value: "V5FB02|Loft-Grau", label: "Loft-Grau", img: "/assets/floor/loft-grau.jpg" },
  { value: "V5FB02|Speckstein-Schwarz", label: "Speckstein-Schwarz", img: "/assets/floor/speckstein-schwarz.jpg" },
  { value: "V5FB02|Eiche-Natur", label: "Eiche-Natur", img: "/assets/floor/eiche-natur.jpg" },
];

// Badolux budget floors (Bodenplatten, sold per 1,49 m² Paket). Shown only in
// Budget-Modus. Images reuse the current config's BP00x decor photos (same colours).
const BADOLUX_FLOORS: Decor[] = [
  { value: "BDX-BO-DN9031_004|Steingrau", label: "Steingrau (Budget)", img: "/assets/floor/budget/BP001.png" },
  { value: "BDX-BO-DN8604_009|Grau", label: "Grau (Budget)", img: "/assets/floor/budget/BP002.png" },
  { value: "BDX-BO-DN3403_6|Creme", label: "Creme (Budget)", img: "/assets/floor/budget/BP003.png" },
  { value: "BDX-BO-DN4595_5|Sahara", label: "Sahara (Budget)", img: "/assets/floor/budget/BP004.png" },
  { value: "BDX-BO-DN8604_003|Cafe", label: "Café (Budget)", img: "/assets/floor/budget/BP005.png" },
];

const FLOOR_KINDS = [
  { value: "Fehlstellen", label: "Nur Fehlstellen" },
  { value: "Gesamtes-Bad", label: "Gesamtes Bad" },
];

export function FussbodenStep() {
  const { payload, patchSection } = useOffer();
  const d = payload.duschwanne;
  const set = (patch: Record<string, any>) => patchSection("duschwanne", patch);
  const on = !!d.addFlooring;
  const budget = !!d.budgetMode;
  const selected: string = Array.isArray(d.flooringProduct) ? d.flooringProduct[0] ?? "" : "";

  // Images + stock for the auto-included floor accessories (Vigor).
  const [imgs, setImgs] = useState<Record<string, { image: string | null; name: string; stockQuantity: number | null; inStock: boolean }>>({});
  useEffect(() => {
    productsApi.images(["R_4260602", "TRBDSET7"]).then(setImgs).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <StepHeader title="Fußboden" hint="Optionaler Bodenbelag — Paneele werden aus der Fläche berechnet." />

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => set({ addFlooring: e.target.checked })}
          className="size-4 rounded border-input accent-[hsl(var(--primary))]"
        />
        Bodenbelag hinzufügen
      </label>

      {on && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fläche (m²)">
              <Input inputMode="decimal" value={d.floorArea ?? ""} onChange={(e) => set({ floorArea: e.target.value })} placeholder="z. B. 12,5" />
            </Field>
            <Field label="Umfang">
              <div className="flex gap-2">
                {FLOOR_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => set({ floorKind: k.value })}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                      d.floorKind === k.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <DecorGrid
            title={budget ? "Dekor (Badolux Budget)" : "Dekor"}
            decors={budget ? BADOLUX_FLOORS : DECORS}
            selected={selected}
            onSelect={(v) => set({ flooringProduct: [v] })}
          />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zubehör Fußboden</h3>

            {/* Flächenkleber — always included with flooring (auto qty from area) */}
            <div className="flex items-center gap-3 rounded-lg border bg-primary/[0.03] p-2.5">
              <AccImg img={imgs["R_4260602"]?.image || "/assets/floor/flaechenkleber.png"} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{imgs["R_4260602"]?.name || "Flächenkleber 600 ml"}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  R_4260602 · 1 Pkg je 0,60 m² (automatische Berechnung)
                  {imgs["R_4260602"] && <StockBadge inStock={imgs["R_4260602"].inStock} quantity={imgs["R_4260602"].stockQuantity} />}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">automatisch</span>
            </div>

            {/* Bodenabdichtung — optional (toggle adds TRBDSET7) */}
            <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors", d.floorSealing && "border-primary/40 bg-primary/[0.03]")}>
              <AccImg img={imgs["TRBDSET7"]?.image} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{imgs["TRBDSET7"]?.name || "TRINNITY Bodenabdichtung"}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  TRBDSET7 · 1 Set pauschal (automatische Berechnung)
                  {imgs["TRBDSET7"] && <StockBadge inStock={imgs["TRBDSET7"].inStock} quantity={imgs["TRBDSET7"].stockQuantity} />}
                </span>
              </span>
              <input
                type="checkbox"
                checked={!!d.floorSealing}
                onChange={(e) => set({ floorSealing: e.target.checked })}
                className="size-4 shrink-0 rounded border-input accent-[hsl(var(--primary))]"
              />
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Paneele und Flächenkleber werden automatisch aus der Fläche berechnet und erscheinen in der Kostenübersicht.
          </p>
        </>
      )}
      <StepCalc filter={(l) => l.category === "Fußboden"} />
    </div>
  );
}

function DecorGrid({
  title,
  decors,
  selected,
  onSelect,
}: {
  title: string;
  decors: Decor[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {decors.map((dec) => {
          const active = selected === dec.value;
          return (
            <button
              key={dec.value}
              type="button"
              onClick={() => onSelect(dec.value)}
              className={cn(
                "overflow-hidden rounded-lg border text-left transition-colors",
                active ? "border-primary ring-2 ring-primary" : "hover:border-primary/40",
              )}
            >
              <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-white">
                {dec.img ? (
                  <img src={dec.img} alt={dec.label} className="size-full object-cover" loading="lazy" />
                ) : (
                  <Package className="size-8 text-muted-foreground" />
                )}
              </span>
              <span className={cn("block px-3 py-2 text-sm font-medium", active && "text-primary")}>
                {dec.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AccImg({ img }: { img: string | null | undefined }) {
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
      {img ? <img src={img} alt="" className="size-full object-contain p-1" loading="lazy" /> : <Package className="size-6 text-muted-foreground" />}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
