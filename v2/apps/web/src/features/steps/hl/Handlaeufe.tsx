// Handlauf, step "Handläufe" (hlk; slices 2 and 3): today's Flexofit configurator (configurations
// with area, tube & colour, fittings & finish, Sonderprodukte, the position list), the note and the
// sketch, and — owner decision U-011 C1 (UX-CHANGES U-054) — the entries of the retired Handlauf
// page, read-only, only for an offer that holds them. Rules: rules.ts, catalog: catalog.ts.
// The working configurations live in the page memory (`scratch.hlWork`) as today's page keeps them
// in memory; what is stored is rebuilt from them on every change (rules.ts `configFields`).
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, CHIP, CHIP_OFF, CHIP_ON, IMG, TextAreaField, cn } from "../../../shared/ui/index.js";
import { SketchPad, type Sketch } from "../../../shared/ui/sketch-pad.js";
import { useOfferStore } from "../../offer/index.js";
import { EMPTY_CATALOG, catalogOf, imageFor, keyOf, money, OUTSIDE_FINISH, productVariant, type Catalog, type Product } from "./catalog.js";
import {
  addSonder, availableFinishes, configFields, fittingChoices, hasLegacyData, isComplete, ledgerTotal, legacyFields, legacyRows, mkConfig, normTab, pickArea, pickFinish, pickFitting, pickTube,
  removeLine, removeSonder, rowsOf, setQty, setSonder, SONDER_TAB, stepsOf, summaryOf, tubeEntries, tubeTabs, workOf, type Config, type SonderField, type Work,
} from "./rules.js";
import { hlNow, str, useHl, writeHl } from "./store.js";

const BOX = "rounded-lg border-2 border-border bg-card";
/** a box that is a control (a pick, a card to tap): its edge must stand out (≥ 3:1) */
const TAP = "rounded-lg border-2 border-control bg-card";
const HINT = "m-0 text-muted-foreground";
const INPUT = "min-h-12 w-full min-w-0 rounded-lg border-2 border-control bg-card px-3 text-foreground placeholder:text-muted-foreground";

/** the Flexofit products (the configurator's model), loaded once */
function useCatalog(): { cat: Catalog; loading: boolean } {
  const q = useQuery({ queryKey: ["products", "flexofit"], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("products", { query: "source=flexofit&limit=500", signal }) });
  return { cat: q.data ? catalogOf(q.data as Product[]) : EMPTY_CATALOG, loading: q.isPending };
}
function useWork(): Work {
  const w = useOfferStore((s) => s.scratch.hlWork as Work | undefined);
  return w ?? workOf(hlNow());
}
/** a change of the configurations: remembered for the page, the stored fields rebuilt */
function change(cat: Catalog, fn: (w: Work) => Work, syncArea = false) {
  const s = useOfferStore.getState(), w0 = (s.scratch.hlWork as Work | undefined) ?? workOf(hlNow());
  const w = fn(w0);
  const configs = w.configs.map((c) => (c.id === w.activeId ? normTab(c, cat) : c));
  const next = { ...w, configs };
  s.remember("hlWork", next);
  writeHl(configFields(hlNow(), configs, cat, syncArea));
}
const onActive = (cat: Catalog, fn: (c: Config) => Config, syncArea = false) => change(cat, (w) => ({ ...w, configs: w.configs.map((c) => (c.id === w.activeId ? fn(c) : c)) }), syncArea);

