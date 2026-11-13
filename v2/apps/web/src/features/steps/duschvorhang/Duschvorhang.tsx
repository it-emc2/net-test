// Duschvorhang (Badumbau; ADR 026, phase 4): the switch, the situation (niche, corner, U-shape)
// with its side lengths and the drawing, the proposed curtain, rods and fittings — every quantity
// can be changed — and "Ihre Auswahl". The stored fields are exactly today's
// (test/duschvorhang.test.tsx compares with what today's UI stores and shows for the same inputs).
// The rules are plan.ts (the plan), rules.ts (the offer) and drawing.ts.
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, Input, Switch, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { TONES, drawing } from "./drawing.js";
import { ART, SHAPES, buildLines, configLabel, curtainLabel, isCeilingSupport, legValues, type Catalog, type Item, type Leg, type Shape, type State } from "./plan.js";
import { fieldsOf, isOn, qtyOf, setCeiling, setLeg, setQty, setShape, stateOf, toggleItem, type Kind } from "./rules.js";

type Fields = Record<string, unknown>;
const section = (name: string): Fields => ((useOfferStore.getState().offer ?? {}) as Record<string, Fields>)[name] ?? {};
const useSection = (name: string) => useOfferStore((s) => (s.offer as Record<string, any> | null)?.[name] as Fields | undefined) ?? {};
const eur = (n: unknown) => `${(Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const ROW = "flex min-h-12 items-center gap-3 rounded-lg border-2 border-input bg-card px-4 py-2";
const LEG_NAMES: Record<Shape, Partial<Record<Leg, string>>> = { nische: { a: "Breite (Wand zu Wand)" }, ecke: { a: "Vorderseite", b: "Seitenteil" }, u: { a: "Linke Seite", b: "Vorderseite", c: "Rechte Seite" } };
const SUB: Record<string, string> = { DEPVSROS: "immer nötig", DEPVSBO: "1 je Ecke", DEPVSK: "verbindet zwei Stangen auf einer Seite" };
const titleOf = (item: Item, kind: Kind) => (kind === "curtain" && item.sizeCm != null ? curtainLabel(item)! : item.packNote ? `${item.name} (${item.packNote})` : item.name);

function Stock({ item }: { item: Item | undefined }) {
  if (!item || (item.stockQuantity == null && item.stockText == null)) return null;
  const n = Number(item.stockQuantity) || 0;
  return <span data-part="stock" title={item.stockText ?? undefined} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.85rem] font-semibold", n > 0 ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}><span>{n}</span>{n > 0 ? "Auf Lager" : "Auf Bestellung"}</span>;
}

/** One article: a switch, and its quantity while it is on. */
function Row({ item, kind, sub = "", state, set, children }: { item: Item; kind: Kind; sub?: string; state: State; set: (next: State) => void; children?: React.ReactNode }) {
  const qty = qtyOf(state, kind, item.articleNumber), on = qty > 0, title = titleOf(item, kind);
  return (
    <div data-testid="vh-item" data-art={item.articleNumber} data-kind={kind} className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={on} onChange={() => set(toggleItem(state, kind, item.articleNumber))} />
        {item.image ? <img src={item.image} alt="" loading="lazy" className={cn("size-11 shrink-0 rounded object-contain", !on && "opacity-50")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <span className="size-11 shrink-0" />}
        <span className="grid min-w-0"><span data-part="title">{title}</span><small data-part="small" className="text-muted-foreground">{[item.articleNumber, sub, eur(item.net)].filter(Boolean).join(" · ")}</small></span>
      </label>
      {children}
      {on ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="icon" aria-label={`Menge ${title}: weniger`} onClick={() => set(setQty(state, kind, item.articleNumber, qty - 1))}><Minus aria-hidden /></Button>
          <span className="w-16"><Input type="number" min={1} step={1} inputMode="numeric" aria-label={`Menge ${title}`} value={String(qty)} onChange={(e) => set(setQty(state, kind, item.articleNumber, Number(e.target.value)))} className="px-2 text-center" /></span>
          <Button variant="outline" size="icon" aria-label={`Menge ${title}: mehr`} onClick={() => set(setQty(state, kind, item.articleNumber, qty + 1))}><Plus aria-hidden /></Button>
        </span>
      ) : null}
    </div>
  );
}

/** A side length. The field keeps what is typed; the offer gets the rounded number at once. */
function LegField({ leg, index, name, placeholder, stored, onType, onFocus }: { leg: Leg; index: number; name: string; placeholder: string; stored: number | null | undefined; onType: (text: string) => void; onFocus: (leg: Leg | null) => void }) {
  const [text, setText] = useState(stored != null ? String(stored) : "");
  return (
    <label data-testid="vh-leg" data-leg={leg} className={cn(ROW, "justify-between")}>
      <span className="flex items-center gap-3"><span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: TONES[index] }}>{index + 1}</span><span data-part="name">{name}</span></span>
      <span className="flex items-center gap-2"><span className="w-24"><Input type="number" inputMode="decimal" min={1} max={2000} step={1} placeholder={placeholder} value={text} onFocus={() => onFocus(leg)} onBlur={() => onFocus(null)} onChange={(e) => { setText(e.target.value); onType(e.target.value); }} /></span>cm</span>
    </label>
  );
}

export function Duschvorhang() {
  const da = useSection("duschabtrennung"), dv = useSection("duschvorhang");
  const on = isOn(da, dv);
  const products = useQuery({ queryKey: ["vorhang-products"], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("vorhangProducts", { signal }) as unknown as Promise<Catalog> });
  const catalog = products.data;
  const remembered = useOfferStore((s) => s.scratch.vhState) as State | undefined;
  const state = remembered ?? stateOf(dv, catalog);
  const moreOpen = useOfferStore((s) => s.scratch.vhMore) === true;
  const [focus, setFocus] = useState<Leg | null>(null);
  const remember = (key: string, value: unknown) => useOfferStore.getState().remember(key, value);
  /** the configuration changed: remembered while the offer is open … */
  const set = (next: State) => remember("vhState", next);
  // … and the offer gets its lines once the catalogue is there. A configuration nobody touched writes nothing.
  useEffect(() => {
    if (!remembered || !catalog) return;
    const now = section("duschabtrennung"), stored = section("duschvorhang");
    const f = fieldsOf(now, remembered, catalog, isOn(now, stored));
    if (JSON.stringify([f.duschabtrennung.quickAdd, f.duschvorhang.configurator ?? null]) !== JSON.stringify([now.quickAdd ?? [], stored.configurator ?? null])) useOfferStore.getState().patchAll(f);
  });
  /** the switch: on marks the configuration as wanted; off keeps it and takes its lines out of the offer */
  const toggle = (to: boolean) => {
    useOfferStore.getState().patch("duschabtrennung" as never, { curtainEnabled: to } as never);
    set(to ? { ...state, enabled: true } : state);
  };

  const shape: Shape = state.shape ?? "nische"; // an offer from before the situation existed is shown as a niche
  const lines = buildLines(state, catalog), cfg = configLabel(state.shape, state.legs);
  const byArt = (art: string) => (catalog ? [...catalog.curtains, ...catalog.rods, ...catalog.mandatory, ...catalog.optional].find((x) => x.articleNumber === art) : undefined);
  const main: [Item, Kind, string][] = catalog ? [...catalog.curtains.map((c): [Item, Kind, string] => [c, "curtain", "uni weiß"]), ...catalog.rods.map((r): [Item, Kind, string] => [r, "rod", "verchromt"])] : [];
  const chosen = main.filter(([x, k]) => qtyOf(state, k, x.articleNumber) > 0), others = main.filter(([x, k]) => !(qtyOf(state, k, x.articleNumber) > 0));
  const ceilings = (catalog?.optional ?? []).filter((o) => isCeilingSupport(o.articleNumber)).sort((x, y) => x.articleNumber.localeCompare(y.articleNumber, "de", { numeric: true }));
  const ceiling = ceilings.find((o) => qtyOf(state, "opt", o.articleNumber) > 0) ?? ceilings.find((o) => o.articleNumber === "DEPDS50") ?? ceilings[0];
  const chip = "min-h-12 cursor-pointer rounded-lg border-2 px-4 font-semibold";
  return (
    <Card aria-labelledby="vh-title">
      <CardTitle id="vh-title">Duschvorhang</CardTitle>
      <div className="flex items-center gap-3">
        <Switch id="vh-on" checked={on} onChange={toggle} label="Duschvorhang" />
        <label htmlFor="vh-on" className="grid cursor-pointer"><strong>Duschvorhang</strong><small className="text-muted-foreground">Vorhang, Stangen und Befestigung im Angebot. Aus: nicht berechnet, die Auswahl bleibt erhalten.</small></label>
      </div>
      <p className="m-0 text-muted-foreground">Nische, Ecke oder U-Form wählen und die Seitenlängen eingeben — Duschvorhang, Stangen und Befestigung werden vorausgewählt und mit Netto-Preisen automatisch dem Angebot hinzugefügt.</p>
      {!on ? null : !catalog ? <p className="m-0 text-muted-foreground" role="status">{products.isError ? "Produkte konnten nicht geladen werden." : "Produkte werden geladen …"}</p> : (
        <>
          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
            <legend className="mb-1.5 p-0 font-semibold">Situation</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Vorhang-Situation">
              {(Object.keys(SHAPES) as Shape[]).map((k) => <button key={k} type="button" aria-pressed={k === shape} onClick={() => { if (state.shape !== k) set(setShape(state, k, catalog)); }} className={cn(chip, k === shape ? "border-primary bg-accent-weak" : "border-input bg-card")}>{SHAPES[k].label}</button>)}
            </div>
            {/* our own SVG markup (drawing.ts) */}
            <div className="rounded-lg bg-[#f7f6f4] p-2" data-testid="vh-drawing" dangerouslySetInnerHTML={{ __html: drawing(shape, state.legs, catalog, focus) }} />
            {SHAPES[shape].legs.map((k, i) => <LegField key={`${shape}-${k}`} leg={k} index={i} name={LEG_NAMES[shape][k]!} placeholder={k === "b" && shape === "u" ? "120" : "90"} stored={state.legs?.[k]} onType={(text) => set(setLeg(state, k, text, catalog))} onFocus={setFocus} />)}
            <p className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-[0.85rem] text-muted-foreground">
              <span className="flex items-center gap-2"><i className="inline-block h-1 w-5 rounded bg-[#3f3a36]" />Stange (vor Ort gekürzt)</span>
              <span className="flex items-center gap-2"><i className="inline-block size-3 rounded-full bg-[#3f3a36]" />Bogen + Deckenstütze</span>
              <span className="flex items-center gap-2"><i className="inline-block size-3 rounded-full border-[2.5px] border-[#3f3a36]" />Kupplung</span>
              <span className="flex items-center gap-2"><i className="inline-block size-2.5 rounded-sm border-2 border-[#44403c]" />Rosette</span>
            </p>
          </fieldset>

          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="vh-products">
            <legend className="mb-1.5 p-0 font-semibold">Vorhang und Stangen</legend>
            {chosen.length ? chosen.map(([x, k, sub]) => <Row key={x.articleNumber} item={x} kind={k} sub={sub} state={state} set={set} />) : <p className="m-0 text-muted-foreground" data-part="hint">Seitenlängen eintragen – Vorhang und Stangen werden vorgeschlagen.</p>}
            <div><Button variant="outline" aria-expanded={moreOpen} onClick={() => remember("vhMore", !moreOpen)}>{moreOpen ? "Weitere Größen ausblenden" : "Andere Größe oder Länge wählen"}</Button></div>
            {moreOpen ? others.map(([x, k, sub]) => <Row key={x.articleNumber} item={x} kind={k} sub={sub} state={state} set={set} />) : null}
          </fieldset>

          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="vh-fittings">
            <legend className="mb-1.5 p-0 font-semibold">Befestigung und Zubehör</legend>
            {catalog.mandatory.map((m) => <Row key={m.articleNumber} item={m} kind="rosette" sub={SUB[m.articleNumber] ?? ""} state={state} set={set} />)}
            {catalog.optional.filter((o) => !isCeilingSupport(o.articleNumber) && o.articleNumber !== ART.rings).map((o) => <Row key={o.articleNumber} item={o} kind="opt" sub={SUB[o.articleNumber] ?? ""} state={state} set={set} />)}
            {ceiling ? (
              <Row item={{ ...ceiling, name: "Deckenstütze" }} kind="opt" sub="1 je Ecke" state={state} set={set}>
                <span className="flex shrink-0 items-center gap-1" role="group" aria-label="Länge Deckenstütze">
                  {ceilings.map((o) => <button key={o.articleNumber} type="button" data-ceiling={o.articleNumber} aria-pressed={o === ceiling} onClick={() => set(setCeiling(state, o.articleNumber))} className={cn("min-h-12 min-w-12 cursor-pointer rounded-lg border-2 px-2 font-semibold", o === ceiling ? "border-primary bg-accent-weak" : "border-input bg-card")}>{o.articleNumber.replace(/\D/g, "")}</button>)}
                  <span className="text-[0.9rem] text-muted-foreground">cm</span>
                </span>
              </Row>
            ) : null}
            {catalog.optional.filter((o) => o.articleNumber === ART.rings).map((o) => <Row key={o.articleNumber} item={o} kind="opt" state={state} set={set} />)}
          </fieldset>

          {lines.length ? (
            <section className="grid gap-2 rounded-lg border-2 border-border p-3" data-testid="vh-summary" aria-label="Ihre Auswahl">
              <strong>Ihre Auswahl</strong>
              {cfg ? <div className="grid"><strong data-part="head">{cfg}</strong><small data-part="sub" className="text-muted-foreground">Vorhanglänge {legValues(shape, state.legs).reduce((a, b) => a + b, 0)} cm</small></div> : null}
              {lines.map((l) => (
                <div key={l.articleNumber} data-testid="vh-line" className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                  <span className="grid min-w-0 flex-1"><span data-part="name">{`${l.qty > 1 ? `${l.qty} × ` : ""}${l.label.replace(/ \((Nische|Ecke|U-Form) [^)]*\)$/, "")}`}</span><small data-part="art" className="text-muted-foreground">{l.articleNumber}</small></span>
                  <Stock item={byArt(l.articleNumber)} />
                  <span data-part="price" className="font-semibold tabular-nums">{eur(l.net * l.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t border-border pt-2 font-bold" data-part="total"><span>Gesamt (netto)</span><span>{eur(Math.round(lines.reduce((a, l) => a + l.net * l.qty, 0) * 100) / 100)}</span></div>
            </section>
          ) : null}
        </>
      )}
    </Card>
  );
}
