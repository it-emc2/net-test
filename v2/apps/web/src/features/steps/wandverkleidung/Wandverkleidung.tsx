// Wandverkleidung (Badumbau; ADR 026, phase 4): the switch, the product line, the Ausführung
// and the line winwall (rows of decor, format and number; accessories). The stored fields are
// exactly today's (test/wandverkleidung.test.tsx compares with what today's UI stores and shows
// for the same inputs). Still edited in today's UI: the wall calculator ("Wände und Dekor"),
// the lines VIGOUR and Badolux, sketch and note.
import { Minus, Plus, X } from "lucide-react";
import { useParams } from "react-router";
import { Button, Card, CardTitle, Choices, Input, Switch, cn } from "../../../shared/ui/index.js";
import { LegacyLink, useOfferStore } from "../../offer/index.js";
import { arbeitenChanges, toggleTask } from "../arbeiten/rules.js";
import { WW_DECORS } from "./decors.js";
import {
  ACCESSORIES, FORMATS, KINDS, LINES, SHOWER_TASK, accessoryQty, addRow, chooseLine, customCaption, customHint, decorOf, fromRows, lineOf, rowNote, rowTitle, rowsOf,
  sealing, setAccessoryQty, toggleAccessory, withDecor, type Line, type Row,
} from "./rules.js";

const WV = "wandverkleidung";
type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
const wvNow = (): Fields => offerNow().wandverkleidung ?? {};
const write = (fields: Fields) => useOfferStore.getState().patch(WV as never, fields as never);
const remember = (key: string, value: unknown) => useOfferStore.getState().remember(key, value);
const useWv = () => useOfferStore((s) => (s.offer as Record<string, any> | null)?.wandverkleidung as Fields | undefined) ?? {};
const ROW = "flex min-h-12 items-center gap-3 rounded-lg border-2 border-input bg-card px-4 py-2";

function Stepper({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (text: string) => void }) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button variant="outline" size="icon" aria-label={`${label}: weniger`} onClick={() => onChange(String(Math.max(0, n - 1)))}><Minus aria-hidden /></Button>
      <span className="w-16"><Input type="number" min={0} step={1} inputMode="numeric" aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="px-2 text-center" /></span>
      <Button variant="outline" size="icon" aria-label={`${label}: mehr`} onClick={() => onChange(String(n + 1))}><Plus aria-hidden /></Button>
    </span>
  );
}

/** The decor tiles of the open row, with "Anderes Dekor" and its number. */
function Decors({ onPick }: { onPick: (value: string, text?: string) => void }) {
  const wv = useWv();
  const picked = String(wv.wvWwDecor ?? "");
  const hint = customHint(wv);
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="wv-decors">
      <legend className="mb-1.5 p-0 font-semibold">Dekor für diese Zeile</legend>
      <div className="flex flex-wrap gap-2">
        {[...WW_DECORS, { value: "custom", caption: customCaption(wv) }].map((d) => (
          <label key={d.value} className="grid w-28 cursor-pointer justify-items-center gap-1 rounded-lg border-2 border-input bg-card p-2 text-center text-[0.9rem] [overflow-wrap:anywhere] has-[:checked]:border-primary has-[:checked]:bg-accent-weak has-[:checked]:font-bold">
            <input type="radio" name="wvWwDecor" className="sr-only" value={d.value} checked={picked === d.value} onChange={() => onPick(d.value, d.value === "custom" ? String(wv.wvWwDecorCustom ?? "") : "")} />
            {d.value === "custom" ? <span aria-hidden className="grid size-14 place-items-center rounded border-2 border-dashed border-input text-2xl">+</span> : <img src={`/assets/winwall/${d.value}.jpg`} alt="" className="size-14 rounded object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />}
            <span data-part={d.value === "custom" ? "custom-caption" : undefined}>{d.caption}</span>
          </label>
        ))}
      </div>
      {picked === "custom" ? (
        <div className="grid gap-1.5" data-testid="wv-custom">
          <label htmlFor="wv-decor-number" className="font-semibold">Dekor-Nummer</label>
          <div className="w-40"><Input id="wv-decor-number" placeholder="WS 233" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={7} value={String(wv.wvWwDecorCustom ?? "")} onChange={(e) => onPick("custom", e.target.value)} /></div>
          <small data-testid="wv-custom-hint" className={cn(hint.kind === "ok" && "text-success", hint.kind === "warn" && "text-destructive", !hint.kind && "text-muted-foreground")}>{hint.text}</small>
        </div>
      ) : null}
    </fieldset>
  );
}