/** a text that is taken over when the field is left or Enter is pressed (today: the "change" event) */
function Commit({ value, onCommit, className, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  // after leaving the field it shows what is stored (a refused or unchanged entry comes back, as today's redraw)
  const [n, setN] = useState(0);
  return <input key={`${value}:${n}`} defaultValue={value} className={className} onBlur={(e) => { if (e.target.value !== value) { onCommit(e.target.value); setN((x) => x + 1); } }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} {...rest} />;
}

function Rail({ w, cat }: { w: Work; cat: Catalog }) {
  const [ask, setAsk] = useState<string | null>(null);
  const asked = w.configs.find((c) => c.id === ask);
  return (
    <aside className="grid content-start gap-2" data-testid="hl-rail">
      <div className="font-semibold">Konfigurationen</div>
      {w.configs.map((c) => (
        <div key={c.id} className={cn(TAP, "flex min-w-0 items-center gap-2 p-1", c.id === w.activeId && "border-primary bg-accent-weak")}>
          <button type="button" className="flex min-h-12 flex-1 items-center gap-2 px-2 text-left" aria-pressed={c.id === w.activeId} onClick={() => change(cat, (x) => ({ ...x, activeId: c.id }))}>
            <span aria-hidden className={cn("size-3 shrink-0 rounded-full", isComplete(c) ? "bg-success" : "border-2 border-warning-strong")} />
            <span className="grid"><strong data-part="name">{c.name}</strong><span className="text-[0.9rem] text-muted-foreground" data-part="summary">{summaryOf(c)}</span></span>
          </button>
          <Button variant="ghost" size="icon" aria-label={`„${c.name}“ entfernen`} disabled={w.configs.length <= 1} onClick={() => setAsk(c.id)}><X aria-hidden /></Button>
        </div>
      ))}
      {asked ? (
        <div role="alertdialog" aria-labelledby="hl-ask-title" className="grid gap-2 rounded-lg border-2 border-destructive p-3">
          <strong id="hl-ask-title">Konfiguration entfernen?</strong>
          <p className="m-0">„{asked.name}“ und alle Auswahlen darin werden entfernt.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setAsk(null); change(cat, (x) => { const configs = x.configs.filter((c) => c.id !== asked.id); return { ...x, configs, activeId: x.activeId === asked.id ? configs[0]!.id : x.activeId }; }); }}>Ja, entfernen</Button>
            <Button variant="outline" onClick={() => setAsk(null)}>Nein, behalten</Button>
          </div>
        </div>
      ) : null}
      <div><Button variant="outline" onClick={() => change(cat, (x) => { const n = x.counter + 1, c = mkConfig(n); return { configs: [...x.configs, c], activeId: c.id, counter: n }; })}><Plus aria-hidden />Weitere Konfiguration</Button></div>
    </aside>
  );
}

function Pick({ selected, img, name, meta, onClick, testid }: { selected: boolean; img: string; name: string; meta: string; onClick: () => void; testid: string }) {
  return (
    <button type="button" aria-pressed={selected} data-testid={testid} onClick={onClick} className={cn(TAP, "flex min-h-16 min-w-0 items-center gap-3 p-2 text-left", selected && "border-primary bg-accent-weak")}>
      <img src={img} alt="" loading="lazy" className={cn(IMG.row, "shrink-0 object-contain")} onError={(e) => e.currentTarget.remove()} />
      <span className="flex min-w-0 flex-col [overflow-wrap:anywhere]"><span className="font-semibold" data-part="name">{name}</span><span className="text-[0.9rem] text-muted-foreground" data-part="meta">{meta}</span></span>
    </button>
  );
}
const Chip = ({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) => <button type="button" aria-pressed={on} data-part="chip" className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)} onClick={onClick}>{children}</button>;

function AreaBody({ c, cat }: { c: Config; cat: Catalog }) {
  const card = (area: "inside" | "outside", title: string, sub: string, img: string) => (
    <button key={area} type="button" data-part="card" aria-pressed={c.area === area} onClick={() => onActive(cat, (x) => pickArea(x, area), true)} className={cn(TAP, "grid min-w-0 justify-items-center gap-1 p-3 text-center", c.area === area && "border-primary bg-accent-weak")}>
      <img src={img} alt="" className={cn(IMG.tile, "object-contain")} onError={(e) => e.currentTarget.remove()} />
      <span className="w-full break-words font-semibold" data-part="title">{title}</span><span className="w-full break-words text-[0.9rem] text-muted-foreground" data-part="sub">{sub}</span>
    </button>
  );
  return <div className="grid grid-cols-2 gap-3">{card("inside", "Innenbereich", "Alu, Stahl & Holz · 8 Oberflächen", "/assets/Innenbereich.png")}{card("outside", "Außenbereich", "Aluminium/Edelstahl · Edelstahl gebürstet", "/assets/Außenbereich.png")}</div>;
}

function SonderRows({ c, cat }: { c: Config; cat: Catalog }) {
  const f = (i: number, field: SonderField) => (v: string) => onActive(cat, (x) => setSonder(x, i, field, v));
  return (
    <div className="grid gap-2" data-testid="hl-sonder">
      {c.sonderprodukte.map((s, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_5rem_auto] items-center gap-2 max-[600px]:grid-cols-2">
          <Commit aria-label="Bezeichnung" placeholder="Bezeichnung" value={str(s.name)} onCommit={f(i, "name")} className={INPUT} />
          <Commit aria-label="Preis netto" placeholder="Preis netto" inputMode="decimal" value={str(s.price)} onCommit={f(i, "price")} className={INPUT} />
          <Commit aria-label="Artikel-ID" placeholder="Artikel-ID" value={str(s.articleId)} onCommit={f(i, "articleId")} className={INPUT} />
          <Commit aria-label="Menge" type="number" min={1} step={1} placeholder="1" value={String(Number(s.qty) > 0 ? s.qty : 1)} onCommit={f(i, "qty")} className={INPUT} />
          <Button variant="ghost" size="icon" aria-label="Sonderprodukt entfernen" onClick={() => onActive(cat, (x) => removeSonder(x, i))}><Trash2 aria-hidden /></Button>
        </div>
      ))}
      <div><Button variant="outline" onClick={() => onActive(cat, addSonder)}><Plus aria-hidden />Sonderprodukt hinzufügen</Button></div>
    </div>
  );
}

