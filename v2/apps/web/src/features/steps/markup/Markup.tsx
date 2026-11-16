// The markup part: value (field, quick buttons, slider), the minimum for the payer with the
// reason under it, and the calculation from a target price. Used in Kundendaten for Badelift
// and on the Aufschlag / Rabatt step for Badumbau, Badewannentür and Handlauf — as today.
import { useEffect, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, Check, Field, TextAreaField, cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { useOfferField, useOfferStore, useOfferType, usePrice } from "../../offer/index.js";
import { CHIPS, markupChanges, markupTextSection, markupView, parsePercent, percentText } from "./rules.js";
import { markupForTarget } from "./zielpreis.js";

/** the reason typed last — it stays in the field while the value is over the minimum (not stored then) */
const reasonNow = (): string => {
  const st = useOfferStore.getState();
  return String(st.scratch.markupReason ?? (st.offer as Record<string, any> | null)?.Kundendaten?.aufschlagBegruendung ?? "");
};

export function Markup() {
  const type = useOfferType();
  const section = markupTextSection(type);
  const raw = useOfferField<string>(section ?? "rabatt", "sonderaufschlagValue") ?? "";
  const payer = useOfferField<string>("Kundendaten", "payer");
  const storedReason = useOfferField<string>("Kundendaten", "aufschlagBegruendung");
  const typedReason = useOfferStore((s) => s.scratch.markupReason as string | undefined);
  const reason = typedReason ?? storedReason ?? "";
  const [targetOpen, setTargetOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const price = usePrice();
  if (!section) return null;

  const set = (text: string) => useOfferStore.getState().patchAll(markupChanges(type, text, payer, reasonNow()));
  const setReason = (text: string) => {
    const st = useOfferStore.getState();
    st.remember("markupReason", text);
    st.patchAll(markupChanges(type, raw, payer, text));
  };
  const reported = !!useOfferStore((st) => st.scratch.markupReported); // "Weiter" was pressed with the markup missing
  const view = markupView(raw, payer, reason, reported);
  const has = Number.isFinite(view.pct);

  const fromTarget = async (value: string) => {
    setBusy(true);
    try {
      const r = await markupForTarget(value, price.data as Record<string, unknown> | null, async (aufschlag) => {
        const offer = useOfferStore.getState().offer as Record<string, any>;
        return Number((await call("price", { body: { ...offer, Kundendaten: { ...offer.Kundendaten, aufschlag } } })).total);
      });
      if (r.ok) set(percentText(Number(r.percent))); else toast.error(r.message);
    } catch {
      toast.error("Die Berechnung aus dem Zielpreis ist fehlgeschlagen. Bitte erneut versuchen.");
    } finally { setBusy(false); }
  };

  return (
    <Card aria-labelledby="markup-title">
      <CardTitle id="markup-title">Aufschlag</CardTitle>
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Aufschlag in Prozent" id="markup-value" inputMode="decimal" autoComplete="off" placeholder="z. B. 50" className="w-40"
          value={raw} onChange={(e) => set(e.target.value)} aria-invalid={!!view.error || view.below}
        />
        <p className="m-0 pb-3 text-[0.95rem] text-muted-foreground">{view.minLabel}</p>
      </div>
      {view.error ? <p className="m-0 font-semibold text-destructive" role="alert">{view.error}</p> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Aufschlag wählen">
        {CHIPS.map((c) => (
          <button
            key={c} type="button" aria-pressed={has && view.pct === c} onClick={() => set(percentText(c))}
            className={cn(
              "min-h-12 min-w-16 cursor-pointer rounded-lg border-2 px-4 font-semibold",
              has && view.pct === c ? "border-primary bg-accent-weak" : "border-input bg-card",
              c < view.min && "text-destructive",
            )}
          >
            {c}%
          </button>
        ))}
      </div>
      <input
        type="range" min={0} max={200} step={0.5} aria-label="Aufschlag Schieberegler" className="h-12 w-full accent-[var(--primary)]"
        value={has && view.pct >= 0 && view.pct <= 200 ? view.pct : 50} onChange={(e) => set(percentText(Number(e.target.value)))}
      />
      {view.below ? (
        <div className="grid gap-2 rounded-lg border-2 border-destructive p-4">
          <p className="m-0 font-semibold" role="status">{view.warning}</p>
          <TextAreaField label={view.reasonLabel} id="markup-reason" rows={3} value={reason} onChange={setReason} placeholder="z. B. Kunde hat Pflegegrad bereits früher genutzt" />
          {view.reasonMissing ? <p className="m-0 font-semibold text-destructive">Bitte eine Begründung eintragen, um fortzufahren.</p> : null}
          <p className="m-0 text-[0.9rem] text-muted-foreground">Wird mit dem Angebot gespeichert (intern, nicht im Kundendokument).</p>
        </div>
      ) : null}
      <div className="grid gap-3">
        <Button variant="outline" className="justify-self-start" aria-expanded={targetOpen} onClick={() => setTargetOpen((o) => !o)}>Aus Zielpreis berechnen</Button>
        {targetOpen ? (
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => { setTarget("4180"); void fromTarget("4180"); }}>4.180 €</Button>
            <Button variant="outline" disabled={busy} onClick={() => { setTarget("8360"); void fromTarget("8360"); }}>4.180×2 €</Button>
            <Field label="Zielpreis in €" id="markup-target" inputMode="decimal" autoComplete="off" className="w-40" value={target} onChange={(e) => setTarget(e.target.value)} />
            <Button disabled={busy} onClick={() => { void fromTarget(target); }}>{busy ? "Berechnet …" : "Berechnen"}</Button>
          </div>
        ) : null}
      </div>
      <OldRule />
    </Card>
  );
}

/** Offers stored under the old rule keep small material out of the markup. Only such an offer
 *  shows this switch — and keeps showing it once it is ticked, so the change can be taken back. */
function OldRule() {
  const inMarkup = useOfferStore((s) => (s.offer as Record<string, any> | null)?.pricingRules?.kleinInAufschlag) as boolean | undefined;
  const hasOffer = useOfferStore((s) => s.offer !== null);
  const old = useOfferStore((s) => s.scratch.kleinOldRule) === true;
  useEffect(() => { if (hasOffer && inMarkup !== true && !old) useOfferStore.getState().remember("kleinOldRule", true); }, [hasOffer, inMarkup, old]);
  if (!old) return null;
  return (
    <Check id="markup-klein" checked={inMarkup === true} onChange={(v) => useOfferStore.getState().patch("pricingRules" as never, { kleinInAufschlag: v } as never)}>
      Kleinmaterial im Aufschlag berücksichtigen (neue Regel). Dieses Angebot wurde noch nach der alten Regel gespeichert – Kleinmaterial ist derzeit vom Aufschlag ausgenommen.
    </Check>
  );
}
export { parsePercent };