/** winwall: rows of decor, format and number of plates. */
function Rows() {
  const wv = useWv();
  const rows = rowsOf(wv);
  // which row is open: kept while the offer is open; an opened offer starts with all rows folded
  const ui = (useOfferStore((s) => s.scratch.wvRowOpen) as { idx: number; folded: boolean } | undefined) ?? { idx: rows.length ? 0 : -1, folded: true };
  const openIdx = ui.folded ? -1 : ui.idx;
  /** the rows changed: plates, suggestions and the decor shown for the open row follow */
  const set = (next: Row[], idx: number, folded: boolean) => { remember("wvRowOpen", { idx, folded }); write({ ...fromRows(next), ...(folded ? {} : decorOf(next[idx])) }); };
  const tap = (i: number) => { const folded = i === ui.idx ? !ui.folded : false; remember("wvRowOpen", { idx: i, folded }); if (!folded) write(decorOf(rows[i])); };
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Platten — winwall</legend>
      {rows.length ? rows.map((r, i) => {
        const open = i === openIdx;
        return (
          <div key={i} data-testid="wv-row" data-open={open} className={cn("grid gap-3 rounded-lg border-2 bg-card p-3", open ? "border-primary" : "border-input")}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => tap(i)} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-foreground">
                {r.code ? <img src={`/assets/winwall/${r.code}.jpg`} alt="" className="size-10 shrink-0 rounded object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <span className="size-10 shrink-0" />}
                <span className="grid min-w-0"><b data-part="title">{rowTitle(r)}</b><small data-part="note" className="text-muted-foreground">{rowNote(rows, i, open)}</small></span>
              </button>
              <select aria-label={`Format Zeile ${i + 1}`} value={r.fmt} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, fmt: e.target.value } : x)), ui.idx, ui.folded)} className="min-h-12 cursor-pointer rounded-lg border-2 border-input bg-card px-2 text-foreground">
                {FORMATS.map(([c, t]) => <option key={c} value={c}>{t}</option>)}
              </select>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label={`Zeile ${i + 1}: weniger`} onClick={() => set(rows.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)), ui.idx, ui.folded)}><Minus aria-hidden /></Button>
                <output data-part="qty" className="w-8 text-center font-semibold">{r.qty}</output>
                <Button variant="outline" size="icon" aria-label={`Zeile ${i + 1}: mehr`} onClick={() => set(rows.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)), ui.idx, ui.folded)}><Plus aria-hidden /></Button>
              </span>
              <Button variant="ghost" size="icon" aria-label={`Zeile ${i + 1} entfernen`} onClick={() => { const next = rows.filter((_, j) => j !== i); set(next, Math.min(ui.idx, next.length - 1), ui.folded); }}><X aria-hidden /></Button>
            </div>
            {open ? <Decors onPick={(value, text) => set(rows.map((x, j) => (j === i ? withDecor(x, value, text) : x)), ui.idx, false)} /> : null}
          </div>
        );
      }) : <p className="m-0 text-muted-foreground">Noch keine Platten. Mit „+ Zeile hinzufügen“ beginnen.</p>}
      <div><Button variant="outline" onClick={() => { const next = addRow(rows, wvNow()); set(next, next.length - 1, false); }}><Plus aria-hidden />Zeile hinzufügen (Dekor und Format)</Button></div>
      <p className="m-0 text-[0.9rem] text-muted-foreground">Zwei gleiche Platten (gleiches Dekor und Format) werden als Set bestellt (günstiger).</p>
    </fieldset>
  );
}

function Accessories() {
  const wv = useWv();
  const seal = sealing(wv, rowsOf(wv));
  const manual = Math.round(Number(wv.wvWwSealingQty) || 0) > 0;
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold" data-testid="wv-acc-label">Zubehör winwall</legend>
      {ACCESSORIES.map((a) => (
        <div key={a.id} data-testid={`wv-acc-${a.id}`} className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={!!wv[`wvWw_${a.id}`]} onChange={(e) => write(toggleAccessory(wvNow(), a.id, e.target.checked))} />
            <span className="grid"><span data-part="caption">{a.caption}</span><small data-part="small" className="text-muted-foreground">{a.small}</small></span>
          </label>
          <Stepper label={`Menge ${a.caption}`} value={String(accessoryQty(wv, a.id))} onChange={(t) => write(setAccessoryQty(a.id, Number(t)))} />
        </div>
      ))}
      <div data-testid="wv-acc-sealing" className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={!!wv.wvWwSealing} onChange={(e) => write({ wvWwSealing: e.target.checked ? "on" : undefined })} />
          <span className="grid"><span data-part="caption">Abdichtungsset DIN 18534-1</span>
            <small data-part="small" className="text-muted-foreground">{seal.hint}{manual ? <> <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-primary underline" onClick={(e) => { e.preventDefault(); write({ wvWwSealingQty: "" }); }}>Automatisch</button></> : null}</small></span>
        </label>
        <Stepper label="Menge Abdichtungsset (leer = nach Wandfläche)" value={String(wv.wvWwSealingQty ?? "")} placeholder={String(seal.auto)} onChange={(t) => write({ wvWwSealingQty: t })} />
      </div>
      <div data-testid="wv-acc-cut" className={cn(ROW, "has-[:checked]:border-primary")}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={!!wv.wvWwCut} onChange={(e) => write({ wvWwCut: e.target.checked ? "on" : undefined })} />
          <span className="grid"><span data-part="caption">Zuschnitt durch winwall</span><small data-part="small" className="text-muted-foreground">10 € je Platte, gerade Schnitte · aus: wir schneiden selbst</small></span>
        </label>
      </div>
    </fieldset>
  );
}