function TubeBody({ c, cat }: { c: Config; cat: Catalog }) {
  if (!c.area) return <p className={HINT} data-part="hint">Bitte zuerst Bereich wählen.</p>;
  const groups = tubeTabs(cat, c.area);
  const active = groups.includes(c.tubeTab) || c.tubeTab === SONDER_TAB ? c.tubeTab : groups[0] || SONDER_TAB;
  const nSonder = c.sonderprodukte.filter((s) => s.name && Number(s.price) > 0).length;
  const hint = <p className={HINT} data-part="hint">Material und eine Farbe wählen. Rohre werden pro Meter berechnet — Länge unten in der Positionsliste angeben.</p>;
  const tabs = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Material">
      {groups.map((fam) => { const n = tubeEntries(cat, c.area, fam).filter((e) => c.tubes[keyOf(e)] != null).length; return <Chip key={fam} on={fam === active} onClick={() => onActive(cat, (x) => ({ ...x, tubeTab: fam }))}>{fam}{n ? ` (${n})` : ""}</Chip>; })}
      <Chip on={active === SONDER_TAB} onClick={() => onActive(cat, (x) => ({ ...x, tubeTab: SONDER_TAB }))}>Sonderprodukt{nSonder ? ` (${nSonder})` : ""}</Chip>
    </div>
  );
  if (active === SONDER_TAB) return <div className="grid gap-3">{hint}{tabs}<p className={HINT} data-part="hint">Bezeichnung, Netto-Preis (EK) und Artikel-ID eingeben — Menge unten in der Positionsliste anpassen.</p><SonderRows c={c} cat={cat} /></div>;
  const picks = tubeEntries(cat, c.area, active);
  return (
    <div className="grid gap-3">{hint}{tabs}
      {picks.length ? <div className="grid gap-2 sm:grid-cols-2">{picks.map((e) => { const k = keyOf(e); return <Pick key={k} testid="hl-tube" selected={c.tubes[k] != null} img={imageFor(e)} name={e.label || productVariant(e.product)} meta={`${e.product.productId || ""} · ${money(e.product.price)}/Meter`} onClick={() => onActive(cat, (x) => pickTube(x, k))} />; })}</div>
        : <p className={HINT} data-part="hint">Keine Rohre für diesen Bereich verfügbar.</p>}
    </div>
  );
}

function FittingBody({ c, cat }: { c: Config; cat: Catalog }) {
  if (!c.area) return <p className={HINT} data-part="hint">Bitte zuerst Bereich wählen.</p>;
  const head = c.area === "outside"
    ? <p className={HINT} data-part="hint">Beschläge und Montagematerial (Edelstahlstützen, Wandanschlüsse etc.) im Außenbereich gibt es nur in <b>{OUTSIDE_FINISH}</b>.</p>
    : <><p className={HINT} data-part="hint">Zuerst eine Oberfläche wählen — alle Beschläge dieser Konfiguration werden dann in dieser Oberfläche kalkuliert.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Oberfläche">{availableFinishes(cat).map((f) => <Chip key={f} on={c.finish === f} onClick={() => onActive(cat, (x) => pickFinish(x, f))}>{f}</Chip>)}</div></>;
  if (c.area !== "outside" && !c.finish) return <div className="grid gap-3">{head}<p className={HINT} data-part="hint">Bitte zuerst eine Oberfläche auswählen.</p></div>;
  const choices = fittingChoices(c, cat);
  return (
    <div className="grid gap-3">{head}
      {choices.length ? <div className="grid gap-2 sm:grid-cols-2">{choices.map(({ label, entry }) => { const k = keyOf(entry); return <Pick key={k} testid="hl-fitting" selected={c.fittings[k] != null} img={imageFor(entry)} name={label} meta={`${entry.product.productId || ""} · ${money(entry.product.price)}`} onClick={() => onActive(cat, (x) => pickFitting(x, k))} />; })}</div>
        : <p className={HINT} data-part="hint">Keine Beschläge verfügbar.</p>}
      {choices.length ? <p className={HINT} data-part="hint">Menge je Beschlag unten in der Positionsliste angeben.</p> : null}
    </div>
  );
}

