// Fußboden (Badumbau; ADR 026, phase 4): the switch, the two modes, and the mode "Fußboden"
// with product line, scope, area (with the area calculator), covering, adhesive and sealing.
// The stored fields are exactly today's (test/fussboden.test.tsx compares with what today's UI
// stores and shows for the same inputs). The mode "Wandverkleidung als Fußboden" is still
// edited in today's UI.
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, Choices, Field, Input, Label, Switch, cn } from "../../../shared/ui/index.js";
import { LegacyLink, useOfferStore, usePrice } from "../../offer/index.js";
import { arbeitenChanges } from "../arbeiten/rules.js";
import {
  EMPTY_CALC_ROW, KINDS, PREMIUM, adhesiveHint, calcTotal, computedFor, coveringOf, de2, hasAdhesive, hasSealing, isOn, lineOf, modeOf, panelsFrom, pickCovering,
  removeCalcRow, rowArea, sealingHint, setArea, setLine, setMode, standardTiles, summary, toggleAdhesive, toggleSealing, unitsOf, type CalcRow, type Line, type Tile, type Units,
} from "./rules.js";

type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
const dwNow = (): Fields => offerNow().duschwanne ?? {};
const remember = (key: string, value: unknown) => useOfferStore.getState().remember(key, value);
const LINES: Record<Line, { name: string; brand: string; sub: string }> = {
  standard: { name: "Standard", brand: "Badolux", sub: "Badolux · günstig" },
  premium: { name: "Premium", brand: "Vigour / Hassmann", sub: "Vigour · Hassmann" },
};

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
function Calculator({ onApply }: { onApply: (area: string) => void }) {
  const rows = (useOfferStore((s) => s.scratch.floorCalcRows) as CalcRow[] | undefined) ?? [EMPTY_CALC_ROW];
  const set = (next: CalcRow[]) => remember("floorCalcRows", next);
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

function Tiles({ tiles, picked, onPick }: { tiles: readonly Tile[]; picked: string; onPick: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tiles.map((t) => (
        <label key={t.value} data-testid="fb-tile" data-value={t.value} className="grid w-28 cursor-pointer justify-items-center gap-1 rounded-lg border-2 border-input bg-card p-2 text-center has-[:checked]:border-primary has-[:checked]:bg-accent-weak has-[:checked]:font-bold">
          <input type="checkbox" name="fb-covering" className="sr-only" checked={picked === t.value} onChange={() => onPick(t.value)} />
          <img src={t.img} alt="" className="size-20 rounded object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          <span data-part="caption">{t.caption}</span>
        </label>
      ))}
    </div>
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
        {line === "standard" && !standard.length ? <p className="m-0 text-muted-foreground">Keine Standard-Fußbodenoptionen verfügbar.</p> : null}
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

export function Fussboden() {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const { dealId = "" } = useParams();
  const on = isOn(dw), mode = modeOf(dw);
  const change = (nextOn: boolean, nextMode: "floor" | "wall") => {
    const o = offerNow();
    const fields = setMode(o.duschwanne ?? {}, nextOn, nextMode);
    remember("floorPicked", false);
    useOfferStore.getState().patchAll(arbeitenChanges(o, { ...fields, computed: computedFor({ ...(o.duschwanne ?? {}), ...fields }, unitsOf(o.duschwanne ?? {})) }));
  };
  return (
    <Card aria-labelledby="fb-title">
      <CardTitle id="fb-title">Fußboden</CardTitle>
      <div className="flex items-center gap-3">
        <Switch id="fb-on" checked={on} onChange={(v) => change(v, "floor")} label="Fußboden" />
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
          {mode === "floor" ? <Floor /> : (
            <div className="grid gap-2 rounded-lg border-2 border-border p-3">
              <p className="m-0">Wandverkleidung als Fußboden (Dekor, Plattenformat, Reste aus der Wandverkleidung) wird noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
              <LegacyLink dealId={dealId} step="Fussboden">Fußboden in der bisherigen Ansicht</LegacyLink>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}
