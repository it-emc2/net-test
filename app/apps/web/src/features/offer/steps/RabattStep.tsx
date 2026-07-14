import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { useLivePricing } from "../pricing";
import { formatEUR } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const AUFSCHLAG_CHIPS = [35, 40, 45, 50, 60];

const fmtPct = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

// "35%" | "35" | 0.35(number) → 35 (percent number)
function parsePct(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function RabattStep() {
  const { payload, patchSection } = useOffer();
  const { result } = useLivePricing(payload);
  const k = payload.Kundendaten;
  const r = payload.rabatt || {};

  const aufschlag = parsePct(k.aufschlag);
  const setAufschlag = (n: number) => patchSection("Kundendaten", { aufschlag: `${n}%` });

  const [zielOpen, setZielOpen] = useState(false);
  const [zielInput, setZielInput] = useState("");
  const [zielError, setZielError] = useState<string | null>(null);

  // Mirror of legacy applyAutomatisch: derive the Aufschlag % from a target gross total.
  // total is linear in the Aufschlag %, so with `below` we floor the % to the next
  // 0.01 down — guaranteeing the resulting total stays strictly under the target.
  function fromTarget(rawEur: string | number, below = false) {
    setZielError(null);
    if (!result) return setZielError("Bitte zuerst die Preisvorschau laden.");
    const { total, markup, markupPct, vatOnNet } = result;
    if (!markup || markup <= 0) return setZielError("Kein Aufschlag-Betrag vorhanden – Automatisch nicht möglich.");
    const targetTotal = parseFloat(String(rawEur).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(targetTotal) || targetTotal <= 0) return setZielError("Bitte einen gültigen Zielpreis eingeben.");
    const netAmount = total - (vatOnNet || 0);
    const factor = netAmount > 0 ? total / netAmount : 1.19;
    const exactPct = (markupPct + markupPct * (targetTotal - total) / (factor * markup)) * 100; // → percent
    // below: step down to the next lower 0.01 (strictly < exact → total strictly < target)
    const rounded = below ? (Math.ceil(exactPct * 100) - 1) / 100 : Math.round(exactPct * 100) / 100;
    if (!Number.isFinite(rounded) || rounded < 0)
      return setZielError("Der berechnete Aufschlag wäre negativ – der Zielpreis liegt unter den Selbstkosten.");
    setAufschlag(rounded);
  }

  const addRabatt = r.addRabatt === "ja";
  const discountPct = Number(r.materialDiscountPct || 0) * 100; // fraction → percent

  const setAdd = (on: boolean) =>
    patchSection("rabatt", on ? { addRabatt: "ja" } : { addRabatt: "nein", materialDiscountPct: 0 });
  const setDiscount = (pct: number) =>
    patchSection("rabatt", { materialDiscountPct: Math.min(9, Math.max(0, pct)) / 100 });

  return (
    <div className="space-y-6">
      <StepHeader title="Aufschlag / Rabatt" hint="Aufschlag festlegen, optional Materialrabatt und Boni ergänzen." />

      {/* --- Übersicht (live totals) --- */}
      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide">Übersicht</h3>
        <dl className="space-y-1.5 text-sm">
          <SumRow label="Material" value={result?.materials?.sum} />
          <SumRow label="Arbeit" value={result?.services?.sum} />
          <SumRow label="Aufschlag (ohne Kleinmaterial)" value={result?.markup} muted />
          <div className="my-2 border-t" />
          <SumRow label="Nettobetrag" value={result?.Nettobetrag} strong />
          <SumRow label="zzgl. 19% MwSt." value={result?.vatOnNet} muted />
          <div className="my-2 border-t" />
          <SumRow label="Gesamtbetrag" value={result?.total} strong big />
        </dl>
      </section>

      {/* --- Aufschlag --- */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Aufschlag</h3>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={String(aufschlag)}
            onChange={(e) => setAufschlag(parsePct(e.target.value))}
            className="w-28"
            aria-label="Aufschlag in Prozent"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {AUFSCHLAG_CHIPS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAufschlag(v)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                aufschlag === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              {v}%
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={200}
          step={0.5}
          value={aufschlag}
          onChange={(e) => setAufschlag(Number(e.target.value))}
          className="w-full accent-[hsl(var(--primary))]"
          aria-label="Aufschlag Schieberegler"
        />
        {aufschlag < 35 && (
          <p className="flex items-center gap-2 text-sm text-amber-600">
            <AlertTriangle className="size-4" /> Aufschlag liegt unter 35% – bitte prüfen.
          </p>
        )}

        {/* Aus Zielpreis berechnen */}
        <div>
          <button
            type="button"
            onClick={() => setZielOpen((v) => !v)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              zielOpen ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            Aus Zielpreis berechnen
          </button>
          {zielOpen && (
            <div className="mt-2 space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { t: 4180, label: "4.180 €" },
                  { t: 8360, label: "4.180×2 €" },
                ].map((p) => (
                  <button
                    key={p.t}
                    type="button"
                    onClick={() => { setZielInput(String(p.t)); fromTarget(p.t, true); }}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    {p.label}
                  </button>
                ))}
                <Input
                  inputMode="decimal"
                  value={zielInput}
                  onChange={(e) => setZielInput(e.target.value)}
                  placeholder="Zielpreis"
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">€</span>
                <button
                  type="button"
                  onClick={() => fromTarget(zielInput)}
                  className="rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  Berechnen
                </button>
              </div>
              {zielError && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4" /> {zielError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Gesamtbetrag (brutto) als Ziel; der Aufschlag wird passend gesetzt.</p>
            </div>
          )}
        </div>
      </section>

      {/* --- Rabatt --- */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Rabatt</h3>
        <div className="flex flex-wrap gap-2">
          <RadioPill label="Kein Rabatt" checked={!addRabatt} onSelect={() => setAdd(false)} />
          <RadioPill label="Rabatt hinzufügen" checked={addRabatt} onSelect={() => setAdd(true)} />
        </div>

        {addRabatt && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="rb-material-discount">Rabatt auf Materialkosten</label>
              <div className="flex items-center gap-3">
                <span className="w-8 text-right text-xs text-muted-foreground">0%</span>
                <input
                  id="rb-material-discount"
                  type="range"
                  min={0}
                  max={9}
                  step={0.1}
                  value={discountPct}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="flex-1 accent-[hsl(var(--primary))]"
                  aria-label="Rabatt in Prozent (0–9%)"
                />
                <span className="w-8 text-xs text-muted-foreground">9%</span>
                <span className="w-14 text-right text-sm font-medium tabular-nums">{fmtPct(discountPct)}</span>
              </div>
            </div>
            {!!result?.rabattAmount && (
              <dl className="space-y-1.5 text-sm">
                <SumRow label="Rabatt" value={-(result?.rabattAmount ?? 0)} muted />
                <SumRow label="Gesamtbetrag nach Materialrabatt" value={result?.total} strong />
              </dl>
            )}
          </div>
        )}

        {/* Boni */}
        <div className="space-y-2">
          <CheckPill
            checked={!!r.bonus300}
            onToggle={(on) => patchSection("rabatt", { bonus300: on })}
            label="Möchten Sie den Neu- oder Bestandskundenbonus in Höhe von 252,10 € hinzufügen? (Rabatt von 300 € ab einem Gesamtwert von 3.000 €)"
          />
          <CheckPill
            checked={!!r.bonusGrab}
            onToggle={(on) =>
              patchSection("rabatt", on ? { bonusGrab: true } : { bonusGrab: false, showFreeGrabInMaterial: false })
            }
            label="Aktion: Haltegriff GRATIS: 1 Haltegriff gratis im Wert von 175 € inkl. Lieferung und Montage."
          />
          {r.bonusGrab && (
            <div className="pl-7">
              <CheckPill
                dashed
                checked={!!r.showFreeGrabInMaterial}
                onToggle={(on) => patchSection("rabatt", { showFreeGrabInMaterial: on })}
                label="Möchten Sie die Haltegriffe im Angebot zeigen?"
              />
            </div>
          )}
          {!!result?.bonusGross && (
            <dl className="space-y-1.5 pt-1 text-sm">
              <SumRow label="Gesamtbetrag nach Bonus" value={result?.total} strong />
            </dl>
          )}
        </div>
      </section>
    </div>
  );
}

function SumRow({ label, value, strong, muted, big }: { label: string; value: number | undefined; strong?: boolean; muted?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn(muted && "text-muted-foreground", strong && "font-medium")}>{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold", big && "text-base", muted && "text-muted-foreground")}>
        {value == null ? "—" : formatEUR(value)}
      </dd>
    </div>
  );
}

function RadioPill({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
        checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

function CheckPill({ label, checked, onToggle, dashed }: { label: string; checked: boolean; onToggle: (on: boolean) => void; dashed?: boolean }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
        dashed && "border-dashed",
        checked ? "border-primary bg-primary/5" : "hover:bg-accent",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
      <span>{label}</span>
    </label>
  );
}