function Panel({ c, cat }: { c: Config; cat: Catalog }) {
  const complete = isComplete(c);
  const body = { area: <AreaBody c={c} cat={cat} />, rohr: <TubeBody c={c} cat={cat} />, beschlaege: <FittingBody c={c} cat={cat} /> };
  return (
    <div className="grid content-start gap-3" data-testid="hl-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Commit aria-label="Name der Konfiguration" placeholder="Name der Konfiguration" value={c.name} onCommit={(v) => onActive(cat, (x) => ({ ...x, name: v.trim() || x.name }))} className={cn(INPUT, "max-w-sm flex-1 font-semibold")} />
        <span data-testid="hl-status" className={cn("rounded-full px-3 py-1 text-[0.9rem] font-semibold", complete ? "bg-success-weak text-success-strong" : "bg-warning-weak text-warning-strong")}>{complete ? "Vollständig" : "Unvollständig"}</span>
      </div>
      {stepsOf(c).map((s, i) => (
        <section key={s.key} className={BOX} data-testid={`hl-step-${s.key}`}>
          <button type="button" aria-expanded={c.open[s.key]} onClick={() => onActive(cat, (x) => ({ ...x, open: { ...x.open, [s.key]: !x.open[s.key] } }))} className="flex min-h-12 w-full items-center gap-3 px-3 text-left">
            <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[0.85rem] font-bold", s.done ? "bg-success text-white" : "bg-muted")}>{s.done ? <Check className="size-4" /> : i + 1}</span>
            <span className="flex-1 font-semibold" data-part="title">{s.title}</span>
            <span className="text-muted-foreground" data-part="value">{s.value}</span>
            <ChevronDown aria-hidden className={cn("size-5 transition-transform", c.open[s.key] && "rotate-180")} />
          </button>
          {c.open[s.key] ? <div className="border-t-2 border-border p-3" data-part="body">{body[s.key]}</div> : null}
        </section>
      ))}
    </div>
  );
}

function Ledger({ c, cat }: { c: Config; cat: Catalog }) {
  const rows = rowsOf(c, cat);
  return (
    <section className="grid gap-2" data-testid="hl-ledger">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-[1.1rem] font-semibold">Positionen — {c.name}</h3>
        <span className="text-muted-foreground" data-part="count">{rows.length} Position{rows.length === 1 ? "" : "en"}</span>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead><tr className="text-left text-[0.9rem] text-muted-foreground"><th className="py-1 font-semibold">Position</th><th className="py-1 text-right font-semibold">Menge</th><th className="py-1 text-right font-semibold">Einzelpreis</th><th className="py-1 text-right font-semibold">Summe</th><th><span className="sr-only">Entfernen</span></th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={`${r.kind}:${r.key}`} className="border-t border-border" data-testid="hl-line" data-kind={r.kind} data-key={r.key}>
                <td className="py-1"><div className="font-semibold" data-part="name">{r.name}</div><div className="text-[0.9rem] text-muted-foreground" data-part="sub">{r.sub}</div></td>
                <td className="py-1 text-right"><span className="inline-flex items-center gap-1"><Commit aria-label={`Menge ${r.name}`} type="number" min={0} step={r.kind === "tube" ? 0.1 : 1} value={String(r.qty)} onCommit={(v) => onActive(cat, (x) => setQty(x, r.kind, r.key, v))} className={cn(INPUT, "w-24 text-right")} /> <span data-part="unit">{r.unit}</span></span></td>
                <td className="py-1 text-right tabular-nums" data-part="price">{money(r.price)}</td>
                <td className="py-1 text-right tabular-nums" data-part="total">{money(r.total)}</td>
                <td className="py-1"><Button variant="ghost" size="icon" aria-label={`${r.name} entfernen`} onClick={() => onActive(cat, (x) => removeLine(x, r.kind, r.key))}><X aria-hidden /></Button></td>
              </tr>
            )) : <tr><td colSpan={5} className="py-2 text-muted-foreground">Noch keine Auswahl getroffen.</td></tr>}
          </tbody>
          <tfoot><tr className="border-t-2 border-border"><td colSpan={3} className="py-2 text-right font-semibold">Gesamt (netto, EK)</td><td className="py-2 text-right font-bold tabular-nums" data-testid="hl-ledger-total">{money(ledgerTotal(rows))}</td><td /></tr></tfoot>
        </table>
      </div>
    </section>
  );
}

