// Winterdienst (step `wd`) — the page today's UI shows for the type, with its fields and texts
// (rules.ts; test/wd-hms.test.tsx replays today's recordings). Hausmeister-Service (`hms`) is the
// same page (ServicePage). The section is written whole on every change, as today's buildPayload does.
import { Card, CardTitle, ChipGroup, Input } from "../../../shared/ui/index.js";
import { SketchPad, type Sketch } from "../../../shared/ui/sketch-pad.js";
import { useOfferStore } from "../../offer/index.js";
import { ART, HEADING, NOTE_PLACEHOLDER, REGULARITY, TEXT, afterOpening, formOf, sectionOf, type Form, type ServiceType } from "./rules.js";

type Fields = Record<string, unknown>;
const sectionIn = (offer: unknown, t: ServiceType): Fields => (((offer as Record<string, Fields> | null)?.[t] ?? {}) as Fields);

/** one change of the page: the section is written whole (fields it no longer has are removed) */
function write(t: ServiceType, change: Partial<Form>) {
  const store = useOfferStore.getState(), sec = sectionIn(store.offer, t), was = formOf(t, sec);
  // LEGACY QUIRK (ported, see bl/rules.ts): the first change on the page of an opened offer writes its empty sketch as the pad's empty drawing
  const opened = store.scratch[`${t}Changed`] === undefined && store.scratch.dwLineDefaulted === true;
  store.remember(`${t}Changed`, true);
  const next: Form = { ...was, ...(opened && !change.sketch ? { sketch: afterOpening(was.sketch) } : {}), ...change };
  const section = sectionOf(t, next);
  const gone = Object.fromEntries(Object.keys(sec).filter((k) => !(k in section)).map((k) => [k, undefined]));
  store.patch(t as never, { ...gone, ...section } as never);
}

export function ServicePage({ type: t }: { type: ServiceType }) {
  const f = formOf(t, useOfferStore((s) => sectionIn(s.offer, t)));
  const hours = (field: "perVisit" | "perMonth", label: string, placeholder: string) => (
    <label className="grid min-w-0 gap-1.5 font-semibold">{label}
      <Input type="number" min={0} step={0.5} inputMode="decimal" placeholder={placeholder} className="!border-control font-normal" data-field={field}
        value={f[field]} onChange={(e) => write(t, { [field]: e.target.value })} />
    </label>
  );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4" data-testid={`${t}-step`}>
      <Card aria-labelledby={`${t}-title`} className="min-w-0 grid-cols-1">
        <CardTitle id={`${t}-title`}>{HEADING[t]}</CardTitle>
        <ChipGroup legend={TEXT.art} name={`${t}-art`} options={ART} value={f.art} onChange={(v) => write(t, { art: v })} />
        <section className="grid min-w-0 grid-cols-1 gap-3" aria-labelledby={`${t}-conditions`} data-testid={`${t}-conditions`}>
          <div className="grid gap-1">
            <h3 id={`${t}-conditions`} className="m-0 text-[1.05rem] font-semibold">{TEXT.conditions}</h3>
            <p className="m-0 text-muted-foreground">{TEXT.conditionsLead}</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {hours("perVisit", TEXT.perVisit, "z.\u00a0B. 2")}
            {hours("perMonth", TEXT.perMonth, "z.\u00a0B. 8")}
          </div>
          <ChipGroup legend={TEXT.regularity} name={`${t}-regularity`} options={REGULARITY} value={f.regularity} onChange={(v) => write(t, { regularity: v })} />
        </section>
      </Card>
      <Card aria-label="Notizen und Skizze" className="min-w-0 grid-cols-1">
        <label htmlFor={`${t}Note`} className="grid gap-1.5 font-semibold">{TEXT.note}
          <textarea id={`${t}Note`} rows={8} placeholder={NOTE_PLACEHOLDER[t]} value={f.note} onChange={(e) => write(t, { note: e.target.value })}
            className="w-full rounded-lg border-2 border-control bg-card px-3.5 py-2.5 font-normal text-foreground placeholder:text-muted-foreground" />
        </label>
        {/* the pad's colour row does not wrap: on a phone it scrolls inside its own box, the page never sideways */}
        <div className="min-w-0 overflow-x-auto"><SketchPad value={f.sketch} onChange={(next: Sketch) => write(t, { sketch: next })} /></div>
      </Card>
    </div>
  );
}

export function Winterdienst() {
  return <ServicePage type="wd" />;
}
