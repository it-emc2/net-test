// Wandverkleidung (Badumbau; ADR 026, phase 4): the switch, the product line, the Ausführung
// and the line winwall (rows of decor, format and number; accessories). The stored fields are
// exactly today's (test/wandverkleidung.test.tsx compares with what today's UI stores and shows
// for the same inputs). Also the wall calculator of the line winwall (calc.ts, Drawing.tsx).
// The lines VIGOUR (vigour.ts) and Badolux (keramico.ts) use the same calculator.
// Still edited in today's UI: sketch and note.
import { Minus, Plus, X } from "lucide-react";
import { useParams } from "react-router";
import { Button, Card, CardTitle, Choices, Input, Switch, cn } from "../../../shared/ui/index.js";
import { LegacyLink, useOfferStore } from "../../offer/index.js";
import { useQuery } from "@tanstack/react-query";
import { call } from "../../../shared/api/index.js";
import { arbeitenChanges, toggleTask, wvChanges } from "../arbeiten/rules.js";
import { LEGEND, NOTE, SITUATIONS, WALLS, cutList, heightWarning, planOf, sameDecorEverywhere, setWallDecor, situationOf, wallDecorOf, wallGroups, wallsOf, widthsIn, type Plan, type WallKey } from "./calc.js";
import { VG_COLORS } from "./colors.js";
import * as bx from "./keramico.js";
import * as vg from "./vigour.js";
import { WW_DECORS } from "./decors.js";
import { Drawing, TONES } from "./Drawing.js";
import {
  ACCESSORIES, FORMATS, KINDS, LINES, SHOWER_TASK, accessoryQty, addRow, areaOf, chooseLine, customCaption, customHint, decorCode, decorOf, fromRows, lineOf, rowNote, rowTitle, rowsOf,
  sealing, setAccessoryQty, toggleAccessory, withDecor, type Line, type Row,
} from "./rules.js";

const WV = "wandverkleidung";
type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
const wvNow = (): Fields => offerNow().wandverkleidung ?? {};
/** every change of this step also brings the work-time suggestion up to date (panels, silicone) */
const write = (fields: Fields) => useOfferStore.getState().patchAll(wvChanges(offerNow(), fields));
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

/** What the wall calculator needs to know about a product line. */
interface CalcKit {
  line: "ww" | "hm" | "bx"; note: string; maxHeight: number; heightNote?: (wv: Fields) => string;
  tiles: readonly { value: string; caption: string; img: string }[];
  plan: (wv: Fields) => Plan; mix: (plan: Plan) => string;
  /** the picture on a wall: its own decor, else the line's */
  texture: (wv: Fields, own: string | undefined) => string;
  /** the walls' rows for `next`, measured against the offer as it was (`before`); null: the walls were never used */
  rows: (before: Fields, next: Fields, decor: ReturnType<typeof wallDecorOf>) => { wallDecor: ReturnType<typeof wallDecorOf>; fields: Fields; count: number } | null;
}
const WW_KIT: CalcKit = {
  line: "ww", note: NOTE, maxHeight: 250, tiles: WW_DECORS.map((d) => ({ ...d, img: `/assets/winwall/${d.value}.jpg` })),
  plan: planOf, mix: () => "",
  texture: (wv, own) => { const code = decorCode(own) ?? decorCode(wv.wvWwDecor === "custom" ? wv.wvWwDecorCustom : wv.wvWwDecor); return code ? `/assets/winwall/panel/${code}.jpg` : ""; },
  rows: (before, next, decor) => {
    const r = wallGroups(next, decor, { isTile: (v) => WW_DECORS.some((d) => d.value === v), key: (x: Row) => `${x.code}|${x.fmt}`, current: rowsOf(next),
      rowsFor: (v, widths) => Object.entries(planOf({ ...next, wvKLinks: widths.links ?? "", wvKBack: widths.back ?? "", wvKRechts: widths.rechts ?? "" }).qty ?? {}).filter(([, n]) => n > 0).map(([fmt, n]) => ({ code: decorCode(v), fmt, qty: n, custom: false, text: "" })) });
    // as today, the suggested profiles are measured against the plan as it was before this change
    return r && { wallDecor: r.wallDecor, fields: fromRows(r.rows, planOf(before)), count: r.rows.length };
  },
};
const vigourKit = (prices: vg.Prices): CalcKit => ({
  line: "hm", note: vg.NOTE, maxHeight: vg.MAX_HEIGHT, tiles: VG_COLORS,
  plan: (wv) => vg.planFor(wv, situationOf(wv), widthsIn(wv), prices), mix: (plan) => `${vg.mixText(plan as never)} mm`,
  texture: (wv, own) => vg.colorImage(own) || vg.colorImage(wv.wvColor || "Marmor weiß"),
  rows: (_before, next, decor) => {
    const r = wallGroups(next, decor, { isTile: (v) => VG_COLORS.some((c) => c.value === v), key: (x: vg.VRow) => `${x.color}|${x.size}`, current: vg.rowsOf(next),
      rowsFor: (v, widths) => vg.rowsForPlan(vg.planFor(next, situationOf(next), widths, prices), v) });
    return r && { wallDecor: r.wallDecor, fields: vg.fromRows(next, r.rows), count: r.rows.length };
  },
});

