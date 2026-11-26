// Fußboden (Badumbau; ADR 026, phase 4): the switch, the two modes, and the mode "Fußboden"
// with product line, scope, area (with the area calculator), covering, adhesive and sealing.
// The stored fields are exactly today's (test/fussboden.test.tsx compares with what today's UI
// stores and shows for the same inputs). The mode "Wandverkleidung als Fußboden" (wand.ts) uses
// wall panels as the covering, with the rest of the wall cladding where there is one.
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, Choices, Field, Input, Label, Switch, cn, IMG } from "../../../shared/ui/index.js";
import { Internal } from "../../../shared/ui/internal.js";
import { useOfferStore, usePrice } from "../../offer/index.js";
import { arbeitenChanges } from "../arbeiten/rules.js";
import { LINE_TEXT } from "../duschwanne/rules.js";
import {
  EMPTY_CALC_ROW, KINDS, PREMIUM, adhesiveHint, calcTotal, computedFor, coveringOf, de2, hasAdhesive, hasSealing, isOn, lineOf, modeOf, panelsFrom, pickCovering,
  removeCalcRow, rowArea, sealingHint, setArea, setLine, setMode, standardTiles, summary, toggleAdhesive, toggleSealing, unitsOf, type CalcRow, type Line, type Tile, type Units,
} from "./rules.js";
import * as w from "./wand.js";
import { useWallSettings } from "./settings.js";
import { DecorChips, DecorPalette, PLATE_PX, PlateCards, PlateOnBaseline, StepLegend, plateCard } from "../../../shared/ui/winwall.js";
import { SwatchFace, SwatchGrid, swatchTile } from "../../../shared/ui/swatch.js";
import { scalePlates } from "../../../shared/ui/plate-scale.js";

type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
const dwNow = (): Fields => offerNow().duschwanne ?? {};
const remember = (key: string, value: unknown) => useOfferStore.getState().remember(key, value);
const LINES = LINE_TEXT; // the same two lines, the same names as on the Duschwanne step

const price = (id: string) => ({ queryKey: ["product", id], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }: { signal: AbortSignal }) => call("product", { params: { productId: id }, signal }).then((p) => Number(p.price) || 0) });
/** the unit prices the quantities are valued with: from the price list, until then as stored */
function useUnits(dw: Fields): Units {
  const a = useQuery(price("R_4260602")), s = useQuery(price("TRBDSET7")), r = useQuery(price("TRDB10"));
  const stored = unitsOf(dw);
  return { adhesive: a.data || stored.adhesive, sealingSet: s.data || stored.sealingSet, sealingRoll: r.data || stored.sealingRoll };
}
function useStandardTiles(enabled: boolean): Tile[] {
  const q = useQuery({ queryKey: ["products", "BP"], enabled, staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("products", { query: "prefix=BP&source=badolux&limit=200", signal }) });
  return q.data ? standardTiles(q.data) : [];
}

