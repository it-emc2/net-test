// Alltagshilfe · Leistungen (UX-CHANGES U-048, owner 2026-11-20, mock approved): budget on top,
// the two services as tick cards (how often · how long · tasks), "Beides im selben Termin", the
// summary and the note. Every tap is stored and priced at once; no confirm / refresh / ⚡ / info
// buttons. Rules, stored shape and price: rules.ts; budget mode re-fit after changes: settle.ts.
import { ahDauer, parseDurationMinutes } from "@oc/pricing";
import { X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { euro } from "../../../shared/lib/format.js";
import { CHIP, CHIP_OFF, Card, ChipGroup, Label, Stepper, TickRow, cn } from "../../../shared/ui/index.js";
import { useAhConfig, useAhPrice, useOfferStore } from "../../offer/index.js";
import {
  KINDS, RATE, RHYTHMS_MAIN, RHYTHMS_MORE, TASKS, TITLE, autoShown, budgetOf, canStep, dauerText, hasAnyService, isActive, isMoreRhythm,
  isOtherRhythm, itemsOf, newItem, servicesFields, stepDauer, type Base, type Item, type Items, type Kind,
} from "./rules.js";
import { AhSummary } from "./Summary.js";
import { BASE_KEY } from "./settle.js";

type F = Record<string, any>;
const PARKED = "ah:parked", TOUCHED = "ah:autoTouched";
type Parked = Partial<Record<Kind, { item: Item; base?: number[] | undefined }>>;

const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as F;
const scratch = <T,>(k: string) => st().scratch[k] as T | undefined;
/** store the services (and other ah fields) in ONE change */
function write(items: Items, more: F = {}) { st().patch("ah" as never, { ...servicesFields(items), ...more } as never); }
function setBase(kind: Kind, mins: number[] | undefined) {
  const b = { ...(scratch<Base>(BASE_KEY) ?? {}) };
  if (mins) b[kind] = mins; else delete b[kind];
  st().remember(BASE_KEY, b);
}
const items = () => itemsOf(offerNow().ah ?? {});
const minutes = (it: Item) => it.schedules.map((r) => parseDurationMinutes(r.dauer));

function toggleService(kind: Kind, on: boolean) {
  const o = offerNow(), now = items();
  if (on) {
    const parked = scratch<Parked>(PARKED)?.[kind];
    const more: F = {};
    // a new offer starts in budget mode (U-048) — written with the first service
    if (!hasAnyService(o.ah ?? {}) && autoShown(o, scratch<boolean>(TOUCHED) === true)) more.ahEntlastungAuto = "on";
    setBase(kind, parked?.base);
    write({ ...now, [kind]: parked?.item ?? newItem(kind) }, more);
  } else {
    const it = now[kind];
    if (!it) return;
    const base = scratch<Base>(BASE_KEY)?.[kind];
    // keep the user's own durations (not the fitted ones) for a re-tick in this session
    const own = base && base.length === it.schedules.length ? { ...it, schedules: it.schedules.map((r, j) => ({ ...r, dauer: base[j] ? ahDauer(base[j]!) : r.dauer })) } : it;
    st().remember(PARKED, { ...(scratch<Parked>(PARKED) ?? {}), [kind]: { item: own, base } });
    setBase(kind, undefined);
    const next: Items = { ...now }; delete next[kind];
    write(next);
  }
}
function changeItem(kind: Kind, f: (it: Item) => Item) { const now = items(); if (now[kind]) write({ ...now, [kind]: f(now[kind]!) }); }
const setRhythm = (kind: Kind, j: number, v: string) => changeItem(kind, (it) => ({ ...it, schedules: it.schedules.map((r, n) => (n === j ? { ...r, regelmaessigkeit: v } : r)) }));
function stepRow(kind: Kind, j: number, dir: 1 | -1) {
  const it = items()[kind]; if (!it) return;
  const next = { ...it, schedules: it.schedules.map((r, n) => (n === j ? { ...r, dauer: stepDauer(r.dauer, dir) } : r)) };
  setBase(kind, minutes(next)); // a duration set by hand is the new base of budget mode
  write({ ...items(), [kind]: next });
}
function removeRow(kind: Kind, j: number) {
  const it = items()[kind]; if (!it || it.schedules.length < 2) return;
  const base = scratch<Base>(BASE_KEY)?.[kind];
  if (base && base.length === it.schedules.length) setBase(kind, base.filter((_m, n) => n !== j));
  write({ ...items(), [kind]: { ...it, schedules: it.schedules.filter((_r, n) => n !== j) } });
}
function toggleTask(kind: Kind, id: string, on: boolean) {
  // stored in the order of the list (today: the order of the ticked boxes on the page)
  changeItem(kind, (it) => ({ ...it, tasks: TASKS[kind].map((t) => t.id).filter((t) => (t === id ? on : it.tasks.includes(t))) }));
}
const setCombined = (on: boolean) => changeItem("ab", (it) => ({ ...it, combinedVisit: on }));
function setAuto(on: boolean) { st().remember(TOUCHED, true); st().patch("ah" as never, { ahEntlastungAuto: on ? "on" : undefined } as never); }

function Pill({ kind, children }: { kind: "ok" | "over" | "none"; children: string }) {
  return <span data-testid="ah-pill" data-kind={kind} className={cn("inline-flex min-h-8 items-center rounded-full px-3 text-[0.95rem] font-semibold",
    kind === "ok" ? "bg-success-weak text-success-strong" : kind === "over" ? "bg-warning-weak text-warning-strong" : "bg-muted text-foreground")}>{children}</span>;
}

function BudgetCard({ offer, used, any }: { offer: F; used: number; any: boolean }) {
  const cfg = useAhConfig();
  const touched = useOfferStore((s) => s.scratch[TOUCHED] === true);
  const { pathname, search } = useLocation();
  const { budget, none } = budgetOf(offer, cfg);
  if (budget === null) return (
    <Card data-testid="ah-budget" className="gap-2">
      <p className="m-0 text-muted-foreground">Gesamt pro Monat</p>
      <p className="m-0 text-[1.9rem] font-bold leading-tight tabular-nums" data-part="big">{euro(used)}</p>
      {none === "nicht-angerechnet" ? <p className="m-0" data-part="hint">Entlastungsbetrag wird nicht angerechnet · <Link to={`${pathname.replace(/\/ah$/, "/Finanzierung")}${search}`} className="font-semibold text-foreground underline underline-offset-2">Finanzierung</Link></p> : null}
    </Card>
  );
  const over = used > budget;
  return (
    <Card data-testid="ah-budget" className="gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="m-0 text-muted-foreground">Entlastungsbetrag pro Monat</p>
          <p className="m-0 text-[1.9rem] font-bold leading-tight tabular-nums" data-part="big">{euro(used)} <span className="text-[1.1rem] font-semibold text-muted-foreground">von {euro(budget)}</span></p>
        </div>
        {!any ? <Pill kind="none">Leistung wählen</Pill> : over ? <Pill kind="over">{`Zuzahlung ${euro(used - budget)}`}</Pill> : <Pill kind="ok">{`Rest ${euro(budget - used)}`}</Pill>}
      </div>
      <div role="progressbar" aria-label="Entlastungsbetrag genutzt" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={Math.min(used, budget)} className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width]", over ? "bg-warning-strong" : "bg-primary")} style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} />
      </div>
      <TickRow id="ah-auto" checked={autoShown(offer, touched)} onChange={setAuto} suffix="– Dauer passt sich an" data-testid="ah-auto">Im Budget bleiben</TickRow>
    </Card>
  );
}