/** C1: what the retired Handlauf page holds for this offer — shown, not changed (U-054) */
function LegacyData() {
  const hl = useHl();
  if (!hasLegacyData(hl)) return null;
  const rows = legacyRows(hl), fields = legacyFields(hl);
  return (
    <section className={cn(BOX, "grid gap-2 p-3")} data-testid="hl-legacy" aria-labelledby="hl-legacy-title">
      <h3 id="hl-legacy-title" className="m-0 text-[1.1rem] font-semibold">Positionen aus der bisherigen Handlauf-Seite</h3>
      <p className={HINT} data-part="hint">Dieses Angebot enthält Einträge der früheren Handlauf-Seite. Sie werden unverändert berechnet und gespeichert und können hier nicht geändert werden.</p>
      {rows.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead><tr className="text-left text-[0.9rem] text-muted-foreground"><th className="py-1 font-semibold">Bezeichnung</th><th className="py-1 font-semibold">Artikel-ID</th><th className="py-1 text-right font-semibold">Menge</th><th className="py-1 text-right font-semibold">Preis (netto)</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border" data-testid="hl-legacy-row"><td className="py-1"><div>{r.label}</div>{r.group ? <div className="text-[0.9rem] text-muted-foreground">{r.group}</div> : null}</td><td className="py-1">{r.productId}</td><td className="py-1 text-right">{r.qty}</td><td className="py-1 text-right tabular-nums">{r.price}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {fields.length ? <dl className="m-0 grid gap-1 text-[0.9rem]" data-testid="hl-legacy-fields">{fields.map(([k, v]) => <div key={k} className="flex flex-wrap gap-2"><dt className="font-semibold">{k}</dt><dd className="m-0 break-all text-muted-foreground">{v}</dd></div>)}</dl> : null}
    </section>
  );
}

function Notes() {
  const hl = useHl();
  const open = useOfferStore((s) => s.scratch.hlNotesOpen === true); // collapsed by default, as today
  const sketch = (hl.sketch && typeof hl.sketch === "object" ? hl.sketch : { json: "", dataUrl: "" }) as Partial<Sketch>;
  return (
    <details className={cn(BOX, "p-3")} data-testid="hl-notes" open={open} onToggle={(e) => { const to = e.currentTarget.open; if (to !== open) useOfferStore.getState().remember("hlNotesOpen", to); }}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">Notizen &amp; Projekt-Skizze anzeigen<ChevronDown aria-hidden className="size-5" /></summary>
      {open ? (
        <div className="grid gap-3 pt-3">
          <TextAreaField id="hl-note" label="Notizen / Anmerkungen (werden im Entwurf + Angebot gespeichert)" placeholder="z. B. Besonderheiten, Kundenwünsche, Hinweise zur Montage …" rows={20} value={str(hl.hlNote)} onChange={(v) => writeHl({ hlNote: v })} />
          <SketchPad value={sketch} onChange={(next) => writeHl({ sketch: { json: next.json, dataUrl: next.dataUrl } })} />
        </div>
      ) : null}
    </details>
  );
}

export function Handlaeufe() {
  const { cat, loading } = useCatalog();
  const w = useWork();
  const active = w.configs.find((c) => c.id === w.activeId) ?? w.configs[0]!;
  const shown = normTab(active, cat);
  return (
    <Card aria-labelledby="hl-title" data-testid="hl-konfigurator">
      <CardTitle id="hl-title">Handläufe</CardTitle>
      <p className={HINT} data-part="hint">Mehrere Konfigurationen anlegen, benennen und einzeln bestücken. Positionen erscheinen automatisch in der Liste unten und fließen in die Preisberechnung ein.</p>
      <LegacyData />
      <div className="grid gap-1">
        <h3 className="m-0 text-[1.1rem] font-semibold">Handläufe</h3>
        <p className={HINT} data-part="hint">Konfiguration wählen, Schritte in beliebiger Reihenfolge ausfüllen: Bereich, Rohr &amp; Farbe, Beschläge &amp; Oberfläche.</p>
        {loading ? <p className={HINT} role="status">Produkte werden geladen …</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <Rail w={w} cat={cat} />
        <Panel c={shown} cat={cat} />
      </div>
      <Ledger c={active} cat={cat} />
      <Notes />
    </Card>
  );
}
