// Aufschlag / Rabatt (ADR 026, phase 4): the overview of the sums, the markup (markup/Markup.tsx)
// and the discount part — opt-in, discount on materials, Neukundenbonus, free grab bar. The
// stored fields are exactly today's (test/rabatt.test.tsx compares with what today's UI stores
// and shows for the same inputs). The rules are rules.ts; every sum comes from the price.
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { call } from "../../../shared/api/index.js";
import { Card, CardTitle, Check, Choices } from "../../../shared/ui/index.js";
import { useOfferStore, useOfferType, usePrice } from "../../offer/index.js";
import { Markup } from "../markup/Markup.js";
import {
  GRAB_TEXT, corrections, grabIds, grabOffered, heading, isEnabled, mayDiscountMaterials, newCustomerBonus, newCustomerBonusOffered, overview, percentOf, percentText, results,
  setEnabled, setGrabBonus, setNewCustomerBonus, setPercent, type Price,
} from "./rules.js";

type Fields = Record<string, unknown>;
const useSection = (name: string) => useOfferStore((s) => (s.offer as Record<string, any> | null)?.[name] as Fields | undefined) ?? {};
const patch = (changes: Record<string, Fields>) => useOfferStore.getState().patchAll(changes);
const SUM = "flex items-baseline justify-between gap-4";

/** "Übersicht": the sums of the offer, as the price says. */
function Overview({ price }: { price: Price | null }) {
  const type = useOfferType();
  const pricingRules = useSection("pricingRules"), r = useSection("rabatt");
  const o = overview(price, type, pricingRules, r.sonderaufschlagValue);
  return (
    <Card aria-labelledby="rb-overview">
      <CardTitle id="rb-overview">Übersicht</CardTitle>
      <dl className="m-0 grid gap-3 text-[1.05rem]" data-testid="rb-sums">
        {o.rows.map((row) => (
          <div key={row.label} className={SUM} data-part="row">
            <dt className="flex items-center gap-2">{row.num ? <span data-part="num" className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[0.8rem] font-bold">{row.num}</span> : null}<span data-part="label">{row.label}</span></dt>
            <dd className="m-0 tabular-nums" data-part="value">{row.value}</dd>
          </div>
        ))}
        <div className={SUM}><dt>Nettobetrag</dt><dd className="m-0 tabular-nums" data-part="net">{o.net}</dd></div>
        <div className={SUM}><dt>zzgl. 19% MwSt.</dt><dd className="m-0 tabular-nums" data-part="vat">{o.vat}</dd></div>
        <div className={`${SUM} font-bold`}><dt>Gesamtbetrag</dt><dd className="m-0 tabular-nums" data-part="total">{o.total}</dd></div>
      </dl>
    </Card>
  );
}

/** The discount part. */
function Discount({ price }: { price: Price | null }) {
  const r = useSection("rabatt"), kd = useSection("Kundendaten"), pricingRules = useSection("pricingRules");
  const config = useQuery({ queryKey: ["public-config"], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("publicConfig", { signal }) }).data as Fields | undefined;
  const pending = usePrice().pending;
  const on = isEnabled(r), pct = percentOf(r);
  const bonus = newCustomerBonus(pricingRules), ids = grabIds(pricingRules, config);
  const slider = mayDiscountMaterials(kd.payer, kd.aufschlag);
  const offered = { bonus: newCustomerBonusOffered(price, bonus), grab: grabOffered(price, ids) };
  const out = results(r, price);
  // What no longer applies is taken back (as today): the discount on materials at once, the
  // bonuses once the price for the current state is there.
  useEffect(() => {
    const offer = (useOfferStore.getState().offer ?? {}) as Record<string, Fields | undefined>;
    const fix = corrections(offer, pending ? null : price, config);
    if (fix) patch(fix);
  });
  return (
    <Card aria-labelledby="rb-title">
      <CardTitle id="rb-title">{heading(kd.payer)}</CardTitle>
      <Choices legend="Rabatt" name="rb-add" options={[{ value: "nein", label: "Kein Rabatt" }, { value: "ja", label: "Rabatt hinzufügen" }]} value={on ? "ja" : "nein"} onChange={(v) => patch(setEnabled(v === "ja"))} />
      {on ? (
        <div className="grid gap-4" data-testid="rb-controls">
          {out.empty ? <p className="m-0 text-muted-foreground" data-testid="rb-empty">Keine Rabatte oder Boni anwendbar.</p> : null}
          {slider ? (
            <div className="grid gap-2">
              <label htmlFor="rb-material" className="font-semibold">Rabatt auf Materialkosten</label>
              <div className="flex items-center gap-3">
                <span aria-hidden>0%</span>
                <input id="rb-material" type="range" min={0} max={9} step={0.1} value={pct} aria-label="Rabatt in Prozent (0–9%)" onChange={(e) => patch(setPercent(parseFloat(e.target.value)))} className="h-12 min-w-0 flex-1 cursor-pointer accent-[var(--primary)]" />
                <span aria-hidden>9%</span>
                <output htmlFor="rb-material" data-testid="rb-percent" className="w-16 text-right font-semibold tabular-nums">{percentText(pct)}</output>
              </div>
            </div>
          ) : null}
          {out.discount ? (
            <dl className="m-0 grid gap-2" data-testid="rb-discount">
              <div className={SUM}><dt>Rabatt</dt><dd className="m-0 tabular-nums" data-part="amount">{out.discount}</dd></div>
              <div className={SUM}><dt>Gesamtbetrag nach Materialrabatt</dt><dd className="m-0 tabular-nums" data-part="after">{out.afterDiscount}</dd></div>
            </dl>
          ) : null}
          {offered.bonus ? <Check id="rb-bonus-new" checked={r.bonus300 === true} onChange={(v) => patch(setNewCustomerBonus(v))}>{bonus.text}</Check> : null}
          {offered.grab ? <Check id="rb-bonus-grab" checked={r.bonusGrab === true} onChange={(v) => patch(setGrabBonus(v, ids))}>{GRAB_TEXT}</Check> : null}
          {out.afterBonus ? <dl className="m-0"><div className={`${SUM} font-bold`}><dt>Gesamtbetrag nach Bonus</dt><dd className="m-0 tabular-nums" data-testid="rb-after-bonus">{out.afterBonus}</dd></div></dl> : null}
        </div>
      ) : null}
    </Card>
  );
}

export function Rabatt() {
  const price = usePrice().data as Price | null;
  return (
    <>
      <Overview price={price} />
      <Markup />
      <Discount price={price} />
    </>
  );
}
