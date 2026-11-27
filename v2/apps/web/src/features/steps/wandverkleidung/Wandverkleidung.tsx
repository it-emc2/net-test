// Wandverkleidung (Badumbau; ADR 026, phase 4): the switch, the product line, the Ausführung
// and the line winwall (rows of decor, format and number; accessories). The stored fields are
// exactly today's (test/wandverkleidung.test.tsx compares with what today's UI stores and shows
// for the same inputs). Also the wall calculator of the line winwall (calc.ts, Drawing.tsx).
// The lines VIGOUR (vigour.ts) and Badolux (keramico.ts) use the same calculator.
// Sketch and note use the shared sketch pad (shared/ui/sketch-pad.tsx).
import { CornerUpRight, Minus, Plus, Scissors, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { computedFor, setMode, unitsOf } from "../fussboden/rules.js";
import { useWallSettings } from "../fussboden/settings.js";
import { creditOf, proposalOf, restOf, restText, settled, takeRest } from "../fussboden/wand.js";
import * as fw from "../fussboden/wand.js";
import { DecorChips, DecorPalette, PlateCards, RowPlates, StepLegend } from "../../../shared/ui/winwall.js";
import { AccCard, AccGrid } from "../../../shared/ui/acc-card.js";
import { SwatchFace, SwatchGrid, swatchTile } from "../../../shared/ui/swatch.js";
import { ChoiceTiles } from "../../../shared/ui/choice-tiles.js";
import { KIND_TILES } from "./KindSketch.js";
import { WcPlateNote } from "./WcPlateNote.js";
import { toast } from "../../../shared/ui/toaster.js";
import * as sv from "./simple.js";
import * as pv from "./panels.js";
import { Button, Card, CardTitle, Input, Switch, TextAreaField, cn, IMG } from "../../../shared/ui/index.js";
import { Internal } from "../../../shared/ui/internal.js";
import { useOfferStore } from "../../offer/index.js";
import { SketchPad, hasSketch, type Sketch } from "../../../shared/ui/sketch-pad.js";
import { useQuery } from "@tanstack/react-query";
import { call } from "../../../shared/api/index.js";
import { arbeitenChanges, toggleTask, wvChanges } from "../arbeiten/rules.js";
import { LEGEND, NOTE, SITUATIONS, WALLS, cutList, heightWarning, planOf, sameDecorEverywhere, setWallDecor, situationOf, wallDecorOf, wallGroups, wallsOf, widthsIn, type Plan, type WallKey } from "./calc.js";
import { VG_COLORS } from "./colors.js";
import * as bx from "./keramico.js";
import * as vg from "./vigour.js";
import { WW_DECORS, WW_SWATCHES } from "./decors.js";
import { Drawing, TONES } from "./Drawing.js";
import {
  ACCESSORIES, FORMATS, HALF_HEIGHT_KIND, LINES, SHOWER_TASK, accessoryQty, addRow, chooseLine, customCaption, customHint, decorCode, decorOf, fromRows, isBadRow, lineOf, rowNote, rowTitle, rowsOf,
  sealing, setAccessoryQty, toggleAccessory, wallAreaOf, withDecor, type Line, type Row,
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
// As today: the sealing hint ("nach Wandfläche …") is renewed with the rows, the sealing number and
// the line — not when a wall's width, height or situation changes without writing rows (no decor
// yet). Until then it keeps the walls it was last worked out with (legacy, ported as is).
const WALL_FIELDS = ["wvKSituation", "wvKLinks", "wvKBack", "wvKRechts", "wvKHoehe"] as const;
const wallFieldsOf = (wv: Fields): Fields => Object.fromEntries(WALL_FIELDS.map((k) => [k, wv[k]]));
const freezeSealWalls = (wv: Fields) => { if (!useOfferStore.getState().scratch.wvSealWalls) remember("wvSealWalls", wallFieldsOf(wv)); };
const renewSealHint = () => { if (useOfferStore.getState().scratch.wvSealWalls) remember("wvSealWalls", null); };

/** − number + (the number can be typed); on a phone 2.5 rem (45 px) buttons so it fits a card two to a row */
function Stepper({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (text: string) => void }) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return (
    <span className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Button variant="outline" size={null} className="size-10 sm:size-12" aria-label={`${label}: weniger`} onClick={() => onChange(String(Math.max(0, n - 1)))}><Minus aria-hidden /></Button>
      <span className="w-9 sm:w-16"><Input type="number" min={0} step={1} inputMode="numeric" aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="min-h-10 px-0.5! text-center sm:min-h-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /></span>
      <Button variant="outline" size={null} className="size-10 sm:size-12" aria-label={`${label}: mehr`} onClick={() => onChange(String(n + 1))}><Plus aria-hidden /></Button>
    </span>
  );
}

// The accessories' pictures: the ones today's UI shows (src/public/index.html, "Zubehör" of each line).
// None for the cutting service (today's UI shows the decor WS203 there) and the outside corners: an icon.
const SEALING_IMG = "/assets/d110afd16622742ee292b063792121f1.jpg", ADHESIVE_IMG = "/assets/Flächen-Kleber.PNG";
const WW_ACC_IMG: Record<string, string> = { WS80110: "/assets/winwall/acc/WS80110.jpg", WS80111: "/assets/winwall/acc/WS80111.jpg", WS80112: "/assets/winwall/acc/WS80112.jpg", WS80113: "/assets/winwall/acc/WS80113.jpg", R_4260602: ADHESIVE_IMG };
const VG_ACC_IMG: Record<vg.SwitchKey, string> = { sealing: SEALING_IMG, adhesive: ADHESIVE_IMG, silicone: "/assets/silikon_ransauer.jpg", endProfile: "/assets/6dd521ee32b126983e37b93433b29b95.jpg", connecting: "/assets/V3V.jpg" };
const bxAccImg = (id: string) => `/assets/badolux/zubehoer/${id}.webp`;

/** The decor tiles of the open row, with "Anderes Dekor" and its number. */
function Decors({ onPick }: { onPick: (value: string, text?: string, typing?: boolean) => void }) {
  const wv = useWv();
  const picked = String(wv.wvWwDecor ?? "");
  const hint = customHint(wv);
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="wv-decors">
      <legend className="mb-1.5 p-0 font-semibold">Dekor für diese Zeile</legend>
      <SwatchGrid>
        {[...WW_DECORS, { value: "custom", caption: customCaption(wv) }].map((d) => (
          <label key={d.value} className={swatchTile(picked === d.value)}>
            <input type="radio" name="wvWwDecor" className="sr-only" value={d.value} checked={picked === d.value} onChange={() => onPick(d.value, d.value === "custom" ? String(wv.wvWwDecorCustom ?? "") : "")} />
            {d.value === "custom" ? <SwatchFace on={picked === d.value} dashed label="+" /> : <SwatchFace on={picked === d.value} img={`/assets/winwall/${d.value}.jpg`} />}
            <span data-part={d.value === "custom" ? "custom-caption" : undefined}>{d.caption}</span>
          </label>
        ))}
      </SwatchGrid>
      {picked === "custom" ? (
        <div className="grid gap-1.5" data-testid="wv-custom">
          <label htmlFor="wv-decor-number" className="font-semibold">Dekor-Nummer</label>
          <div className="w-40"><Input id="wv-decor-number" placeholder="NW 230 / 23015" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={10} value={String(wv.wvWwDecorCustom ?? "")} onChange={(e) => onPick("custom", e.target.value, true)} /></div>
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
    return r && { wallDecor: r.wallDecor, fields: fromRows(r.rows, planOf(before), next), count: r.rows.length };
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
    if (!r) { freezeSealWalls(before); return write(decor ? { ...fields, wvWallDecor: JSON.stringify(decor) } : fields); }
    renewSealHint();
    remember("wvRowTyped", null);
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
                {caption ? <img src={kit.tiles.find((t) => t.value === wd[key])?.img} alt="" className={cn(IMG.mini, "rounded object-cover")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : null}<span data-part="decor">{caption || "Dekor wählen"}</span>
              </Button>
              <span className="flex items-center gap-2"><span className="w-24"><Input type="number" min={0} max={2000} step={1} inputMode="decimal" placeholder="Breite" aria-label={`Breite ${WALLS[key].name} in cm`} value={width} onChange={(e) => apply({ [WALLS[key].field]: e.target.value })} /></span>cm</span>
            </div>
            {open === key ? (
              <div className="grid gap-2" data-testid="kc-tiles">
                <SwatchGrid>
                  {kit.tiles.map((d) => (
                    <button key={d.value} type="button" data-value={d.value} aria-pressed={wd[key] === d.value} onClick={() => pick(d.value)} className={swatchTile(wd[key] === d.value)}>
                      <SwatchFace on={wd[key] === d.value} img={d.img} />{d.caption}
                    </button>
                  ))}
                </SwatchGrid>
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
  // As today: typing a decor number renews the row's title, not its note and red mark — those
  // keep what the row was before the typing until the next other change (legacy, ported as is).
  const typed = useOfferStore((s) => s.scratch.wvRowTyped) as { idx: number; bad: boolean } | null | undefined;
  const bad = (r: Row, i: number) => (typed && typed.idx === i ? typed.bad : isBadRow(r));
  /** the rows changed: plates, suggestions and the decor shown for the open row follow */
  const set = (next: Row[], idx: number, folded: boolean, typing = false) => {
    remember("wvRowTyped", typing ? (typed && typed.idx === idx ? typed : { idx, bad: !!rows[idx] && isBadRow(rows[idx]) }) : null);
    renewSealHint();
    remember("wvRowOpen", { idx, folded }); write({ ...fromRows(next, planOf(wvNow()), wvNow()), ...(folded ? {} : decorOf(next[idx])) });
  };
  const tap = (i: number) => { const folded = i === ui.idx ? !ui.folded : false; remember("wvRowTyped", null); remember("wvRowOpen", { idx: i, folded }); if (!folded) write(decorOf(rows[i])); };
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Platten — winwall</legend>
      {rows.length ? rows.map((r, i) => {
        const open = i === openIdx;
        return (
          <div key={i} data-testid="wv-row" data-open={open} data-bad={bad(r, i) || undefined} className={cn("grid gap-3 rounded-lg border-2 p-3", bad(r, i) ? "border-destructive bg-destructive/10" : "bg-card", open ? "border-primary" : bad(r, i) ? "" : "border-input")}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => tap(i)} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-foreground">
                {r.code ? <img src={`/assets/winwall/${r.code}.jpg`} alt="" className={cn(IMG.row, "shrink-0 rounded object-cover")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <span className={cn(IMG.row, "shrink-0")} />}
                <span className="grid min-w-0"><b data-part="title">{rowTitle(r)}</b><small data-part="note" className={bad(r, i) ? "font-semibold text-destructive" : "text-muted-foreground"}>{rowNote(bad(r, i), open)}</small></span>
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
            {open ? <Decors onPick={(value, text, typing) => set(rows.map((x, j) => (j === i ? withDecor(x, value, text) : x)), ui.idx, false, typing)} /> : null}
          </div>
        );
      }) : <p className="m-0 text-muted-foreground">Noch keine Platten. Mit „+ Zeile hinzufügen“ beginnen.</p>}
      <div><Button variant="outline" onClick={() => { const next = addRow(rows, wvNow()); set(next, next.length - 1, false); }}><Plus aria-hidden />Zeile hinzufügen (Dekor und Format)</Button></div>
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
    <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Paneele — Premium</legend>
      {rows.length ? rows.map((r, i) => {
        const open = i === openIdx;
        return (
          <div key={i} data-testid="vg-row" data-open={open} data-color={r.color} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border-2 bg-card p-2 sm:p-3", open ? "border-primary" : "border-input")}>
            <div className="flex flex-wrap items-center gap-2">
              {/* as today: a tap marks the row and turns the tiles — open ↔ folded */}
              <button type="button" onClick={() => remember("wvRowOpen", { idx: i, folded: !ui.folded })} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-foreground">
                {vg.colorImage(r.color) ? <img src={vg.colorImage(r.color)} alt="" className={cn(IMG.row, "shrink-0 rounded object-cover")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <span className={cn(IMG.row, "shrink-0")} />}
                <span className="grid min-w-0"><b data-part="title">{vg.colorLabel(r.color)}</b><small data-part="note" className="text-muted-foreground">{open ? "Dekor wählen" : "Tippen zum Ändern"}</small></span>
              </button>
              <Button variant="ghost" size="icon" aria-label={`Zeile ${i + 1} entfernen`} onClick={() => set(rows.filter((_, j) => j !== i), idx, ui.folded)}><X aria-hidden /></Button>
            </div>
            {/* the width as panels to scale (as winwall's plates); picking one keeps the number, as today's list did */}
            <RowPlates formats={vg.FORMATS} picked={String(r.size)} qty={r.qty} img={vg.colorImage(r.color) || undefined} label={`Breite Zeile ${i + 1}`} stepLabel={`Zeile ${i + 1}`}
              onPick={(code) => { if (code !== String(r.size)) change(i, { size: Number(code) as 997 | 1497 }); }} onStep={(d) => change(i, { qty: Math.max(1, r.qty + d) })} />
            {open ? (
              <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="vg-tiles">
                <legend className="mb-1.5 p-0 font-semibold">Dekor für diese Zeile</legend>
                <SwatchGrid>
                  {VG_COLORS.map((c) => (
                    <button key={c.value} type="button" data-value={c.value} aria-pressed={r.color === c.value} onClick={() => change(i, { color: c.value })} className={swatchTile(r.color === c.value)}>
                      <SwatchFace on={r.color === c.value} img={c.img} />{c.caption}
                    </button>
                  ))}
                </SwatchGrid>
              </fieldset>
            ) : null}
          </div>
        );
      }) : <p className="m-0 text-muted-foreground">Noch keine Paneele. Mit „+ Zeile hinzufügen“ beginnen.</p>}
      <div><Button variant="outline" className="h-auto whitespace-normal! py-2 text-left" onClick={() => { const next = vg.addRow(rows, wvNow()); set(next, next.length - 1, false); }}><Plus aria-hidden />Zeile hinzufügen (Farbe oder Sonderdruck)</Button></div>
      {rows.some((r) => r.color === vg.SONDER) ? <VigourSonder testId="vg-sonder" /> : null}
    </fieldset>
  );
}

/** VIGOUR Sonderdruck: the configuration number (one for the offer) — row editor and simple view */
function VigourSonder({ testId }: { testId: string }) {
  const wv = useWv();
  return (
    <div className="grid gap-1.5" data-testid={testId}>
      <label htmlFor="vg-sonder-nr" className="font-semibold">Konfigurations-Nr. von Vigour</label>
      <div className="max-w-xs"><Input id="vg-sonder-nr" placeholder="z. B. VI-00002468" autoComplete="off" value={String(wv.wvSonderConfigNr ?? "")} onChange={(e) => write({ wvSonderConfigNr: e.target.value })} /></div>
      <p className="m-0 text-[0.9rem] text-muted-foreground">Noch keine Nummer? Feld frei lassen — der Angebotscheck erinnert, bis sie eingetragen ist. Sonderdruck im <a href="https://vigour.wallconfigurator.com/" target="_blank" rel="noopener noreferrer">Vigour Wall Configurator</a> gestalten.</p>
    </div>
  );
}

/** VIGOUR: sealing, adhesive, silicone, and the end and connecting profiles. */
function VigourAccessories() {
  const wv = useWv();
  const card = (k: vg.SwitchKey) => {
    const sw = vg.SWITCHES[k], on = wv[sw.flag] === true;
    return (
      <AccCard key={k} testId={`vg-acc-${k}`} on={on} img={VG_ACC_IMG[k]} caption={sw.caption} small={sw.small}
        check={{ checked: on, onChange: (e) => write(vg.toggleSwitch(wvNow(), k, e.target.checked)) }}
        stepper={sw.qty ? <Stepper label={`Menge ${sw.caption}`} value={String(wv[sw.qty] ?? "0")} onChange={(t) => write(vg.setQty(k, Number(t)))} /> : undefined} />
    );
  };
  const corners = Math.round(Number(wv.wvCornersCount) || 0);
  return (
    <>
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0"><legend className="mb-1.5 p-0 font-semibold">Zubehör</legend><AccGrid>{(["sealing", "adhesive", "silicone"] as const).map(card)}</AccGrid></fieldset>
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 font-semibold">Abschluss- und Verbindungsprofile</legend>
        <AccGrid>
          {(["endProfile", "connecting"] as const).map(card)}
          <AccCard testId="vg-acc-corners" on={corners > 0} icon={<CornerUpRight />} caption="Außenecken" small="Jede Außenecke spart ein V3V"
            stepper={<Stepper label="Außenecken" value={String(wv.wvCornersCount ?? "0")} onChange={(t) => write({ wvCornersCount: String(Math.max(0, Math.round(Number(t)) || 0)) })} />} />
        </AccGrid>
      </fieldset>
    </>
  );
}

/** VIGOUR's row editor: the calculator needs the purchase prices of the colour's two articles (cheapest mix). */
function VigourClassic() {
  const wv = useWv();
  const a = vg.articles(wv);
  const prices = useQuery({ queryKey: ["vigor-prices", a[997], a[1497]], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("vigorPrices", { query: `ids=${encodeURIComponent(`${a[997]},${a[1497]}`)}`, signal }).then((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v) || 0]))) });
  return <><Calculator kit={vigourKit(prices.data)} /><VigourRows /></>;
}
function Vigour() {
  return <><PanelLine kit={VG_PANELS} classic={<VigourClassic />} simple={<PanelSimple kit={VG_PANELS} extra={(st) => (st.groups.some((g) => g.key === vg.SONDER) ? <VigourSonder testId="vgs-sonder" /> : null)} />} /><VigourAccessories /></>;
}

/** winwall's accessories — also used for Keramico (there without the cutting service). */
function Accessories({ label, area, cut }: { label: string; area: number; cut: boolean }) {
  const wv = useWv();
  const seal = sealing(wv, area);
  const manual = Math.round(Number(wv.wvWwSealingQty) || 0) > 0;
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold" data-testid="wv-acc-label">{label}</legend>
      <AccGrid>
        {ACCESSORIES.map((a) => (
          <AccCard key={a.id} testId={`wv-acc-${a.id}`} on={!!wv[`wvWw_${a.id}`]} img={WW_ACC_IMG[a.id]} caption={a.caption} small={a.small}
            check={{ checked: !!wv[`wvWw_${a.id}`], onChange: (e) => write(toggleAccessory(wvNow(), a.id, e.target.checked)) }}
            stepper={<Stepper label={`Menge ${a.caption}`} value={String(accessoryQty(wv, a.id))} onChange={(t) => write(setAccessoryQty(wvNow(), a.id, Number(t)))} />} />
        ))}
        <AccCard testId="wv-acc-sealing" on={!!wv.wvWwSealing} img={SEALING_IMG} caption="Abdichtungsset DIN 18534-1"
          small={<>{seal.hint}{manual ? <> <button type="button" className="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-primary-text underline" onClick={(e) => { e.preventDefault(); renewSealHint(); write({ wvWwSealingQty: "" }); }}>Automatisch</button></> : null}</>}
          check={{ checked: !!wv.wvWwSealing, onChange: (e) => write({ wvWwSealing: e.target.checked ? "on" : undefined }) }}
          stepper={<Stepper label="Menge Abdichtungsset (leer = nach Wandfläche)" value={String(wv.wvWwSealingQty ?? "")} placeholder={String(seal.auto)} onChange={(t) => { renewSealHint(); write({ wvWwSealingQty: t }); }} />} />
        {cut ? <AccCard testId="wv-acc-cut" on={!!wv.wvWwCut} icon={<Scissors />} caption="Zuschnitt durch winwall" small={<><Internal>10 € je Platte, </Internal>gerade Schnitte · aus: wir schneiden selbst</>}
          check={{ checked: !!wv.wvWwCut, onChange: (e) => write({ wvWwCut: e.target.checked ? "on" : undefined }) }} /> : null}
      </AccGrid>
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
  const set = (next: bx.KRow[], idx: number, folded: boolean) => { renewSealHint(); remember("wvRowOpen", { idx, folded }); write(bx.fromRows(wvNow(), next)); };
  const change = (i: number, c: Partial<bx.KRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...c } : r)), ui.idx, ui.folded);
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Paneele — Standard (Keramico)</legend>
      {rows.length ? rows.map((r, i) => {
        const open = i === openIdx;
        return (
          <div key={i} data-testid="bx-row" data-open={open} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border-2 bg-card p-2 sm:p-3", open ? "border-primary" : "border-input")}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => remember("wvRowOpen", { idx: i, folded: i === ui.idx ? !ui.folded : false })} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-foreground">
                <img src={bx.image(r.pid)} alt="" className={cn(IMG.row, "shrink-0 rounded object-cover")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <span className="grid min-w-0"><b data-part="title">{bx.rowTitle(r)}</b><small data-part="note" className="text-muted-foreground">{open ? "Dekor wählen" : "Tippen zum Ändern"}</small></span>
              </button>
              <Button variant="ghost" size="icon" aria-label={`Zeile ${i + 1} entfernen`} onClick={() => { const next = rows.filter((_, j) => j !== i); set(next, Math.min(ui.idx, next.length - 1), ui.folded); }}><X aria-hidden /></Button>
            </div>
            {/* one format: the panel to scale with − / + (as winwall's plates) */}
            <RowPlates formats={bx.FORMATS} picked={bx.FORMATS[0]!.code} qty={r.qty} img={bx.image(r.pid)} label={`Paneele Zeile ${i + 1}`} stepLabel={`Zeile ${i + 1}`}
              onPick={() => {}} onStep={(d) => change(i, { qty: Math.max(1, r.qty + d) })} />
            {open && r.pid === bx.SONDER ? <KeramicoSonder testId="bx-sonder" name={r.name} onName={(name) => change(i, { name })} /> : null}
            {open ? (
              <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="bx-tiles">
                <legend className="mb-1.5 p-0 font-semibold">Dekor für diese Zeile</legend>
                <SwatchGrid>
                  {bx.DECORS.map((d) => (
                    <button key={d.value} type="button" data-value={d.value} aria-pressed={r.pid === d.pid} onClick={() => set(rows.map((x, j) => (j === i ? bx.withDecor(x, d.value) : x)), ui.idx, ui.folded)} className={swatchTile(r.pid === d.pid)}>
                      <SwatchFace on={r.pid === d.pid} img={d.img} />{d.caption}
                    </button>
                  ))}
                </SwatchGrid>
              </fieldset>
            ) : null}
          </div>
        );
      }) : <p className="m-0 text-muted-foreground">Noch keine Paneele. Mit „+ Zeile hinzufügen“ beginnen.</p>}
      <div><Button variant="outline" className="h-auto whitespace-normal! py-2 text-left" onClick={() => { const next = bx.addRow(rows); set(next, next.length - 1, false); }}><Plus aria-hidden />Zeile hinzufügen (Farbe oder Sonder-Dekor)</Button></div>
    </fieldset>
  );
}