function RhythmChips({ kind, j, value }: { kind: Kind; j: number; value: string }) {
  const [more, setMore] = useState(isMoreRhythm(value));
  const shown = more || isMoreRhythm(value);
  const options = [...RHYTHMS_MAIN, ...(shown ? RHYTHMS_MORE : []), ...(isOtherRhythm(value) ? [[value, value] as const] : [])].map(([v, label]) => ({ value: v, label }));
  return (
    <ChipGroup legend="Wie oft" name={`ah-${kind}-rh-${j}`} options={options} value={value} onChange={(v) => setRhythm(kind, j, v)}>
      {!shown ? <button type="button" aria-expanded={false} onClick={() => setMore(true)} className={cn(CHIP, CHIP_OFF)}>Weitere</button> : null}
    </ChipGroup>
  );
}

function ServiceCard({ kind, item, auto }: { kind: Kind; item: Item | undefined; auto: boolean }) {
  const on = !!item;
  return (
    <Card data-testid={`ah-svc-${kind}`} className="gap-4">
      <TickRow id={`ah-${kind}`} checked={on} onChange={(v) => toggleService(kind, v)} className="text-[1.15rem] font-bold">
        {TITLE[kind]}{" "}<span className="block text-[0.95rem] font-normal text-muted-foreground">{euro(RATE[kind])} pro Stunde</span>
      </TickRow>
      {item ? (
        <div className="grid gap-5">
          {item.schedules.map((r, j) => (
            <div key={j} className={cn("grid gap-4", item.schedules.length > 1 && "rounded-lg border border-border p-3")} data-testid={`ah-${kind}-row-${j}`}>
              {item.schedules.length > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 font-semibold">{`Zeit ${j + 1}`}</p>
                  <button type="button" aria-label={`Zeit ${j + 1} entfernen`} onClick={() => removeRow(kind, j)} className="grid size-12 cursor-pointer place-items-center rounded-lg border-2 border-control bg-card text-foreground"><X aria-hidden className="size-5" /></button>
                </div>
              ) : null}
              <RhythmChips kind={kind} j={j} value={r.regelmaessigkeit} />
              <div className="grid gap-2">
                <p className="m-0 font-semibold" id={`ah-${kind}-d-${j}`}>Dauer pro Einsatz</p>
                {auto
                  ? <p className="m-0 flex min-h-12 items-center gap-2" data-testid={`ah-${kind}-auto-${j}`}><span className="text-[1.1rem] font-semibold tabular-nums">{dauerText(r.dauer)}</span><span className="text-muted-foreground">automatisch</span></p>
                  : <Stepper label="Dauer pro Einsatz" value={dauerText(r.dauer)} canDown={canStep(r.dauer, -1)} canUp={canStep(r.dauer, 1)} onStep={(dir) => stepRow(kind, j, dir)} data-testid={`ah-${kind}-dauer-${j}`} />}
              </div>
            </div>
          ))}
          <fieldset className="m-0 grid min-w-0 gap-1 border-0 p-0">
            <legend className="mb-1 p-0 font-semibold">Aufgaben · {item.tasks.length} gewählt</legend>
            <div className="grid gap-x-3 min-[520px]:grid-cols-2" data-testid={`ah-${kind}-tasks`}>
              {TASKS[kind].map((t) => <TickRow key={t.id} compact id={`ah-${kind}-t-${t.id}`} checked={item.tasks.includes(t.id)} onChange={(v) => toggleTask(kind, t.id, v)}>{t.label}</TickRow>)}
            </div>
          </fieldset>
        </div>
      ) : null}
    </Card>
  );
}

