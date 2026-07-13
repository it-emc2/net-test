import { useEffect, useState, type ReactNode } from "react";
import { Package } from "lucide-react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { productsApi } from "@/features/products/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const DECORS = [
  { value: "AVP-W|Weiß", label: "Weiß", pid: "AVP-W" },
  { value: "V5FB02|Lava-Beige", label: "Lava-Beige", pid: "V5FB02" },
  { value: "V5FB02|Schiefer-Beige", label: "Schiefer-Beige", pid: "V5FB02" },
  { value: "V5FB02|Loft-Grau", label: "Loft-Grau", pid: "V5FB02" },
  { value: "V5FB02|Speckstein-Schwarz", label: "Speckstein-Schwarz", pid: "V5FB02" },
  { value: "V5FB02|Eiche-Natur", label: "Eiche-Natur", pid: "V5FB02" },
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
  const selected: string = Array.isArray(d.flooringProduct) ? d.flooringProduct[0] ?? "" : "";

  const [img, setImg] = useState<Record<string, string | null>>({});
  useEffect(() => {
    productsApi
      .images(["V5FB02", "AVP-W"])
      .then((m) => setImg({ V5FB02: m.V5FB02?.image ?? null, "AVP-W": m["AVP-W"]?.image ?? null }))
      .catch(() => {});
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

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dekor</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DECORS.map((dec) => {
                const active = selected === dec.value;
                const image = img[dec.pid];
                return (
                  <button
                    key={dec.value}
                    type="button"
                    onClick={() => set({ flooringProduct: [dec.value] })}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
                    )}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                      {image ? (
                        <img src={image} alt="" className="size-full object-contain p-1" loading="lazy" />
                      ) : (
                        <Package className="size-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{dec.label}</span>
                      <span className="block text-xs text-muted-foreground">{dec.pid}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!d.floorSealing}
              onChange={(e) => set({ floorSealing: e.target.checked })}
              className="size-4 rounded border-input accent-[hsl(var(--primary))]"
            />
            Bodenabdichtung (TRINNITY TRBDSET7, pro m²)
          </label>

          <p className="text-xs text-muted-foreground">
            Paneele und Flächenkleber werden automatisch aus der Fläche berechnet und erscheinen in der
            Kostenübersicht.
          </p>
        </>
      )}
    </div>
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