const BX_KIT: CalcKit = {
  line: "bx", note: bx.NOTE, maxHeight: bx.MAX_HEIGHT, tiles: bx.DECORS, plan: bx.planOf, mix: () => bx.MIX, heightNote: bx.motifCutNote,
  texture: (wv, own) => { const pid = String(own || wv.wvColor || "").split("|", 1)[0]!; return /^WP/i.test(pid) ? bx.image(pid) : ""; },
  rows: (_before, next, decor) => {
    const r = wallGroups(next, decor, { isTile: (v) => bx.DECORS.some((d) => d.value === v), key: (x: bx.KRow) => x.pid, current: bx.rowsOf(next), rowsFor: (v, widths) => bx.rowsForPlan(next, situationOf(next), widths, v) });
    return r && { wallDecor: r.wallDecor, fields: bx.fromRows(next, r.rows), count: r.rows.length };
  },
};

/** The wall calculator: situation, a decor and a width per wall, the height — and the drawing.
 *  Walls with a decor and a width write the rows of the line below. */
function Calculator({ kit }: { kit: CalcKit }) {
  const wv = useWv();
  const sit = situationOf(wv), walls = wallsOf(sit), plan = kit.plan(wv), wd = wallDecorOf(wv, kit.line);
  const remembered = useOfferStore((s) => s.scratch.wvWallOpen) as WallKey | null | undefined;
  const open = remembered && walls.includes(remembered) ? remembered : null;
  const room = (useOfferStore((s) => s.scratch.wvCalcView) ?? "room") === "room";
  /** the walls changed: their rows replace the ones they made before */
  const apply = (fields: Fields, decor?: ReturnType<typeof wallDecorOf>) => {
    const before = wvNow();
    const next = { ...before, ...fields };
    const r = kit.rows(before, next, decor ?? wallDecorOf(next, kit.line));
    if (!r) return write(decor ? { ...fields, wvWallDecor: JSON.stringify(decor) } : fields);
    remember("wvRowOpen", { idx: kit.line === "hm" ? r.count - 1 : r.count ? 0 : -1, folded: true });
    write({ ...fields, wvWallDecor: JSON.stringify(r.wallDecor), ...r.fields });
  };
  const toggle = (key: WallKey) => remember("wvWallOpen", open === key ? null : key);
  const pick = (value: string) => { if (!open) return; const r = setWallDecor(wvNow(), open, value, kit.line); remember("wvWallOpen", r.next); apply({}, r.wallDecor); };
  const same = () => { const all = sameDecorEverywhere(wvNow(), open, kit.line); if (!all) return; remember("wvWallOpen", null); apply({}, all); };
  const texture = (key: WallKey) => kit.texture(wv, wd[key]);
  const decorCaption = (v: unknown) => kit.tiles.find((t) => t.value === v)?.caption ?? "";
  const cuts = cutList(plan, kit.line === "ww" ? undefined : kit.mix(plan), kit.heightNote?.(wv)), warn = heightWarning(wv, kit.maxHeight);
  const chip = "min-h-12 cursor-pointer rounded-lg border-2 px-4 font-semibold";
  return (
    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Wände und Dekor — Bedarf berechnen</legend>
      <p className="m-0 text-[0.95rem] text-muted-foreground" data-testid="kc-note">{kit.note}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Wandsituation">
          {SITUATIONS.map((x) => <button key={x.value} type="button" aria-pressed={sit === x.value} onClick={() => { if (sit !== x.value) apply({ wvKSituation: x.value }); }} className={cn(chip, sit === x.value ? "border-primary bg-accent-weak" : "border-input bg-card")}>{x.label}</button>)}
        </div>
        <div className="flex gap-2" role="group" aria-label="Ansicht">
          {([["room", "Raumansicht"], ["panels", "Nur Paneele"]] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={room === (v === "room")} onClick={() => remember("wvCalcView", v)} className={cn(chip, "font-normal", room === (v === "room") ? "border-primary bg-accent-weak" : "border-input bg-card")}>{label}</button>)}
        </div>
      </div>
      <Drawing situation={sit} widths={{ links: Number(String(wv.wvKLinks ?? "").replace(",", ".")) || 0, back: Number(String(wv.wvKBack ?? "").replace(",", ".")) || 0, rechts: Number(String(wv.wvKRechts ?? "").replace(",", ".")) || 0 }} plan={plan} room={room} texture={texture} onWall={toggle} />
      <p className="m-0 text-[0.9rem] text-muted-foreground">{LEGEND}</p>
      {walls.map((key, i) => {
        const width = String(wv[WALLS[key].field] ?? "");
        const caption = decorCaption(wd[key]);
        return (
          <div key={key} data-testid="kc-wall" data-wall={key} data-open={open === key} className={cn("grid gap-3 rounded-lg border-2 bg-card p-3", open === key ? "border-primary" : "border-input")}>
            <div className="flex flex-wrap items-center gap-3">
              <span data-part="letter" className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: TONES[i]!.solid }}>{TONES[i]!.letter}</span>
              <span className="grid min-w-0 flex-1"><span data-part="name">{WALLS[key].name}</span><small data-part="sub" className="text-destructive">{Number(width.replace(",", ".")) > 0 ? "" : "Breite fehlt"}</small></span>
              <Button variant="outline" aria-label={`Dekor für ${WALLS[key].name} wählen`} aria-expanded={open === key} onClick={() => toggle(key)}>
                {caption ? <img src={kit.tiles.find((t) => t.value === wd[key])?.img} alt="" className="size-7 rounded object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : null}<span data-part="decor">{caption || "Dekor wählen"}</span>
              </Button>
              <span className="flex items-center gap-2"><span className="w-24"><Input type="number" min={0} max={2000} step={1} inputMode="decimal" placeholder="Breite" aria-label={`Breite ${WALLS[key].name} in cm`} value={width} onChange={(e) => apply({ [WALLS[key].field]: e.target.value })} /></span>cm</span>
            </div>
            {open === key ? (
              <div className="grid gap-2" data-testid="kc-tiles">
                <div className="flex flex-wrap gap-2">
                  {kit.tiles.map((d) => (
                    <button key={d.value} type="button" data-value={d.value} aria-pressed={wd[key] === d.value} onClick={() => pick(d.value)} className={cn("grid w-28 cursor-pointer justify-items-center gap-1 rounded-lg border-2 bg-card p-2 text-center text-[0.9rem] text-foreground [overflow-wrap:anywhere]", wd[key] === d.value ? "border-primary bg-accent-weak font-bold" : "border-input")}>
                      <img src={d.img} alt="" className="size-14 rounded object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />{d.caption}
                    </button>
                  ))}
                </div>
                <div><Button variant="secondary" onClick={same}>Alle Wände gleiches Dekor</Button></div>
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-input bg-card p-3">
        <label htmlFor="kc-height">Höhe der Verkleidung</label>
        <span className="flex items-center gap-2"><span className="w-24"><Input id="kc-height" type="number" min={0} max={1000} step={1} inputMode="decimal" placeholder="255" value={String(wv.wvKHoehe ?? "")} onChange={(e) => apply({ wvKHoehe: e.target.value })} /></span>cm</span>
      </div>
      {warn ? <p className="m-0 rounded-lg border-2 border-destructive p-3" role="status" data-testid="kc-warn">{warn}</p> : null}
      {cuts ? <p className="m-0 rounded-lg border-2 border-border p-3" data-testid="kc-cuts"><b>{cuts.title}</b> <span>{cuts.text}</span></p> : null}
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
  const set = (next: Row[], idx: number, folded: boolean) => { remember("wvRowOpen", { idx, folded }); write({ ...fromRows(next, planOf(wvNow())), ...(folded ? {} : decorOf(next[idx])) }); };
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

/** VIGOUR: rows of colour (or Sonderdruck), width and number of panels. */
function VigourRows() {
  const wv = useWv();
  const rows = vg.rowsOf(wv);
  // the marked row; an opened offer starts with the tiles folded
  const ui = (useOfferStore((s) => s.scratch.wvRowOpen) as { idx: number; folded: boolean } | undefined) ?? { idx: -1, folded: true };
  const idx = ui.idx >= rows.length || ui.idx < 0 ? rows.length - 1 : ui.idx;
  const openIdx = ui.folded ? -1 : idx;
  const set = (next: vg.VRow[], i: number, folded: boolean) => { remember("wvRowOpen", { idx: i, folded }); write(vg.fromRows(wvNow(), next)); };
  const change = (i: number, c: Partial<vg.VRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...c } : r)), idx, ui.folded);
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Paneele — Premium</legend>
      {rows.length ? rows.map((r, i) => {
        const open = i === openIdx;
        return (
          <div key={i} data-testid="vg-row" data-open={open} data-color={r.color} className={cn("grid gap-3 rounded-lg border-2 bg-card p-3", open ? "border-primary" : "border-input")}>
            <div className="flex flex-wrap items-center gap-2">
              {/* as today: a tap marks the row and turns the tiles — open ↔ folded */}
              <button type="button" onClick={() => remember("wvRowOpen", { idx: i, folded: !ui.folded })} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-foreground">
                {vg.colorImage(r.color) ? <img src={vg.colorImage(r.color)} alt="" className="size-10 shrink-0 rounded object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <span className="size-10 shrink-0" />}
                <span className="grid min-w-0"><b data-part="title">{vg.colorLabel(r.color)}</b><small data-part="note" className="text-muted-foreground">{open ? "Dekor wählen" : "Tippen zum Ändern"}</small></span>
              </button>
              <select aria-label={`Breite Zeile ${i + 1}`} value={r.size} onChange={(e) => change(i, { size: Number(e.target.value) as 997 | 1497 })} className="min-h-12 cursor-pointer rounded-lg border-2 border-input bg-card px-2 text-foreground">
                {vg.SIZES.map((z) => <option key={z} value={z}>{z} mm</option>)}
              </select>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label={`Zeile ${i + 1}: weniger`} onClick={() => change(i, { qty: Math.max(1, r.qty - 1) })}><Minus aria-hidden /></Button>
                <output data-part="qty" className="w-8 text-center font-semibold">{r.qty}</output>
                <Button variant="outline" size="icon" aria-label={`Zeile ${i + 1}: mehr`} onClick={() => change(i, { qty: r.qty + 1 })}><Plus aria-hidden /></Button>
              </span>
              <Button variant="ghost" size="icon" aria-label={`Zeile ${i + 1} entfernen`} onClick={() => set(rows.filter((_, j) => j !== i), idx, ui.folded)}><X aria-hidden /></Button>
            </div>
            {open ? (
              <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="vg-tiles">
                <legend className="mb-1.5 p-0 font-semibold">Dekor für diese Zeile</legend>
                <div className="flex flex-wrap gap-2">
                  {VG_COLORS.map((c) => (
                    <button key={c.value} type="button" data-value={c.value} aria-pressed={r.color === c.value} onClick={() => change(i, { color: c.value })} className={cn("grid w-28 cursor-pointer justify-items-center gap-1 rounded-lg border-2 bg-card p-2 text-center text-[0.9rem] text-foreground [overflow-wrap:anywhere]", r.color === c.value ? "border-primary bg-accent-weak font-bold" : "border-input")}>
                      <img src={c.img} alt="" className="size-14 rounded object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />{c.caption}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </div>
        );
      }) : <p className="m-0 text-muted-foreground">Noch keine Paneele. Mit „+ Zeile hinzufügen“ beginnen.</p>}
      <div><Button variant="outline" onClick={() => { const next = vg.addRow(rows, wvNow()); set(next, next.length - 1, false); }}><Plus aria-hidden />Zeile hinzufügen (Farbe oder Sonderdruck)</Button></div>
      {rows.some((r) => r.color === vg.SONDER) ? (
        <div className="grid gap-1.5" data-testid="vg-sonder">
          <label htmlFor="vg-sonder-nr" className="font-semibold">Konfigurations-Nr. von Vigour</label>
          <div className="max-w-xs"><Input id="vg-sonder-nr" placeholder="z. B. VI-00002468" autoComplete="off" value={String(wv.wvSonderConfigNr ?? "")} onChange={(e) => write({ wvSonderConfigNr: e.target.value })} /></div>
          <p className="m-0 text-[0.9rem] text-muted-foreground">Noch keine Nummer? Feld frei lassen — der Angebotscheck erinnert, bis sie eingetragen ist. Sonderdruck im <a href="https://vigour.wallconfigurator.com/" target="_blank" rel="noopener noreferrer">Vigour Wall Configurator</a> gestalten.</p>
        </div>
      ) : null}
    </fieldset>
  );
}

/** VIGOUR: sealing, adhesive, silicone, and the end and connecting profiles. */
function VigourAccessories() {
  const wv = useWv();
  const row = (k: vg.SwitchKey) => {
    const sw = vg.SWITCHES[k];
    return (
      <div key={k} data-testid={`vg-acc-${k}`} className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={wv[sw.flag] === true} onChange={(e) => write(vg.toggleSwitch(wvNow(), k, e.target.checked))} />
          <span className="grid"><span>{sw.caption}</span><small className="text-muted-foreground">{sw.small}</small></span>
        </label>
        {sw.qty ? <Stepper label={`Menge ${sw.caption}`} value={String(wv[sw.qty] ?? "0")} onChange={(t) => write(vg.setQty(k, Number(t)))} /> : null}
      </div>
    );
  };
  return (
    <>
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0"><legend className="mb-1.5 p-0 font-semibold">Zubehör</legend>{(["sealing", "adhesive", "silicone"] as const).map(row)}</fieldset>
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 font-semibold">Abschluss- und Verbindungsprofile</legend>
        {(["endProfile", "connecting"] as const).map(row)}
        <div className={cn(ROW, "flex-wrap justify-between")}>
          <span className="grid"><strong>Außenecken</strong><small className="text-muted-foreground">Jede Außenecke spart ein V3V</small></span>
          <Stepper label="Außenecken" value={String(wv.wvCornersCount ?? "0")} onChange={(t) => write({ wvCornersCount: String(Math.max(0, Math.round(Number(t)) || 0)) })} />
        </div>
      </fieldset>
    </>
  );
}

/** VIGOUR: the calculator needs the purchase prices of the colour's two articles (cheapest mix). */
function Vigour() {
  const wv = useWv();
  const a = vg.articles(wv);
  const prices = useQuery({ queryKey: ["vigor-prices", a[997], a[1497]], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("vigorPrices", { query: `ids=${encodeURIComponent(`${a[997]},${a[1497]}`)}`, signal }).then((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v) || 0]))) });
  return <><Calculator kit={vigourKit(prices.data)} /><VigourRows /><VigourAccessories /></>;
}

/** winwall's accessories — also used for Keramico (there without the cutting service). */
function Accessories({ label, area, cut }: { label: string; area: number; cut: boolean }) {
  const wv = useWv();
  const seal = sealing(wv, area);
  const manual = Math.round(Number(wv.wvWwSealingQty) || 0) > 0;
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold" data-testid="wv-acc-label">{label}</legend>
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
      {cut ? <div data-testid="wv-acc-cut" className={cn(ROW, "has-[:checked]:border-primary")}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={!!wv.wvWwCut} onChange={(e) => write({ wvWwCut: e.target.checked ? "on" : undefined })} />
          <span className="grid"><span data-part="caption">Zuschnitt durch winwall</span><small data-part="small" className="text-muted-foreground">10 € je Platte, gerade Schnitte · aus: wir schneiden selbst</small></span>
        </label>
      </div> : null}
    </fieldset>
  );
}

/** Badolux: rows of decor (or Sonder-Dekor with its motif name) and number of Keramico panels. */
function KeramicoRows() {
  const wv = useWv();
  const rows = bx.rowsOf(wv);
  // which row is open: kept while the offer is open; an opened offer starts with all rows folded
  const ui = (useOfferStore((s) => s.scratch.wvRowOpen) as { idx: number; folded: boolean } | undefined) ?? { idx: rows.length ? 0 : -1, folded: true };
  const openIdx = ui.folded ? -1 : ui.idx;
  const set = (next: bx.KRow[], idx: number, folded: boolean) => { remember("wvRowOpen", { idx, folded }); write(bx.fromRows(wvNow(), next)); };
  const change = (i: number, c: Partial<bx.KRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...c } : r)), ui.idx, ui.folded);
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Paneele — Standard (Keramico)</legend>
      {rows.length ? rows.map((r, i) => {
        const open = i === openIdx;
        return (
          <div key={i} data-testid="bx-row" data-open={open} className={cn("grid gap-3 rounded-lg border-2 bg-card p-3", open ? "border-primary" : "border-input")}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => remember("wvRowOpen", { idx: i, folded: i === ui.idx ? !ui.folded : false })} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-foreground">
                <img src={bx.image(r.pid)} alt="" className="size-10 shrink-0 rounded object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <span className="grid min-w-0"><b data-part="title">{bx.rowTitle(r)}</b><small data-part="note" className="text-muted-foreground">{open ? "Dekor wählen" : "Tippen zum Ändern"}</small></span>
              </button>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label={`Zeile ${i + 1}: weniger`} onClick={() => change(i, { qty: Math.max(1, r.qty - 1) })}><Minus aria-hidden /></Button>
                <output data-part="qty" className="w-8 text-center font-semibold">{r.qty}</output>
                <Button variant="outline" size="icon" aria-label={`Zeile ${i + 1}: mehr`} onClick={() => change(i, { qty: r.qty + 1 })}><Plus aria-hidden /></Button>
              </span>
              <Button variant="ghost" size="icon" aria-label={`Zeile ${i + 1} entfernen`} onClick={() => { const next = rows.filter((_, j) => j !== i); set(next, Math.min(ui.idx, next.length - 1), ui.folded); }}><X aria-hidden /></Button>
            </div>
            {open && r.pid === bx.SONDER ? (
              <div className="grid gap-1.5 rounded-lg border-2 border-border p-3" data-testid="bx-sonder">
                <b>Sonder-Dekor bei CleverBad aussuchen</b>
                <p className="m-0 text-[0.95rem] text-muted-foreground">Motiv im Shop ansehen und den Namen hier eintragen. Preis je Paneel: <b>{bx.SONDER_PRICE.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</b> (fest, ohne Rabatt).</p>
                <a href={bx.SHOP_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center">Wandpaneele bei CleverBad öffnen ↗</a>
                <label htmlFor="bx-motif" className="font-semibold">Motiv / Name</label>
                <div className="max-w-xs"><Input id="bx-motif" placeholder="z. B. Octopus Flow" autoComplete="off" value={r.name === bx.SONDER_NAME ? "" : r.name} onChange={(e) => change(i, { name: e.target.value })} /></div>
              </div>
            ) : null}
            {open ? (
              <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="bx-tiles">
                <legend className="mb-1.5 p-0 font-semibold">Dekor für diese Zeile</legend>
                <div className="flex flex-wrap gap-2">
                  {bx.DECORS.map((d) => (
                    <button key={d.value} type="button" data-value={d.value} aria-pressed={r.pid === d.pid} onClick={() => set(rows.map((x, j) => (j === i ? bx.withDecor(x, d.value) : x)), ui.idx, ui.folded)} className={cn("grid w-28 cursor-pointer justify-items-center gap-1 rounded-lg border-2 bg-card p-2 text-center text-[0.9rem] text-foreground [overflow-wrap:anywhere]", r.pid === d.pid ? "border-primary bg-accent-weak font-bold" : "border-input")}>
                      <img src={d.img} alt="" className="size-14 rounded object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />{d.caption}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </div>
        );
      }) : <p className="m-0 text-muted-foreground">Noch keine Paneele. Mit „+ Zeile hinzufügen“ beginnen.</p>}
      <div><Button variant="outline" onClick={() => { const next = bx.addRow(rows); set(next, next.length - 1, false); }}><Plus aria-hidden />Zeile hinzufügen (Farbe oder Sonder-Dekor)</Button></div>
    </fieldset>
  );
}

/** Badolux: its own accessories, folded until one is used or the heading is tapped. */
function BadoluxAccessories() {
  const wv = useWv();
  const tapped = useOfferStore((s) => s.scratch.wvBxOpen) as boolean | undefined;
  const open = tapped ?? bx.anyBx(wv);
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0"><button type="button" aria-expanded={open} onClick={() => remember("wvBxOpen", !open)} className="min-h-12 cursor-pointer border-0 bg-transparent p-0 font-semibold text-foreground">Badolux-Zubehör (Keramico) {open ? "▾" : "▸"}</button></legend>
      {open ? bx.BX_ACCESSORIES.map((a) => (
        <div key={a.id} data-testid={`bx-acc-${a.id}`} className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={!!wv[`wvBx_${a.id}`]} onChange={(e) => write(bx.toggleBx(wvNow(), a.id, e.target.checked))} />
            <span className="grid"><span data-part="caption">{a.caption}</span><small data-part="small" className="text-muted-foreground">{a.small}</small></span>
          </label>
          <Stepper label={`Menge ${a.caption}`} value={String(bx.bxQty(wv, a.id))} placeholder="0" onChange={(t) => write(bx.setBxQty(a.id, Number(t)))} />
        </div>
      )) : null}
    </fieldset>
  );
}

function Badolux() {
  const wv = useWv();
  return <><Calculator kit={BX_KIT} /><KeramicoRows /><Accessories label="Zubehör" area={bx.areaOf(bx.rowsOf(wv))} cut={false} /><BadoluxAccessories /></>;
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
          {line === "ww" ? <><Calculator kit={WW_KIT} /><Rows /><Accessories label="Zubehör winwall" area={areaOf(rowsOf(wv))} cut /></> : line === "premium" ? <Vigour /> : <Badolux />}
          <div className="grid gap-2 rounded-lg border-2 border-border p-3">
            <strong>Skizze und Notiz</strong>
            <LegacyLink dealId={dealId} step="Wandverkleidung">Skizze und Notiz in der bisherigen Ansicht</LegacyLink>
          </div>
        </>
      ) : null}
    </Card>
  );
}