function Note() {
  const note = useOfferStore((s) => String((s.offer as F | null)?.ah?.ahNote ?? ""));
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="ah-note">Notizen</Label>
      <textarea id="ah-note" rows={open || note.includes("\n") ? 5 : 1} value={note} onFocus={() => setOpen(true)} onChange={(e) => st().patch("ah" as never, { ahNote: e.target.value } as never)}
        className="min-h-12 w-full resize-y rounded-lg border-2 border-control bg-card px-3.5 py-2.5 text-foreground" />
    </div>
  );
}

export function AhLeistungen() {
  const offer = (useOfferStore((s) => s.offer) ?? {}) as F;
  const cfg = useAhConfig();
  const price = useAhPrice();
  if (!price) return null;
  const its = itemsOf(offer.ah ?? {});
  const any = KINDS.some((k) => its[k]);
  const { budget } = budgetOf(offer, cfg);
  // budget mode shows the computed durations — unless nothing fits, then the user's own (with − / +)
  const auto = isActive(offer, cfg) && budget !== null && price.net <= budget;
  return (
    <div className="grid gap-4" data-testid="ah-leistungen">
      <h2 className="sr-only">Leistungen</h2>
      <BudgetCard offer={offer} used={price.gross} any={any} />
      {KINDS.map((k) => <ServiceCard key={k} kind={k} item={its[k]} auto={auto} />)}
      {its.hnd && its.ab ? (
        <Card className="py-3"><TickRow id="ah-combined" checked={its.ab.combinedVisit} onChange={setCombined} suffix="– nur eine Anfahrt" data-testid="ah-combined">Beides im selben Termin</TickRow></Card>
      ) : null}
      {any ? <AhSummary price={price} /> : null}
      <Note />
    </div>
  );
}