/** Badolux Sonder-Dekor: the shop and the motif's name (of one row / the open chip) */
function KeramicoSonder({ testId, name, onName }: { testId: string; name: string; onName: (name: string) => void }) {
  return (
    <div className="grid gap-1.5 rounded-lg border-2 border-border p-3" data-testid={testId}>
      <b>Sonder-Dekor bei CleverBad aussuchen</b>
      <p className="m-0 text-[0.95rem] text-muted-foreground">Motiv im Shop ansehen und den Namen hier eintragen.<Internal> Preis je Paneel: <b>{bx.SONDER_PRICE.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</b> (fest, ohne Rabatt).</Internal></p>
      <a href={bx.SHOP_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center">Wandpaneele bei CleverBad öffnen ↗</a>
      <label htmlFor="bx-motif" className="font-semibold">Motiv / Name</label>
      <div className="max-w-xs"><Input id="bx-motif" placeholder="z. B. Octopus Flow" autoComplete="off" value={name === bx.SONDER_NAME ? "" : name} onChange={(e) => onName(e.target.value)} /></div>
    </div>
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
      {open ? (
        <AccGrid>
          {bx.BX_ACCESSORIES.map((a) => (
            <AccCard key={a.id} testId={`bx-acc-${a.id}`} on={!!wv[`wvBx_${a.id}`]} img={bxAccImg(a.id)} caption={a.caption} small={a.small}
              check={{ checked: !!wv[`wvBx_${a.id}`], onChange: (e) => write(bx.toggleBx(wvNow(), a.id, e.target.checked)) }}
              stepper={<Stepper label={`Menge ${a.caption}`} value={String(bx.bxQty(wv, a.id))} placeholder="0" onChange={(t) => write(bx.setBxQty(a.id, Number(t)))} />} />
          ))}
        </AccGrid>
      ) : null}
    </fieldset>
  );
}

function Badolux() {
  const wv = useWv();
  return (
    <>
      <PanelLine kit={BX_PANELS} classic={<><Calculator kit={BX_KIT} /><KeramicoRows /></>}
        simple={<PanelSimple kit={BX_PANELS} extra={(st, g, commit) => (bxSplit(g.key).pid === bx.SONDER ? <KeramicoSonder testId="bxs-sonder" name={bxSplit(g.key).name} onName={(name) => commit(pv.rename(st, `${bx.SONDER}|${name}`))} /> : null)} />} />
      <Accessories label="Zubehör" area={bx.areaOf(bx.rowsOf(wv))} cut={false} /><BadoluxAccessories />
    </>
  );
}

// ---- the simple view of the lines VIGOUR and Badolux (panels.ts): winwall's pieces over the line's rows ----
interface PanelKit {
  /** names the test ids and what the view remembers ("vgs", "bxs" — as winwall's "wvs") */
  id: "vgs" | "bxs";
  /** the line's word for a colour, its plural, the chip that adds one, the way back from the row editor */
  word: string; plural: string; addText: string; toSimple: string;
  formats: readonly { code: string; size: string; widthCm: number; heightCm: number }[];
  /** the stored rows as the view reads them; the offer's colour (leading chip); the colour of a first, empty chip */
  rows: (wv: Fields) => pv.PRow[]; first: (wv: Fields) => string | null; fallback: (wv: Fields) => string;
  palette: readonly string[];
  /** a chip's text, a tile's caption, the picture */
  name: (key: string) => string; tileName: (key: string) => string; img: (key: string) => string;
  /** whether a chip's colour is that tile */
  same: (chip: string, tile: string) => boolean;
  /** the view's rows → the line's fields, exactly as its row editor writes them */
  write: (rows: pv.PRow[]) => void;
  /** the hint when the stored rows can only be edited as rows */
  rowsOnly: Record<"dup" | "order", string>;
}
const VG_PANELS: PanelKit = {
  id: "vgs", word: "Farbe", plural: "Farben", addText: "+ weitere Farbe", toSimple: "Zur neuen Ansicht wechseln (Paneele + Farbe)",
  formats: vg.FORMATS, rows: (wv) => vg.rowsOf(wv).map((r) => ({ key: r.color, size: String(r.size), qty: r.qty })),
  first: (wv) => String(wv.wvColor ?? "") || null, fallback: (wv) => String(wv.wvColor || "Marmor weiß"),
  palette: VG_COLORS.map((c) => c.value), name: vg.colorLabel, tileName: (k) => VG_COLORS.find((c) => c.value === k)?.caption ?? vg.colorLabel(k), img: vg.colorImage,
  same: (a, b) => a === b,
  write: (rows) => write(vg.fromRows(wvNow(), rows.map((r) => ({ size: Number(r.size) as 997 | 1497, qty: r.qty, color: r.key })))),
  rowsOnly: {
    dup: "Zwei Zeilen haben dieselbe Farbe und Breite. Diese Paneele lassen sich nur hier in Zeilen bearbeiten – nach dem Zusammenlegen geht die neue Ansicht wieder.",
    order: "Die Farben stehen je Breite in einer Reihenfolge, die nur die Zeilen abbilden (erste Zeile = Hauptpaneel). Bitte hier in Zeilen bearbeiten.",
  },
};
const bxSplit = (key: string) => ({ pid: key.split("|", 1)[0]!, name: key.split("|").slice(1).join("|") });
const BX_PANELS: PanelKit = {
  id: "bxs", word: "Dekor", plural: "Dekore", addText: "+ weiteres Dekor", toSimple: "Zur neuen Ansicht wechseln (Paneele + Dekor)",
  formats: bx.FORMATS, rows: (wv) => bx.rowsOf(wv).map((r) => ({ key: `${r.pid}|${r.name}`, size: bx.FORMATS[0]!.code, qty: r.qty })),
  first: () => null, fallback: () => bx.DECORS[0]!.value,
  palette: bx.DECORS.map((d) => d.value), name: (k) => bx.rowTitle({ ...bxSplit(k), qty: 0 }), tileName: (k) => bx.DECORS.find((d) => d.value === k)?.caption ?? bx.rowTitle({ ...bxSplit(k), qty: 0 }), img: (k) => bx.image(bxSplit(k).pid),
  same: (a, b) => bxSplit(a).pid === bxSplit(b).pid, // the Sonder-Dekor tile is every motif
  write: (rows) => { renewSealHint(); write(bx.fromRows(wvNow(), rows.map((r) => ({ ...bxSplit(r.key), qty: r.qty })))); },
  rowsOnly: {
    dup: "Zwei Zeilen haben dasselbe Dekor. Diese Paneele lassen sich nur hier in Zeilen bearbeiten – nach dem Zusammenlegen geht die neue Ansicht wieder.",
    order: "Die Dekore stehen in einer Reihenfolge, die nur die Zeilen abbilden. Bitte hier in Zeilen bearbeiten.",
  },
};
const sizesOf = (kit: PanelKit) => kit.formats.map((f) => f.code);

/** the simple view or the row editor ("Alter Konfigurator"): the choice is remembered while the offer is
 *  open, not stored; rows the view cannot express open the row editor with a hint */
function PanelLine({ kit, classic, simple }: { kit: PanelKit; classic: ReactNode; simple: ReactNode }) {
  const wv = useWv();
  const why = pv.rowsOnly(kit.rows(wv), sizesOf(kit), kit.first(wv));
  const chosen = !!useOfferStore((s) => s.scratch[`${kit.id}Classic`]);
  // forced once, it stays: the editor does not vanish while the rows are being put right
  useEffect(() => { if (why && !chosen) remember(`${kit.id}Classic`, true); }, [why, chosen, kit.id]);
  if (!why && !chosen) return <>{simple}</>;
  return (
    <>
      {why ? <p role="status" data-testid={`${kit.id}-rows-only`} className="m-0 rounded-lg border-2 border-primary p-3">{kit.rowsOnly[why]}</p>
        : <div><Button variant="outline" className="h-auto w-full whitespace-normal! border-dashed py-2 text-primary" onClick={() => { remember(`${kit.id}View`, null); remember(`${kit.id}Classic`, false); }}>{kit.toSimple}</Button></div>}
      {classic}
    </>
  );
}

/** VIGOUR / Badolux simple view: colour chips, the panels to scale with Menge, the total, the palette — winwall's look */
function PanelSimple({ kit, extra }: { kit: PanelKit; extra?: (st: pv.PView, g: pv.PGroup, commit: (next: pv.PView) => void) => ReactNode }) {
  const wv = useWv();
  const sizes = sizesOf(kit), VIEW = `${kit.id}View`;
  const kept = useOfferStore((s) => s.scratch[VIEW]) as pv.PView | null | undefined;
  const loaded = useRef(false);
  const st = loaded.current && kept?.groups.length ? kept : pv.load(kit.rows(wv), sizes, kit.fallback(wv), kit.first(wv), kept);
  // the step is opened: the chips are read from the rows again, a colour without panels stays (as winwall)
  useEffect(() => {
    loaded.current = true;
    const now = wvNow();
    remember(VIEW, pv.load(kit.rows(now), sizes, kit.fallback(now), kit.first(now), useOfferStore.getState().scratch[VIEW] as pv.PView | undefined));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const g = st.groups[st.active]!;
  /** the chips changed: the rows follow (and with them price, accessories, work time) — only when they did change */
  const commit = (next: pv.PView) => {
    remember(VIEW, next);
    const now = wvNow(), before = kit.rows(now), rows = pv.save(next.groups, before, sizes);
    if (pv.unchanged(rows, before, sizes, kit.first(now))) return;
    remember("wvRowOpen", { idx: -1, folded: true });
    kit.write(rows);
  };
  const areas = Object.fromEntries(kit.formats.map((f) => [f.code, (f.widthCm * f.heightCm) / 1e4]));
  const tiles = [...kit.palette, ...(kit.palette.some((k) => kit.same(g.key, k)) ? [] : [g.key])].map((k) => {
    const img = kit.img(k);
    return { code: k, name: kit.tileName(k), small: "", checked: kit.same(g.key, k), swatch: false, label: img ? "" : kit.tileName(k), img: img || undefined };
  });
  return (
    <div className="grid gap-4" data-testid={kit.id}>
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <StepLegend n={1}>Paneele – Menge je Größe</StepLegend>
        <DecorChips chips={st.groups.map((x, i) => ({ name: kit.name(x.key), text: `${kit.name(x.key)} · ${pv.count(x)} Stk`, pressed: i === st.active, removable: st.groups.length > 1, img: kit.img(x.key) || undefined }))}
          label={kit.plural} noun={kit.word} addText={kit.addText} testId={`${kit.id}-tab`}
          onPick={(i) => remember(VIEW, { ...st, active: i })} onRemove={(i) => commit(pv.removeGroup(st, i))} onAdd={() => remember(VIEW, pv.addGroup(st, kit.palette, sizes))} />
        <PlateCards plates={kit.formats.map((f) => ({ code: f.code, size: f.size, qty: g.qty[f.code] || 0, img: kit.img(g.key) ? g.key : "", src: kit.img(g.key) || undefined, note: "", widthCm: f.widthCm, heightCm: f.heightCm }))}
          onStep={(code, d) => commit(pv.step(st, code, d))} testId={`${kit.id}-plate`} notePart="meta" />
        <p className="m-0 font-semibold" data-testid={`${kit.id}-total`}>{pv.totalOf(st, areas, kit.plural)}</p>
      </fieldset>
      <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-0 p-0" data-testid={`${kit.id}-colors`}>
        <StepLegend n={2}>{kit.word} – gilt für die Paneele oben</StepLegend>
        <DecorPalette tiles={tiles} label={kit.word} onPick={(key) => { const r = pv.pick(st, key, kit.same); if (r.moved) commit(r.next); else remember(VIEW, r.next); }} />
        {extra?.(st, g, commit)}
        <div><Button variant="ghost" className="h-auto whitespace-normal! text-left text-primary" onClick={() => remember(`${kit.id}Classic`, true)}>Alter Konfigurator (Wandplan, Zeilen)</Button></div>
      </fieldset>
    </div>
  );
}

/** "Skizze und Notiz": folded unless the offer has a sketch or a note. The pad hands back the
 *  drawing as operations and as a picture; both are stored twice, as today (`sketch`, `wvSketch…`). */
function SketchAndNote() {
  const wv = useWv();
  const stored = (wv.sketch && typeof wv.sketch === "object" ? wv.sketch : { json: typeof wv.sketch === "string" ? wv.sketch : String(wv.wvSketchJson ?? "") }) as Partial<Sketch>;
  const remembered = useOfferStore((s) => s.scratch.wvSketchOpen) as boolean | undefined;
  const open = remembered ?? (hasSketch(stored) || String(wv.wvNote ?? "").trim() !== "");
  const store = (next: Sketch) => write({ sketch: { json: next.json, dataUrl: next.dataUrl }, wvSketchJson: next.json, wvSketchDataUrl: next.dataUrl });
  return (
    <details className="rounded-lg border-2 border-border p-3" data-testid="wv-sketch" open={open}
      onToggle={(e) => { const to = e.currentTarget.open; if (to !== open) remember("wvSketchOpen", to); if (to && !String(wvNow().wvSketchJson ?? "")) store({ json: JSON.stringify({ version: 1, ops: [] }), dataUrl: "" }); /* as today: an opened pad stores its empty drawing */ }}>
      <summary className="min-h-8 cursor-pointer font-semibold">Skizze und Notiz</summary>
      {open ? (
        <div className="grid gap-4 pt-3">
          <SketchPad value={stored} onChange={store} />
          <TextAreaField id="wv-note" label="Notizen / Beschreibung zur Wandverkleidung" placeholder="z. B. Besonderheiten, Kundenwünsche, Hinweise zur Ausführung …" value={String(wv.wvNote ?? "")} onChange={(v) => write({ wvNote: v })} />
        </div>
      ) : null}
    </details>
  );
}

/** "Reste verwenden": the wall's plates deliver more than the wall needs — the rest can cover the
 *  floor (Fußboden, mode "Wandverkleidung als Fußboden"). Shown only while there is a rest. */
function RestForFloor() {
  const wv = useWv();
  const navigate = useNavigate();
  const settings = useWallSettings();
  const [ask, setAsk] = useState(false); // the floor is a floor covering at the moment: changing it needs a yes
  const rest = restOf(wv, settings.rest);
  if (!rest) return null;
  const take = (sure: boolean) => {
    const o = offerNow(), dw = (o.duschwanne ?? {}) as Fields;
    if (dw.addFlooring === true && !sure) { setAsk(true); return; }
    const mode = setMode(dw, true, "wall"), next = { ...dw, ...mode };
    const floor = settled(next, takeRest(next, rest), rest), after = { ...next, ...floor };
    useOfferStore.getState().patchAll(arbeitenChanges(o, { ...mode, computed: computedFor(next, unitsOf(dw)), ...floor }));
    if (after.wallCladdingSupplier === "ww") useOfferStore.getState().remember("wcWwLast", proposalOf(after, creditOf(after, rest))); // the plates now follow the proposal
    void navigate("../Fussboden", { relative: "path" });
  };
  return (
    <div className="grid gap-2 rounded-lg border-2 border-border p-3" data-testid="wv-rest">
      <strong>Reste verwenden</strong>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="grid min-w-0 flex-1"><span>Aus dieser Wand bleibt Material übrig</span><small data-part="text" className="text-muted-foreground">{restText(rest)}</small></span>
        <Button variant="outline" onClick={() => take(false)}>Als Fußboden verwenden</Button>
      </div>
      {ask ? (
        <div className="grid gap-2 rounded-lg border-2 border-primary p-3" role="alertdialog" aria-label="Fußboden umstellen?">
          <strong>Fußboden umstellen?</strong>
          <p className="m-0">Der Fußboden ist als Bodenbelag gewählt. Auf Wandverkleidung mit Resten umstellen?</p>
          <div className="flex flex-wrap gap-2"><Button onClick={() => take(true)}>Umstellen</Button><Button variant="outline" onClick={() => setAsk(false)}>Abbrechen</Button></div>
        </div>
      ) : null}
    </div>
  );
}

// ---- the winwall simple view (simple.ts) and what it does to the floor (fussboden/wand.ts) ----
type Sess = fw.WallSession;
/** what today's UI remembers about the floor while the offer is open: `wcSession` (+ `wcWwLast`, the Fußboden step's) */
const sessNow = (): Sess => { const sc = useOfferStore.getState().scratch; return { ...fw.SESSION, ...((sc.wcSession as Partial<Sess> | undefined) ?? {}), last: (sc.wcWwLast as fw.Qty | null | undefined) ?? null }; };
const keepSess = (st: Sess) => { remember("wcSession", { autoArea: st.autoArea, optedOut: st.optedOut, askedSwitch: st.askedSwitch }); remember("wcWwLast", st.last); };
type Step = { fields: Fields; session: Sess };
type WallAsk = fw.Ask & { yes: Step | null };
/** the floor after a change of the wall (today's wcWallChanged / wcOnWallDecor): its fields, the session, toasts and a question */
function floorAfter(dw0: Fields, rest: ReturnType<typeof restOf>, how: { pref: string | null; quiet?: boolean } | { old: string; next: string }): { fields: Fields; session: Sess; toasts: string[]; ask: WallAsk | null } {
  let s = sessNow(), dw = dw0, fields: Fields = {};
  const toasts: string[] = [];
  const take = (st: Step) => { fields = { ...fields, ...st.fields }; dw = { ...dw, ...st.fields }; s = st.session; };
  if ("old" in how) {
    const r = fw.wallDecorChanged(dw, rest, how.old, how.next, s);
    if (!r) return { fields, session: s, toasts, ask: null };
    take(r.pre);
    if (r.toast) toasts.push(r.toast);
    return { fields, session: s, toasts, ask: r.ask ? { ...r.ask, yes: r.yes } : null };
  }
  take(fw.wallChanged(dw, rest, s));
  const gone = how.quiet ? null : fw.restGone(dw0, dw, rest);
  if (gone) toasts.push(gone);
  if (how.pref) { const a = fw.autoAdd(dw, rest, how.pref, s); if (a) { take(a); toasts.push(a.toast); } }
  return { fields, session: s, toasts, ask: null };
}

/** The simple view: decor chips, the four plates with Menge, the total, the cladding height, the palette and "Anderes Dekor". */
function SimpleView({ onAsk }: { onAsk: (a: WallAsk) => void }) {
  const wv = useWv();
  const settings = useWallSettings();
  const rows = rowsOf(wv);
  const kept = useOfferStore((s) => s.scratch.wvSimple) as sv.Simple | undefined;
  const st = kept?.groups.length ? kept : sv.load(rows, kept);
  // the step is opened: the groups are read from the rows again (today's sync), a decor without plates stays
  useEffect(() => { remember("wvSimple", sv.load(rowsOf(wvNow()), useOfferStore.getState().scratch.wvSimple as sv.Simple | undefined)); }, []);
  const other = String(useOfferStore((s) => s.scratch.wvsOther) ?? "");
  const g = st.groups[st.active]!;
  const focusHeight = useRef<string | null>(null);
  const rest = restOf(wv, settings.rest);
  const height = sv.heightHint(wv.wvWwHeight, rest?.supplier === "ww" && Number(wv.wvWwHeight) > 0 ? rest.byDecor : undefined);
  const hint = sv.typed(other).hint;
  /** the groups changed: the rows (and with them plates, suggestions, price) follow, and the floor (`how`) — one change of the offer */
  const commit = (next: sv.Simple, how?: Parameters<typeof floorAfter>[2]) => {
    remember("wvSimple", next);
    const o = offerNow(), before = (o.wandverkleidung ?? {}) as Fields;
    const list = sv.save(next.groups, rowsOf(before));
    remember("wvRowOpen", { idx: list.length ? 0 : -1, folded: true });
    remember("wvRowTyped", null);
    renewSealHint();
    const wvf = fromRows(list, planOf(before), before);
    if (!how) return write(wvf);
    const o2 = { ...o, wandverkleidung: { ...before, ...wvf } };
    const f = floorAfter((o.duschwanne ?? {}) as Fields, restOf(o2.wandverkleidung, settings.rest), how);
    useOfferStore.getState().patchAll({ ...wvChanges(o, wvf), ...arbeitenChanges(o2, f.fields) });
    keepSess(f.session);
    f.toasts.forEach((t) => toast.info(t));
    if (f.ask) onAsk(f.ask);
  };
  /** the cladding height left (today's "change"): the floor follows */
  const heightDone = () => {
    if (focusHeight.current === String(wvNow().wvWwHeight ?? "")) return;
    focusHeight.current = String(wvNow().wvWwHeight ?? "");
    const o = offerNow(), f = floorAfter((o.duschwanne ?? {}) as Fields, restOf(wvNow(), settings.rest), { pref: g.code });
    useOfferStore.getState().patchAll(arbeitenChanges(o, f.fields));
    keepSess(f.session);
    f.toasts.forEach((t) => toast.info(t));
  };
  const pickDecor = (code: string) => {
    remember("wvsOther", "");
    const r = sv.pick(st, code);
    if (!r.moved) return remember("wvSimple", r.next);
    commit(r.next, { old: g.code, next: code });
  };
  const type = (text: string) => {
    remember("wvsOther", text);
    const t = sv.typed(text);
    if (t.code) commit(sv.typedInto(st, t.code, t.fmt), { old: g.code, next: t.code });
  };
  const bad = sv.badOf(rows);
  return (
    <div className="grid gap-4" data-testid="wvs">
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <StepLegend n={1}>Platten – Menge je Größe</StepLegend>
        <DecorChips chips={sv.tabsOf(st).map((t) => ({ name: sv.nameOf(t.code), text: t.text, pressed: t.pressed, removable: t.removable, img: t.swatch ? `/assets/winwall/${t.code}.jpg` : undefined }))}
          label="Dekore" noun="Dekor" addText="+ weiteres Dekor" testId="wvs-tab"
          onPick={(i) => { remember("wvsOther", ""); remember("wvSimple", { ...st, active: i }); }} onRemove={(i) => commit(sv.removeGroup(st, i), { pref: null })} onAdd={() => remember("wvSimple", sv.addGroup(st))} />
        <PlateCards plates={sv.PLATES.map(([f, w, h]) => ({ code: f, size: `${w} × ${h} cm`, qty: g.qty[f] || 0, img: WW_SWATCHES.has(g.code) ? g.code : "", note: f === "17" ? "Großplatte" : "", ...sv.plateCm(f) }))} onStep={(f, d) => commit(sv.step(st, f as sv.Fmt, d), { pref: g.code })} testId="wvs-plate" notePart="meta" />
        <p className="m-0 font-semibold" data-testid="wvs-total">{sv.totalOf(st)}</p>
        {bad ? (
          <div role="alert" data-testid="wvs-bad" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-3 font-semibold text-destructive">
            <span data-part="text">{bad}</span>
            <Button variant="outline" onClick={() => toClassic()}>Im alten Konfigurator korrigieren</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-input bg-card p-3">
          <label htmlFor="wvs-height" className="grid min-w-0 flex-1 cursor-pointer"><strong>Höhe der Verkleidung</strong><small data-testid="wvs-height-hint" data-ok={height.ok} className={height.ok ? "text-success" : "text-muted-foreground"}>{height.text}</small></label>
          <span className="flex items-center gap-2"><span className="w-28"><Input id="wvs-height" type="number" inputMode="numeric" min={0} max={250} step={1} placeholder="z. B. 230" value={String(wv.wvWwHeight ?? "")}
            onFocus={() => { focusHeight.current = String(wvNow().wvWwHeight ?? ""); }} onChange={(e) => write({ wvWwHeight: e.target.value })} onBlur={heightDone} /></span>cm</span>
        </div>
      </fieldset>
      <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-0 p-0" data-testid="wvs-colors">
        <StepLegend n={2}>Dekor – gilt für die Platten oben</StepLegend>
        <DecorPalette tiles={sv.paletteTiles(g.code)} label="Dekor" onPick={pickDecor} />
        <div className="grid gap-1.5" data-testid="wvs-other">
          <label htmlFor="wvs-other-input" className="font-semibold">Anderes Dekor</label>
          <div className="w-48"><Input id="wvs-other-input" placeholder="NW 230 / 23015" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={10} value={other} onChange={(e) => type(e.target.value)} /></div>
          <small data-part="hint" data-kind={hint.kind} className={cn(hint.kind === "ok" && "font-semibold text-success", hint.kind === "warn" && "font-semibold text-destructive", !hint.kind && "text-muted-foreground")}>{hint.text}</small>
        </div>
        <div><Button variant="ghost" className="h-auto whitespace-normal! text-left text-primary" onClick={() => toClassic()}>Alter Konfigurator (Wandplan, Zeilen)</Button></div>
      </fieldset>
    </div>
  );
}
/** the classic editor (wall plan, rows) — same rows underneath */
const toClassic = () => write({ wvUi: "" });
/** back to the simple view: the groups are read from the rows anew */
// (as today the open chip's number stays: with two decors before, the second one is open again)
const toSimple = () => { const prev = useOfferStore.getState().scratch.wvSimple as sv.Simple | undefined; remember("wvSimple", { groups: [], active: prev?.active ?? 0 }); remember("wvsOther", ""); write({ wvUi: "simple" }); };

/** a question the wall asks about the floor (today's appConfirm), in the page */
function WallQuestion({ ask, onClose }: { ask: WallAsk; onClose: () => void }) {
  const yes = () => { onClose(); if (!ask.yes) return; useOfferStore.getState().patchAll(arbeitenChanges(offerNow(), ask.yes.fields)); keepSess(ask.yes.session); };
  return (
    <div role="alertdialog" aria-labelledby="wv-ask-title" data-testid="wv-ask" className="grid gap-2 rounded-lg border-2 border-primary p-3">
      <strong id="wv-ask-title">{ask.title}</strong>
      <p className="m-0">{ask.message}</p>
      <div className="flex flex-wrap gap-2"><Button onClick={yes}>{ask.confirm}</Button><Button variant="outline" onClick={onClose}>{ask.cancel}</Button></div>
    </div>
  );
}

export function Wandverkleidung() {
  const wv = useWv();
  const tasks = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne?.workTasks as string[] | undefined);
  const height = useOfferStore((s) => String((s.offer as Record<string, any> | null)?.duschwanne?.wandverkleidungHoehe ?? ""));
  const on = wv.wvEnabled === true;
  const line = lineOf(wv);
  const simple = sv.isSimple(wv);
  const lineOpen = !!useOfferStore((s) => s.scratch.wvLineOpen);
  const [ask, setAsk] = useState<WallAsk | null>(null); // the wall's question about the floor
  const sealWalls = useOfferStore((s) => s.scratch.wvSealWalls) as Fields | null | undefined;
  const shower = Array.isArray(tasks) && tasks.includes(SHOWER_TASK);
  const dw = (fields: (dw: Fields) => Fields) => { const o = offerNow(); useOfferStore.getState().patchAll(arbeitenChanges(o, fields(o.duschwanne ?? {}))); };
  const toLine = (to: Line) => {
    const st = useOfferStore.getState();
    const r = chooseLine(wvNow(), to, (st.scratch.wvLines as Partial<Record<Line, Fields>> | undefined) ?? {});
    st.remember("wvLines", r.parked);
    renewSealHint();
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
          {simple ? (
            <button type="button" aria-expanded={lineOpen} aria-controls="wv-line" onClick={() => remember("wvLineOpen", !lineOpen)} data-testid="wv-line-row" className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-border bg-card px-3 py-2 text-left text-foreground">
              <span className="grid"><strong>Produktlinie</strong><small className="text-muted-foreground" data-part="text">{sv.lineLabel(line)}</small></span><span aria-hidden className={cn("text-xl text-muted-foreground transition-transform", lineOpen && "rotate-90")}>›</span>
            </button>
          ) : null}
          {!simple || lineOpen ? (
          <div id="wv-line" className="grid gap-3 rounded-lg border-2 border-border p-3">
            <div className="grid"><strong>Produktlinie</strong><small className="text-muted-foreground" data-testid="wv-line-text">Nur Produkte von {LINES[line].brand}</small></div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Produktlinie wählen">
              {(Object.keys(LINES) as Line[]).map((t) => (
                <button key={t} type="button" aria-pressed={line === t} onClick={() => toLine(t)} className={cn("grid min-h-12 cursor-pointer rounded-lg border-2 px-3 py-1 text-left", line === t ? "border-primary bg-accent-weak" : "border-input bg-card")}>
                  <strong>{LINES[t].name}</strong><span className="text-[0.85rem] text-muted-foreground">{LINES[t].sub}</span>
                </button>
              ))}
            </div>
          </div>
          ) : null}
          <ChoiceTiles legend="Welche Wände werden verkleidet?" name="wv-kind" options={KIND_TILES} perRow={4} value={String(wv.wvKind ?? "") || undefined} onChange={(v) => write({ wvKind: v })} />
          {wv.wvKind === HALF_HEIGHT_KIND ? (
            <div className={cn(ROW, "flex-wrap justify-between")} data-testid="wv-kind-height">
              <label htmlFor="wv-kind-height" className="min-w-0 flex-1 cursor-pointer">Alle Bad-Wände bis Höhe</label>
              <span className="flex items-center gap-2"><span className="w-24"><Input id="wv-kind-height" type="number" min={0} max={400} step={1} inputMode="numeric" placeholder="z. B. 120" value={String(wv.wvKindHoehe ?? "")} onChange={(e) => write({ wvKindHoehe: e.target.value })} /></span>cm</span>
            </div>
          ) : null}
          <div className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
            <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={shower} onChange={(e) => dw((d) => toggleTask(d, SHOWER_TASK, e.target.checked))} />
              <span>Im Duschbereich bis Höhe <small className="text-muted-foreground">(Arbeiten)</small></span>
            </label>
            <span className="flex items-center gap-2"><span className="w-24"><Input type="number" min={0} step={1} inputMode="numeric" placeholder="___" aria-label="Höhe in cm" value={height} onChange={(e) => dw(() => ({ wandverkleidungHoehe: e.target.value }))} /></span>cm</span>
          </div>
          {line === "ww" ? <WcPlateNote /> : null}
          {ask ? <WallQuestion ask={ask} onClose={() => setAsk(null)} /> : null}
          {line === "ww" && !simple ? <div><Button variant="outline" className="w-full border-dashed text-primary" onClick={toSimple}>Zur neuen Ansicht wechseln (Platten + Dekor)</Button></div> : null}
          {line === "ww" ? <>{simple ? <SimpleView onAsk={setAsk} /> : <><Calculator kit={WW_KIT} /><Rows /></>}<Accessories label="Zubehör winwall" area={wallAreaOf({ ...wv, ...(sealWalls ?? {}) })} cut /></> : line === "premium" ? <Vigour /> : <Badolux />}
          <SketchAndNote />
          <RestForFloor />
        </>
      ) : null}
    </Card>
  );
}