/** Rooms and recesses in metres → the area. */
function Calculator({ onApply, store = "floorCalcRows" }: { onApply: (area: string) => void; store?: string }) {
  const rows = (useOfferStore((s) => s.scratch[store]) as CalcRow[] | undefined) ?? [EMPTY_CALC_ROW];
  const set = (next: CalcRow[]) => remember(store, next);
  const edit = (i: number, change: Partial<CalcRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const total = calcTotal(rows);
  return (
    <div className="grid gap-3 rounded-lg border-2 border-border p-3" data-testid="fb-calc">
      <p className="m-0 text-[0.95rem] text-muted-foreground">Flächen addieren oder Aussparungen abziehen — Angaben in Metern.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-end gap-2" data-testid="fb-calc-row">
          <Button variant="outline" className="px-3" aria-label={r.subtract ? "Fläche abziehen" : "Fläche addieren"} onClick={() => edit(i, { subtract: !r.subtract })}>{r.subtract ? "− Abziehen" : "+ Addieren"}</Button>
          <div className="grid gap-1.5"><Label htmlFor={`fb-calc-l-${i}`}>Länge (m)</Label><Input id={`fb-calc-l-${i}`} aria-label={`Länge ${i + 1} in m`} type="number" min={0} step={0.01} inputMode="decimal" placeholder="z. B. 3,20" value={r.length} onChange={(e) => edit(i, { length: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor={`fb-calc-w-${i}`}>Breite (m)</Label><Input id={`fb-calc-w-${i}`} aria-label={`Breite ${i + 1} in m`} type="number" min={0} step={0.01} inputMode="decimal" placeholder="z. B. 1,80" value={r.width} onChange={(e) => edit(i, { width: e.target.value })} /></div>
          <span className="pb-3 font-semibold" data-part="area">{de2(rowArea(r))} m²</span>
          <Button variant="ghost" size="icon" aria-label={`Zeile ${i + 1} entfernen`} onClick={() => set(removeCalcRow(rows, i))}><X aria-hidden /></Button>
        </div>
      ))}
      <div><Button variant="outline" onClick={() => set([...rows, EMPTY_CALC_ROW])}><Plus aria-hidden />Zeile hinzufügen</Button></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0">Gesamtfläche <strong data-testid="fb-calc-total">{de2(total)} m²</strong></p>
        <Button onClick={() => onApply(de2(total))}>In Fläche übernehmen</Button>
      </div>
    </div>
  );
}

/** the floor coverings: the same tiles as every decor in both steps (shared/ui/swatch.tsx) */
function Tiles({ tiles, picked, onPick }: { tiles: readonly Tile[]; picked: string; onPick: (value: string) => void }) {
  return (
    <SwatchGrid>
      {tiles.map((t) => (
        <label key={t.value} data-testid="fb-tile" data-value={t.value} className={swatchTile(picked === t.value)}>
          <input type="checkbox" name="fb-covering" className="sr-only" checked={picked === t.value} onChange={() => onPick(t.value)} />
          <SwatchFace on={picked === t.value} img={t.img} />
          <span data-part="caption">{t.caption}</span>
        </label>
      ))}
    </SwatchGrid>
  );
}

/** The mode "Fußboden": a floor covering with its accessories. */
function Floor() {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const line = lineOf(dw);
  const units = useUnits(dw);
  const standard = useStandardTiles(line === "standard");
  const priceNow = usePrice();
  const [calcOpen, setCalcOpen] = useState(false);
  const [ask, setAsk] = useState<Line | null>(null); // the line change waiting for a yes
  const userPicked = !!useOfferStore((s) => s.scratch.floorPicked);
  /** every change brings `computed` and the work-time suggestion up to date with it */
  const write = (fields: Fields) => { const o = offerNow(); useOfferStore.getState().patchAll(arbeitenChanges(o, { ...fields, computed: computedFor({ ...(o.duschwanne ?? {}), ...fields }, units) })); };
  const tiles = line === "standard" ? standard : PREMIUM;
  const picked = coveringOf(dw);
  const panels = panelsFrom(priceNow.data, dw);
  const sum = summary(dw, tiles, panels);
  const changeLine = (to: Line) => { setAsk(null); remember("floorPicked", false); write(setLine(to)); };
  const askLine = (to: Line) => { if (to === line) return; if (userPicked && picked) setAsk(to); else changeLine(to); }; // only a covering the user picked is worth asking about
  const pickedName = tiles.find((t) => t.value === picked)?.caption ?? picked.split("|").pop();
  return (
    <>
      <div className="grid gap-3 rounded-lg border-2 border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid"><strong>Produktlinie</strong><small className="text-muted-foreground" data-testid="fb-tier-line">Nur Produkte von {LINES[line].brand}</small></div>
          <div className="flex gap-2" role="group" aria-label="Produktlinie wählen">
            {(["standard", "premium"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={line === t} onClick={() => askLine(t)} className={cn("grid min-h-12 cursor-pointer rounded-lg border-2 px-4 py-1 text-left", line === t ? "border-primary bg-accent-weak" : "border-input bg-card")}>
                <strong>{LINES[t].name}</strong><span className="text-[0.85rem] text-muted-foreground">{LINES[t].sub}</span>
              </button>
            ))}
          </div>
        </div>
        {ask ? (
          <div role="alertdialog" aria-labelledby="fb-ask-title" className="grid gap-2 rounded-lg border-2 border-destructive p-3">
            <strong id="fb-ask-title">Fußboden auf „{LINES[ask].name}" umstellen?</strong>
            <p className="m-0">Die bisherige Auswahl „{pickedName}" gehört zur Linie {LINES[line].name} und wird entfernt. Sie müssen anschließend neu wählen.</p>
            <div className="flex flex-wrap gap-2"><Button onClick={() => changeLine(ask)}>Auf {LINES[ask].name} umstellen</Button><Button variant="outline" onClick={() => setAsk(null)}>Abbrechen</Button></div>
          </div>
        ) : null}
        <Choices legend="Umfang" name="fb-kind" options={KINDS} value={String(dw.floorKind ?? "") || undefined} onChange={(v) => write({ floorKind: v })} />
      </div>
      <div className="grid gap-2">
        <Field label="Fläche in m²" id="fb-area" inputMode="decimal" placeholder="z. B. 12,5" autoComplete="off" className="max-w-xs" value={String(dw.floorArea ?? "")} onChange={(e) => write(setArea(dwNow(), e.target.value, standard))} />
        <div><Button variant="outline" aria-expanded={calcOpen} onClick={() => setCalcOpen((o) => !o)}>{calcOpen ? "Flächenrechner schließen" : "Flächenrechner öffnen"}</Button></div>
        {calcOpen ? <Calculator onApply={(area) => write(setArea(dwNow(), area, standard))} /> : null}
      </div>
      <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 font-semibold">{line === "standard" ? "Belag — Hydroträgerplatte (Badolux)" : "Belag — Fußboden individ. 5.0 V5FB02"}</legend>
        <Tiles tiles={tiles} picked={picked} onPick={(v) => { remember("floorPicked", true); write(pickCovering(dwNow(), v, standard)); }} />
        {line === "standard" && !standard.length ? <p className="m-0 text-muted-foreground">Keine Badolux-Fußbodenoptionen verfügbar.</p> : null}
      </fieldset>
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 font-semibold">Zubehör (automatisch berechnet)</legend>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border-2 border-input bg-card px-4 py-2">
          <span className="grid"><span>Fußboden-Paneele</span><small className="text-muted-foreground"><span data-testid="fb-panels">{panels}</span> Stück</small></span>
          <span className="text-[0.9rem] text-muted-foreground">automatisch</span>
        </div>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-input bg-card px-4 py-2 has-[:checked]:border-primary">
          <input id="fb-adhesive" type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={hasAdhesive(dw)} onChange={(e) => write(toggleAdhesive(e.target.checked))} />
          <span className="grid"><span>Flächenkleber 600 ml</span><small className="text-muted-foreground" data-testid="fb-adhesive-hint">{adhesiveHint(dw)}</small></span>
        </label>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-input bg-card px-4 py-2 has-[:checked]:border-primary">
          <input id="fb-sealing" type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={hasSealing(dw)} onChange={(e) => write(toggleSealing(e.target.checked))} />
          <span className="grid"><span>Bodenabdichtung</span><small className="text-muted-foreground" data-testid="fb-sealing-hint">{sealingHint(dw)}</small></span>
        </label>
      </fieldset>
      {sum ? (
        <div className="grid gap-1 rounded-lg border-2 border-border p-3" data-testid="fb-summary">
          <p className="m-0 text-sm font-bold uppercase tracking-wide text-muted-foreground">Ihre Auswahl</p>
          <p className="m-0"><strong>{sum.title}</strong></p>
          <p className="m-0 text-muted-foreground">{sum.sub}</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">{sum.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ) : null}
    </>
  );
}

/** what today's UI remembers about the floor for the Wandverkleidung simple view (wand.ts `WallSession`) */
const session = (): w.WallSession => ({ ...w.SESSION, ...(useOfferStore.getState().scratch.wcSession as Partial<w.WallSession> | undefined) });
/** the user's own tap on the switch: no floor is added from the wall's rest again (today's wcOptOut) */
const forget = () => remember("wcSession", { ...session(), optedOut: true, autoArea: null });
/** a typed area no longer follows the rest */
const typedArea = () => { if (session().autoArea != null) remember("wcSession", { ...session(), autoArea: null }); };
type Ask = { title: string; message: string; confirm: string; cancel: string; onCancel: () => void };

/** winwall: the Dekor chips, the open Dekor's four plates with − / +, the total over every Dekor and "↻ Vorschlag aus Fläche" (wand.ts `platesOf`). */
function Plates({ p, chips, bad, onStep, onResync }: { p: w.Plates; chips: ReactNode; bad: string | null; onStep: (fmt: string, d: number) => void; onResync: () => void }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" data-testid="wc-plates">
      <StepLegend n={1}>Platten – Vorschlag aus der Fläche, mit − / + anpassen</StepLegend>
      {chips}
      <PlateCards plates={p.plates.map((x) => ({ ...x, note: x.best }))} onStep={onStep} testId="wc-plate" notePart="best" />
      <p className={cn("m-0 flex flex-wrap justify-between gap-2 font-semibold", p.total.short && "text-destructive")} data-testid="wc-total" data-short={p.total.short}>
        <span data-part="text">{p.total.text}</span><small data-part="small" className="font-normal">{p.total.small}</small>
      </p>
      {bad ? <p role="alert" data-testid="wc-bad" className="m-0 rounded-lg border-2 border-destructive bg-destructive/10 p-3 font-semibold text-destructive">{bad}</p> : null}
      {p.resync ? (
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="wc-resync">
          <small data-part="hint" className="text-muted-foreground">Platten wurden angepasst.</small>
          <Button variant="outline" onClick={onResync}>↻ Vorschlag aus Fläche</Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/** The mode "Wandverkleidung als Fußboden": wall panels as the floor covering (wand.ts). */
function Wall() {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const wv = useOfferStore((s) => (s.offer as Record<string, any> | null)?.wandverkleidung as Fields | undefined) ?? {};
  const settings = useWallSettings();
  const [calcOpen, setCalcOpen] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null); // an in-page question waiting for an answer
  const supplier = w.supplierOf(dw), ww = supplier === "ww";
  const rest = w.restOf(wv, settings.rest), credit = w.creditOf(dw, rest);
  const sug = ww ? null : w.suggestion(dw, credit);
  const art = w.articlesOf(dw);
  const prices = useQuery({ queryKey: ["vigor-prices", art[997], art[1497]], enabled: !ww, staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("vigorPrices", { query: `ids=${art[997]},${art[1497]}`, signal }).then((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v) || 0]))) });
  const article = art[dw.wallCladdingPanelSize === "1497" ? 1497 : 997];
  const full = useQuery({ queryKey: ["vigor-full", article], enabled: !ww, staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("vigorPrices", { query: `ids=${article}&full=1`, signal }).then((d) => (d[article] ?? null) as w.Full | null) });
  const adhesive = useQuery(price("R_4260602"));
  // an offer with only the old fields (one format + quantity): today's UI keeps its plates as the JSON once it is opened
  const legacy = ww && !dw.wallCladdingWwQty && (w.WW_FORMATS as readonly string[]).includes(String(dw.wallCladdingPanelSize ?? "")) && Number(dw.wallCladdingQty) > 0;
  useEffect(() => { if (legacy) useOfferStore.getState().patch("duschwanne", { wallCladdingWwQty: JSON.stringify({ [String(dwNow().wallCladdingPanelSize)]: Number(dwNow().wallCladdingQty) }) }); }, [legacy]);
  const lastBest = () => (useOfferStore.getState().scratch.wcWwLast as w.Qty | null | undefined) ?? null;
  // the Dekors (ADR 029): the first in its three fields, further ones in wallCladdingWwMore, ones without plates only here
  const pending = (useOfferStore((s) => s.scratch.wcPending) as w.Dekor[] | undefined) ?? [];
  const dekore = ww ? w.dekoreOf(dw, pending) : [];
  const active = Math.min(Math.max(Number(useOfferStore((s) => s.scratch.wcActive) ?? 0) || 0, 0), Math.max(dekore.length - 1, 0));
  const open = dekore[active];
  const pendingNow = () => (useOfferStore.getState().scratch.wcPending as w.Dekor[] | undefined) ?? [];
  /** every change also settles what follows from it (the rest's m², the plates or format and quantity) and the work-time suggestion.
   *  `follow`: the winwall plates follow the proposal (area, rest, decor or line changed); `last` overrides the proposal they were last set to */
  const write = (fields: Fields, follow = false, last: w.Qty | null = lastBest(), restSwitch?: boolean) => {
    const o = offerNow(), now = (o.duschwanne ?? {}) as Fields, r = w.restOf(o.wandverkleidung ?? {}, settings.rest);
    const out = restSwitch !== undefined ? w.useRest(now, restSwitch, r, last) : w.settled(now, fields, r, follow ? last : undefined);
    useOfferStore.getState().patchAll(arbeitenChanges(o, out));
    const next = { ...now, ...out };
    if (follow && w.supplierOf(next) === "ww") remember("wcWwLast", w.proposalOf(next, w.creditOf(next, r)));
    return next;
  };
  /** a decor picked or typed: the plates follow; leaving the rest's decor asks first ("Abbrechen" goes back) */
  const changeDecor = (fields: Fields) => {
    const prev = w.decorOf(dwNow()), r = w.restOf(offerNow().wandverkleidung ?? {}, settings.rest);
    const next = write(fields, true);
    const q = prev.code ? w.leavingRest(next, prev.code, r) : null;
    if (q) setAsk({ ...q, onCancel: () => write(w.setFloorDecor(prev.code!), true) });
  };
  /** a change of the Dekors: the open one, the ones without plates, and what is stored (nothing for a Dekor without plates) */
  const dekor = (r: w.Dekore) => { remember("wcPending", r.pending); remember("wcActive", r.active); if (Object.keys(r.fields).length) write(r.fields); };
  /** a change of the open Dekor in the first Dekor's field names; the first Dekor itself as today */
  const editOpen = (change: Fields) => dekor(w.editDekor(dwNow(), pendingNow(), active, active, change));
  const pickOpen = (code: string) => {
    const other = dekore.findIndex((d, i) => i !== active && w.codeOf(d) === code);
    if (other >= 0) return remember("wcActive", other); // another Dekor has it: that one opens (as on the wall)
    if (active === 0) changeDecor(w.pickDecor(code)); else editOpen(w.pickDecor(code));
  };
  const openFields = active > 0 && open ? w.asFields(open) : dw;
  const cards = w.cardsOf(dw, sug, prices.data), cardBoxes = scalePlates(cards.map((c) => ({ width: c.widthMm, height: c.heightMm })), PLATE_PX), picked = String(dw.wallCladdingPanelSize ?? "");
  const qtyNow = Math.round(Number(dw.wallCladdingQty) || 0);
  const rows = w.selection(dw, rest, full.data, adhesive.data || 0, settings.own);
  const note = w.restNote(w.restArea(dw, credit), credit), hint = w.customHint(openFields);
  const chip = "min-h-12 cursor-pointer rounded-lg border-2 px-3 py-1 text-left";
  return (
    <>
      <div className="grid gap-3 rounded-lg border-2 border-border p-3">
        <div className="grid"><strong>Produktlinie</strong><small className="text-muted-foreground">Eigene Linie für Wandverkleidung als Fußboden</small></div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Produktlinie wählen">
          {w.SUPPLIERS.map((x) => <button key={x.value} type="button" aria-pressed={supplier === x.value} onClick={() => { if (x.value !== supplier) { remember("wcPending", []); remember("wcActive", 0); } write(w.setSupplier(dwNow(), x.value), true); }} className={cn(chip, "grid", supplier === x.value ? "border-primary bg-accent-weak" : "border-input bg-card")}><strong>{x.name}</strong><span className="text-[0.85rem] text-muted-foreground">{x.sub}</span></button>)}
        </div>
      </div>
      <Choices legend="Umfang" name="wc-kind" options={KINDS} value={String(dw.wallCladdingKind ?? "") || undefined} onChange={(v) => write({ wallCladdingKind: v })} />
      {rest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border p-3" data-testid="wc-rest">
          <label htmlFor="wc-rest" className="grid min-w-0 flex-1 cursor-pointer"><strong>Reste aus Wandverkleidung anrechnen</strong><small data-part="hint" className="text-muted-foreground">{w.restHint(dw, rest)}</small></label>
          <Switch id="wc-rest" checked={!!dw.wallCladdingUseLeftover} onChange={(on) => write({}, true, lastBest(), on)} label="Reste aus Wandverkleidung anrechnen" />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Field id="wc-area" label="Fläche (m²)" inputMode="decimal" placeholder="z. B. 8,5" value={String(dw.wallCladdingArea ?? "")} onChange={(e) => { typedArea(); write({ wallCladdingArea: e.target.value }, true); }} />
        <div><Button variant="outline" aria-expanded={calcOpen} onClick={() => setCalcOpen(!calcOpen)}>{calcOpen ? "Flächenrechner schließen" : "Flächenrechner öffnen"}</Button></div>
        {calcOpen ? <Calculator store="wcCalcRows" onApply={(area) => write({ wallCladdingArea: area }, true)} /> : null}
      </div>
      {ww ? (
        <Plates p={w.platesOf(dw, credit, dekore, active)} bad={w.badDekore(dw)}
          chips={<DecorChips chips={w.chipsOf(dekore, active)} label="Dekore" noun="Dekor" addText="+ weiteres Dekor" testId="wc-decor-chip"
            onPick={(i) => remember("wcActive", i)} onRemove={(i) => dekor(w.removeDekor(dwNow(), pendingNow(), active, i))} onAdd={() => dekor(w.addDekor(dwNow(), pendingNow()))} />}
          onStep={(fmt, d) => (active === 0 ? write(w.stepPlate(dwNow(), fmt, d)) : editOpen(w.stepPlate(w.asFields(open!), fmt, d)))}
          onResync={() => {
            if (active > 0) return editOpen(w.qtyFields(w.proposalFor(dwNow(), credit, w.dekoreOf(dwNow(), pendingNow()), active)));
            remember("wcWwLast", null); write(w.qtyFields(w.zero()), true, null);
          }} />
      ) : null}
      {ask ? (
        <div role="alertdialog" aria-labelledby="wc-ask-title" className="grid gap-2 rounded-lg border-2 border-destructive p-3" data-testid="wc-ask">
          <strong id="wc-ask-title">{ask.title}</strong>
          <p className="m-0">{ask.message}</p>
          <div className="flex flex-wrap gap-2"><Button onClick={() => setAsk(null)}>{ask.confirm}</Button><Button variant="outline" onClick={() => { setAsk(null); ask.onCancel(); }}>{ask.cancel}</Button></div>
        </div>
      ) : null}
      {ww ? (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="wc-decors">
          <StepLegend n={2}>Dekor – gilt für die Platten oben</StepLegend>
          <DecorPalette tiles={w.paletteOf(openFields)} label="Dekor Fußboden" onPick={pickOpen} />
          <div className="grid gap-1.5" data-testid="wc-custom">
            <label htmlFor="wc-decor-number" className="font-semibold">Anderes Dekor</label>
            <div className="w-48"><Input id="wc-decor-number" placeholder="NW 230 / 23015" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={10} value={String(openFields.wallCladdingWwDecorCustom ?? "")} onChange={(e) => (active === 0 ? changeDecor(w.typeDecor(e.target.value)) : editOpen(w.typeDecor(e.target.value)))} /></div>
            <small data-part="hint" data-kind={hint.kind} className={cn(hint.kind === "ok" && "text-success", hint.kind === "warn" && "text-destructive", !hint.kind && "text-muted-foreground")}>{hint.text}</small>
          </div>
        </fieldset>
      ) : null}
      {cards.length ? (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="wc-cards">
          <legend className="mb-1.5 p-0 font-semibold">Plattenformat</legend>
          {/* VIGOUR holds ONE format and its number (wallCladdingPanelSize + wallCladdingQty): the formats as
              panels to scale on one baseline; tapping one picks it with the number for the area, the chosen
              one carries − / + ("Menge", can be typed) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cards.map((c, i) => (
              <div key={c.size} className={plateCard(c.selected, "content-between")}>
                <button type="button" data-testid="wc-card" data-size={c.size} data-qty={c.qty} aria-pressed={c.selected} onClick={() => write(w.pickCard(c))}
                  className="grid w-full min-w-0 cursor-pointer justify-items-center gap-1 rounded-lg border-0 bg-transparent p-0 text-center text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <PlateOnBaseline w={cardBoxes.boxes[i]!.w} h={cardBoxes.boxes[i]!.h} height={cardBoxes.height} img={w.COLORS.find((x) => x.value === w.colorOf(dw))?.img} />
                  <strong data-part="title" className="whitespace-nowrap text-[0.9rem]">{c.title}</strong>
                  {c.best ? <span data-part="best" className="rounded-full bg-primary px-2 py-0.5 text-[0.8rem] font-semibold text-primary-foreground">Empfehlung</span> : null}
                  <span data-part="count" className="font-semibold">{c.count}</span>
                  <small data-part="coverage" className="text-muted-foreground">{c.coverage}</small>
                  <Internal>{c.price || c.unit ? <span className="text-[0.9rem]"><span data-part="price" className="font-semibold">{c.price}</span> <span data-part="unit" className="text-muted-foreground">{c.unit}</span></span> : null}</Internal>
                  <span data-part="label" className="text-[0.9rem] font-semibold text-primary-text">{c.label}</span>
                </button>
                {c.selected && picked ? (
                  <div className="grid justify-items-center gap-1">
                    <span className="flex items-center">
                      <Button variant="outline" size={null} className="size-10 sm:size-12" aria-label="Weniger Paneele" onClick={() => write(w.setQty(String(Math.max(1, qtyNow - 1))))}><Minus aria-hidden /></Button>
                      <span className="w-10 sm:w-11"><Input id="wc-qty" aria-label="Anzahl Paneele (Stück)" type="number" min={1} step={1} inputMode="numeric" className="min-h-10 px-0.5! text-center sm:min-h-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={dw.wallCladdingQty == null ? "" : String(dw.wallCladdingQty)} onChange={(e) => write(w.setQty(e.target.value))} /></span>
                      <Button variant="outline" size={null} className="size-10 sm:size-12" aria-label="Mehr Paneele" onClick={() => write(w.setQty(String(qtyNow + 1)))}><Plus aria-hidden /></Button>
                    </span>
                    <small className="text-muted-foreground">Menge</small>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {note ? <p className="m-0 rounded-lg border-2 border-border p-3" data-testid="wc-rest-note">{note}</p> : null}
      {!ww ? (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="wc-colors">
          <legend className="mb-1.5 p-0 font-semibold">Farbe — Wandverkleidung 3.0</legend>
          <SwatchGrid>
            {w.COLORS.map((c) => (
              <label key={c.value} data-value={c.value} className={swatchTile(w.colorOf(dw) === c.value)}>
                <input type="radio" name="wc-color" className="sr-only" checked={w.colorOf(dw) === c.value} onChange={() => write({ wallCladdingColor: c.value })} />
                <SwatchFace on={w.colorOf(dw) === c.value} img={c.img} />
                <span data-part="caption">{c.caption}</span>
                <Internal>{(settings.own[w.articlesFor(c.value)[997]] || 0) > 0 || (settings.own[w.articlesFor(c.value)[1497]] || 0) > 0 ? <span data-part="own" className="text-[0.8rem] font-normal text-muted-foreground">Lager: {[[997, settings.own[w.articlesFor(c.value)[997]]], [1497, settings.own[w.articlesFor(c.value)[1497]]]].filter(([, n]) => (n || 0) > 0).map(([z, n]) => `${z}: ${n}`).join(" / ")}</span> : null}</Internal>
              </label>
            ))}
          </SwatchGrid>
        </fieldset>
      ) : null}
      {rows.length ? (
        <section className="grid gap-2 rounded-lg border-2 border-border p-3" data-testid="wc-selection" aria-label="Ihre Auswahl">
          <strong>Ihre Auswahl</strong>
          {rows.map((r, i) => (
            <div key={`${r.name}-${i}`} data-testid="wc-selected" className="flex items-center gap-3 border-t border-border pt-2">
              {r.img ? <img src={r.img} alt="" className={cn(IMG.row, "shrink-0 rounded object-cover")} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : null}
              <span className="grid min-w-0 flex-1">
                <strong data-part="name">{r.name}{r.note ? <Internal> <span data-part="note" className="font-normal text-muted-foreground">{r.note}</span></Internal> : null}</strong><small data-part="meta" className="text-muted-foreground">{r.meta}</small><span data-part="price"><Internal when={r.plain !== undefined} instead={r.plain}>{r.price}</Internal></span>
                {r.stock ? <span data-part="badges" className="flex flex-wrap gap-2 text-[0.85rem] font-semibold"><span title={r.stock.text} className={cn("rounded-full px-2 py-0.5", r.stock.inStock ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}>{r.stock.qty} {r.stock.inStock ? "Auf Lager" : "Auf Bestellung"}</span><Internal>{r.own ? <span className="rounded-full bg-muted px-2 py-0.5">{r.own} Im eigenen Lager</span> : null}</Internal></span> : null}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}


export function Fussboden() {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const on = isOn(dw), mode = modeOf(dw);
  const change = (nextOn: boolean, nextMode: "floor" | "wall") => {
    const o = offerNow();
    const fields = setMode(o.duschwanne ?? {}, nextOn, nextMode);
    remember("floorPicked", false);
    remember("floorMode", nextMode); // switched off and on again, the step comes back in the mode it was in
    useOfferStore.getState().patchAll(arbeitenChanges(o, { ...fields, computed: computedFor({ ...(o.duschwanne ?? {}), ...fields }, unitsOf(o.duschwanne ?? {})) }));
  };
  return (
    <Card aria-labelledby="fb-title">
      <CardTitle id="fb-title">Fußboden</CardTitle>
      <div className="flex items-center gap-3">
        <Switch id="fb-on" checked={on} onChange={(v) => { if (!v) forget(); change(v, v ? ((useOfferStore.getState().scratch.floorMode as "floor" | "wall" | undefined) ?? "floor") : mode); }} label="Fußboden" />
        <label htmlFor="fb-on" className="grid cursor-pointer"><strong>Fußboden</strong><small className="text-muted-foreground">Bodenbelag oder Wandverkleidung als Fußboden im Angebot. Aus: nichts berechnet.</small></label>
      </div>
      {on ? (
        <>
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Fußboden oder Wandverkleidung">
            {([["floor", "Fußboden"], ["wall", "Wandverkleidung als Fußboden"]] as const).map(([m, label]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { if (mode !== m) change(true, m); }}
                className={cn("min-h-12 cursor-pointer rounded-lg border-2 px-3 font-semibold", mode === m ? "border-primary bg-accent-weak" : "border-input bg-card")}>{label}</button>
            ))}
          </div>
          {mode === "floor" ? <Floor /> : <Wall />}
        </>
      ) : null}
    </Card>
  );
}
