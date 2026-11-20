// Alltagshilfe · Finanzierung (UX-CHANGES U-050, owner 2026-11-20, mock approved): the total on top,
// one tick card per funding source (Entlastungsbetrag, Verhinderungspflege, Umwidmung), the folded
// consultation checklist. Every tap is stored and priced at once; no confirm buttons. Selbstzahler:
// the total block and one sentence. Rules, stored shape, Pflegegrad defaults/warnings: fin-rules.ts;
// the automatic Entlastungsbetrag tick after a Pflegegrad answer: funding.ts; budget mode re-fit: settle.ts.
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { euro } from "../../../shared/lib/format.js";
import { CHIP, CHIP_OFF, CHIP_ON, Card, Stepper, TickRow, cn } from "../../../shared/ui/index.js";
import { useAhConfig, useAhPrice, useOfferStore } from "../../offer/index.js";
import {
  CHECKLIST, careOf, checkedCount, ebWarnings, finFields, finOf, levelText, parseEuroInput, stepAmount, amountText,
  vpFirst, vpMax, vpRest, vpValue, vpWarnings, type Fin,
} from "./fin-rules.js";
import { AhSummary } from "./Summary.js";

type F = Record<string, any>;
const st = () => useOfferStore.getState();
const finNow = () => finOf((st().offer as F | null)?.Finanzierung);
/** store the whole form with this change (today's formToObject shape) */
const write = (change: Partial<Fin>) => st().patch("Finanzierung" as never, finFields({ ...finNow(), ...change }) as never);
/** „131 €“, „201,50 €“ */
const money = (n: number) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)} €`;

function Warnings({ items, id }: { items: string[]; id: string }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1" id={id} data-testid={id}>
      {items.map((w) => (
        <p key={w} className="m-0 flex items-center gap-2 rounded-md bg-warning-weak px-2.5 py-1.5 font-semibold text-warning-strong" data-part="warning">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />{w}
        </p>
      ))}
    </div>
  );
}

function SourceTitle({ title, sub }: { title: string; sub: string }) {
  return <>{title}<span className="block text-[0.95rem] font-normal text-muted-foreground" data-part="sub">{sub}</span></>;
}

function EntlastungCard({ x, offer }: { x: Fin; offer: F }) {
  const cfg = useAhConfig();
  const c = careOf(offer);
  const amount = cfg.entlastungsbetragMonat * (c.zwei ? 2 : 1);
  const sub = [`${money(amount)} pro Monat`, c.zwei ? "2 Personen" : "", levelText(c)].filter(Boolean).join(" · ");
  return (
    <Card data-testid="ah-fin-eb" className="gap-3">
      <TickRow id="ah-fin-eb-tick" checked={x.eb} onChange={(on) => write({ eb: on })} className="text-[1.15rem] font-bold"><SourceTitle title="Entlastungsbetrag" sub={sub} /></TickRow>
      {x.eb ? <Warnings items={ebWarnings(c)} id="ah-fin-eb-warn" /> : null}
    </Card>
  );
}

function VerhinderungCard({ x, offer }: { x: Fin; offer: F }) {
  const cfg = useAhConfig();
  const price = useAhPrice();
  const max = vpMax(cfg);
  const v = vpValue(x);
  const on = v > 0;
  const set = (n: number) => write({ vp: amountText(Math.min(max, Math.max(0, n))) });
  const rest = price ? vpRest(price, cfg) : 0;
  const shortcuts: [string, number][] = [["50 €", 50], ["100 €", 100], ["Maximum", max], ["Rest decken", rest]];
  return (
    <Card data-testid="ah-fin-vp" className="gap-3">
      <TickRow id="ah-fin-vp-tick" checked={on} onChange={(t) => (t ? set(price ? vpFirst(price, cfg) : 50) : write({ vp: "0" }))} className="text-[1.15rem] font-bold">
        <SourceTitle title="Verhinderungspflege" sub={`bis ${money(max)} pro Monat`} />
      </TickRow>
      {on ? (
        <div className="grid gap-3">
          <Stepper label="Verhinderungspflege pro Monat" words={["weniger", "mehr"]} value={euro(v)} canDown={v > 10} canUp={v < max} onStep={(dir) => set(stepAmount(v, dir, max))} data-testid="ah-fin-vp-amount" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Verhinderungspflege schnell wählen">
            {shortcuts.map(([label, n]) => (
              <button key={label} type="button" aria-pressed={n > 0 && Math.abs(n - v) < 0.005} disabled={label === "Rest decken" && n <= 0}
                onClick={() => set(Math.min(n, max))} className={cn(CHIP, n > 0 && Math.abs(n - v) < 0.005 ? CHIP_ON : CHIP_OFF, "disabled:cursor-default disabled:opacity-50")}>{label}</button>
            ))}
          </div>
          <Warnings items={vpWarnings(careOf(offer))} id="ah-fin-vp-warn" />
        </div>
      ) : null}
    </Card>
  );
}

function UmwidmungCard({ x }: { x: Fin }) {
  const value = Number(x.umBetrag) || 0;
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (x.umBetrag ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value) : "");
  const bad = draft !== null && parseEuroInput(draft) === null;
  return (
    <Card data-testid="ah-fin-um" className="gap-3">
      <TickRow id="ah-fin-um-tick" checked={x.um} onChange={(on) => write({ um: on })} className="text-[1.15rem] font-bold">
        <SourceTitle title="Umwidmung Pflegesachleistungen" sub="bewilligter Betrag pro Monat" />
      </TickRow>
      {x.um ? (
        <div className="grid gap-1.5">
          <Stepper label="Umwidmung pro Monat" words={["weniger", "mehr"]} value={euro(value)} canDown={value > 0} canUp
            onStep={(dir) => { setDraft(null); write({ umBetrag: amountText(stepAmount(value, dir, Infinity, 0)) }); }} data-testid="ah-fin-um-amount">
            <label className="flex min-h-12 items-center gap-1.5 rounded-lg border-2 border-control bg-card px-3 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring">
              <span className="sr-only">Bewilligter Betrag in Euro</span>
              <input id="ah-fin-um-input" inputMode="decimal" autoComplete="off" value={shown} placeholder="0" aria-invalid={bad} aria-describedby={bad ? "ah-fin-um-error" : undefined}
                onChange={(e) => { const t = e.target.value; setDraft(t); const n = parseEuroInput(t); if (n !== null) write({ umBetrag: t.trim() ? amountText(n) : "" }); }}
                onBlur={() => { if (!bad) setDraft(null); }}
                className="w-24 min-w-0 border-0 bg-transparent p-0 text-right text-[1.1rem] font-semibold tabular-nums text-foreground outline-none" />
              <span aria-hidden className="font-semibold">€</span>
            </label>
          </Stepper>
          {bad ? <p id="ah-fin-um-error" role="alert" className="m-0 font-semibold text-destructive" data-testid="ah-fin-um-error">Bitte einen Betrag in Euro eingeben, z. B. 120 oder 87,50.</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

function Checklist({ x }: { x: Fin }) {
  const [open, setOpen] = useState(false);
  return (
    <Card data-testid="ah-fin-checklist" className="gap-2 py-2">
      <button type="button" aria-expanded={open} aria-controls="ah-fin-cl" onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-1 text-left text-[1.05rem] font-semibold text-foreground">
        <span>Beratung · {checkedCount(x)} von {CHECKLIST.length} besprochen</span>
        <ChevronDown aria-hidden className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id="ah-fin-cl" className="grid gap-x-3 min-[520px]:grid-cols-2">
          {CHECKLIST.map(([k, label]) => <TickRow key={k} compact id={`ah-fin-${k}`} checked={!!x.checks[k]} onChange={(on) => write({ checks: { ...finNow().checks, [k]: on } })}>{label}</TickRow>)}
        </div>
      ) : null}
    </Card>
  );
}

export function AhFinanzierung() {
  const offer = (useOfferStore((s) => s.offer) ?? {}) as F;
  const price = useAhPrice();
  if (!price) return null;
  const x = finOf(offer.Finanzierung);
  return (
    <div className="grid gap-4" data-testid="ah-finanzierung">
      <h2 className="sr-only">Finanzierung</h2>
      <AhSummary price={price} big data-testid="ah-fin-summary" />
      {price.payer === "Selbstzahler" ? (
        <Card data-testid="ah-fin-sz"><p className="m-0">Für Selbstzahler werden keine Zuschüsse der Pflegekasse angerechnet.</p></Card>
      ) : (
        <>
          <EntlastungCard x={x} offer={offer} />
          <VerhinderungCard x={x} offer={offer} />
          <UmwidmungCard x={x} />
          <Checklist x={x} />
        </>
      )}
    </div>
  );
}