export function Wandverkleidung() {
  const wv = useWv();
  const tasks = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne?.workTasks as string[] | undefined);
  const height = useOfferStore((s) => String((s.offer as Record<string, any> | null)?.duschwanne?.wandverkleidungHoehe ?? ""));
  const { dealId = "" } = useParams();
  const on = wv.wvEnabled === true;
  const line = lineOf(wv);
  const shower = Array.isArray(tasks) && tasks.includes(SHOWER_TASK);
  const dw = (fields: (dw: Fields) => Fields) => { const o = offerNow(); useOfferStore.getState().patchAll(arbeitenChanges(o, fields(o.duschwanne ?? {}))); };
  const toLine = (to: Line) => {
    const st = useOfferStore.getState();
    const r = chooseLine(wvNow(), to, (st.scratch.wvLines as Partial<Record<Line, Fields>> | undefined) ?? {});
    st.remember("wvLines", r.parked);
    write(r.changes);
  };
  return (
    <Card aria-labelledby="wv-title">
      <CardTitle id="wv-title">Wandverkleidung</CardTitle>
      <div className="flex items-center gap-3">
        <Switch id="wv-on" checked={on} onChange={(v) => write({ wvEnabled: v })} label="Wandverkleidung" />
        <label htmlFor="wv-on" className="grid cursor-pointer"><strong>Wandverkleidung</strong><small className="text-muted-foreground">Paneele, Profile und Zubehör im Angebot. Aus: nichts berechnet.</small></label>
      </div>
      {on ? (
        <>
          <div className="grid gap-3 rounded-lg border-2 border-border p-3">
            <div className="grid"><strong>Produktlinie</strong><small className="text-muted-foreground" data-testid="wv-line-text">Nur Produkte von {LINES[line].brand}</small></div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Produktlinie wählen">
              {(Object.keys(LINES) as Line[]).map((t) => (
                <button key={t} type="button" aria-pressed={line === t} onClick={() => toLine(t)} className={cn("grid min-h-12 cursor-pointer rounded-lg border-2 px-3 py-1 text-left", line === t ? "border-primary bg-accent-weak" : "border-input bg-card")}>
                  <strong>{LINES[t].name}</strong><span className="text-[0.85rem] text-muted-foreground">{LINES[t].sub}</span>
                </button>
              ))}
            </div>
          </div>
          <Choices legend="Ausführung" name="wv-kind" options={KINDS} value={String(wv.wvKind ?? "") || undefined} onChange={(v) => write({ wvKind: v })} />
          <div className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={shower} onChange={(e) => dw((d) => toggleTask(d, SHOWER_TASK, e.target.checked))} />
              <span>Im Duschbereich bis Höhe <small className="text-muted-foreground">(Arbeiten)</small></span>
            </label>
            <span className="flex items-center gap-2"><span className="w-24"><Input type="number" min={0} step={1} inputMode="numeric" placeholder="___" aria-label="Höhe in cm" value={height} onChange={(e) => dw(() => ({ wandverkleidungHoehe: e.target.value }))} /></span>cm</span>
          </div>
          <div className="grid gap-2 rounded-lg border-2 border-border p-3">
            <strong>Wände und Dekor — Bedarf berechnen</strong>
            <p className="m-0">Der Bedarfsrechner (Wandmaße, Dekor je Wand, Zuschnittliste) wird noch in der bisherigen Ansicht bedient. Ihre Eingaben werden mitgenommen.</p>
            <LegacyLink dealId={dealId} step="Wandverkleidung">Bedarf in der bisherigen Ansicht berechnen</LegacyLink>
          </div>
          {line === "ww" ? <><Rows /><Accessories /></> : (
            <div className="grid gap-2 rounded-lg border-2 border-border p-3">
              <strong>Paneele und Zubehör — {LINES[line].name}</strong>
              <p className="m-0">Die Linie {LINES[line].name} wird noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
              <LegacyLink dealId={dealId} step="Wandverkleidung">Wandverkleidung in der bisherigen Ansicht</LegacyLink>
            </div>
          )}
          <div className="grid gap-2 rounded-lg border-2 border-border p-3">
            <strong>Skizze und Notiz</strong>
            <LegacyLink dealId={dealId} step="Wandverkleidung">Skizze und Notiz in der bisherigen Ansicht</LegacyLink>
          </div>
        </>
      ) : null}
    </Card>
  );
}
