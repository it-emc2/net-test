// Wand-WC → one plate of Wandverkleidung for its Vorwand (owner 2026-11-27, ADR 032).
// A wall-mounted WC sits on the Conel VIS element (CVIS3WCT112) in a dry-wall Vorwand; the Vorwand
// is clad with one winwall plate 100 × 250 cm (format 15). The plate is a real row of the
// Wandverkleidung (`wvWwRows`), so price, offer lines and order list come from the existing engine.
//  - explicit: the WC card adds it on a tap — in the Wandverkleidung's first Dekor, or as a further
//    Dekor the user then picks in the Wandverkleidung step; „Entfernen“ takes it out again
//  - tracked in `wandverkleidung.wvWcPlate` = { decor, count, note, picked, orphan? }: the Dekor that
//    got the plate, how many 100 × 250 plates of that Dekor there were right after adding (a different
//    number later = the user changed them), whether the Arbeiten note was added by it, whether the
//    Dekor was picked (false while a further Dekor still shows its placeholder)
//  - the WC no longer wall-mounted with the VIS element: the plate goes again only when it was not
//    changed since; otherwise it stays and the Wandverkleidung step asks (remove / keep)
//  - the Arbeiten note is one line of „Weitere Arbeiten“ (`duschwanne.extraTasks`) with a fixed text:
//    added once, never twice, removed with the plate only when it was added by the card and is
//    unchanged (an edited text is the user's)
//  - winwall only: VIGOUR and Badolux get a hint (their panels carry colour/quantity fields of their
//    own and a VIGOUR panel adds work time), nothing is added there
import { WINWALL_DECORS } from "@oc/pricing";
import { planOf } from "./calc.js";
import { decorCode, fromRows, lineOf, rowsOf, type Line, type Row } from "./rules.js";
import { nameOf, nextDecor } from "./simple.js";

type Fields = Record<string, unknown>;
/** the Conel VIS WC element for dry wall — the Vorwand of the wall-mounted WC */
export const VIS = "CVIS3WCT112";
/** winwall format 15 = 100 × 250 cm */
export const FMT = "15";
export const MARK = "wvWcPlate";
export const NOTE = "Verkleidung der Vorwand des Wand-WCs mit Wandverkleidung (1 Platte 100 × 250 cm)";
/** what the other lines would need — shown as a hint only */
export const LINE_PANEL: Record<Exclude<Line, "ww">, string> = { premium: "1 Paneel 997 × 2550 mm", standard: "1 Wandpaneel Keramico 950 × 2550 mm" };

export interface Mark { decor: string; count: number; note: boolean; picked: boolean; orphan: boolean }
export interface Change { wv: Fields; dw: Fields }

/** the WC is wall-mounted and the VIS element is in the offer (priced: quantity above 0) */
export const wantsPlate = (opt: Fields | undefined): boolean => opt?.wcMontage === "Wandmontage" && (parseInt(String(opt?.[`qty_${VIS}`] ?? ""), 10) || 0) > 0;
export function markOf(wv: Fields | undefined): Mark | null {
  const m = wv?.[MARK] as Partial<Mark> | undefined;
  if (!m || typeof m !== "object" || typeof m.decor !== "string") return null;
  return { decor: m.decor, count: Number(m.count) || 0, note: !!m.note, picked: m.picked !== false, orphan: !!m.orphan };
}
/** plates 100 × 250 of one Dekor in the rows */
export const countOf = (rows: readonly Row[], code: string): number => rows.filter((r) => r.code === code && r.fmt === FMT).reduce((a, r) => a + r.qty, 0);
/** the Wandverkleidung's (first) Dekor: its first row, else the Dekor chosen without rows, else WS 203 */
export const firstDecor = (wv: Fields): string => rowsOf(wv).find((r) => r.code)?.code ?? decorCode(wv.wvWwDecor === "custom" ? wv.wvWwDecorCustom : wv.wvWwDecor) ?? "WS203";
export const decorName = (code: string): string => nameOf(code);
const tasksOf = (dw: Fields | undefined): string[] => (Array.isArray(dw?.extraTasks) ? (dw!.extraTasks as unknown[]).map(String) : []);
const known = new Set((WINWALL_DECORS as { code: string }[]).map((d) => d.code));

export type Card =
  | { kind: "none" }
  | { kind: "line"; line: Exclude<Line, "ww">; panel: string }
  | { kind: "open"; decor: string; off: boolean; gone: boolean }
  | { kind: "added"; decor: string; off: boolean; changed: boolean; picked: boolean };
/** what the WC card shows */
export function cardOf(offer: Record<string, any>): Card {
  if (!wantsPlate(offer.optional)) return { kind: "none" };
  const wv: Fields = offer.wandverkleidung ?? {};
  const line = lineOf(wv), off = wv.wvEnabled !== true, mark = markOf(wv);
  if (line !== "ww") return { kind: "line", line, panel: LINE_PANEL[line] };
  if (!mark) return { kind: "open", decor: firstDecor(wv), off, gone: false };
  const n = countOf(rowsOf(wv), mark.decor);
  if (!n) return { kind: "open", decor: firstDecor(wv), off, gone: true };
  return { kind: "added", decor: mark.decor, off, changed: n !== mark.count, picked: mark.picked };
}

/** „Im Dekor der Wandverkleidung“ (`same`) or „Anderes Dekor wählen“ (`other`: a further Dekor with
 *  a placeholder the user picks over). Switches the Wandverkleidung on when it is off. */
export function addPlate(offer: Record<string, any>, how: "same" | "other"): Change & { decor: string; rowIndex: number } {
  const wv: Fields = offer.wandverkleidung ?? {};
  const rows = rowsOf(wv);
  const decor = how === "same" ? firstDecor(wv) : nextDecor(rows.map((r) => r.code).filter((c): c is string => !!c));
  let rowIndex = rows.findIndex((r) => r.code === decor && r.fmt === FMT);
  const next = rowIndex >= 0 ? rows.map((r, i) => (i === rowIndex ? { ...r, qty: r.qty + 1 } : r))
    : [...rows, known.has(decor) ? { code: decor, fmt: FMT, qty: 1 } : { code: decor, fmt: FMT, qty: 1, custom: true, text: `${decor.slice(0, 2)} ${decor.slice(2)}` }];
  if (rowIndex < 0) rowIndex = next.length - 1;
  const tasks = tasksOf(offer.duschwanne), had = tasks.includes(NOTE), before = markOf(wv);
  const mark: Mark = { decor, count: countOf(next, decor), note: had ? !!before?.note : true, picked: how === "same", orphan: false };
  return {
    wv: { ...fromRows(next, planOf(wv), wv), ...(wv.wvEnabled === true ? {} : { wvEnabled: true }), [MARK]: mark },
    dw: had ? {} : { extraTasks: [...tasks, NOTE] },
    decor, rowIndex,
  };
}

/** „Entfernen“: one plate 100 × 250 of the marked Dekor out, the mark and (if the card added it) the note */
export function removePlate(offer: Record<string, any>): Change {
  const wv: Fields = offer.wandverkleidung ?? {}, mark = markOf(wv);
  if (!mark) return { wv: {}, dw: {} };
  const rows = rowsOf(wv);
  const at = rows.findIndex((r) => r.code === mark.decor && r.fmt === FMT);
  const next = at < 0 ? rows : rows.flatMap((r, i) => (i !== at ? [r] : r.qty > 1 ? [{ ...r, qty: r.qty - 1 }] : []));
  return { wv: { ...(at < 0 ? {} : fromRows(next, planOf(wv), wv)), [MARK]: undefined }, dw: dropNote(offer.duschwanne, mark) };
}
/** „Behalten“ after the WC changed: the plate stays as the user's own, the card forgets it */
export const keepPlate = (): Change => ({ wv: { [MARK]: undefined }, dw: {} });
function dropNote(dw: Fields | undefined, mark: Mark): Fields {
  const tasks = tasksOf(dw);
  if (!mark.note || !tasks.includes(NOTE)) return {};
  const rest = tasks.filter((t) => t !== NOTE);
  return { extraTasks: rest.length ? rest : undefined };
}

export const REMOVED = "Die Platte 100 × 250 cm für die Vorwand wurde aus der Wandverkleidung entfernt.";
export const KEPT = "Die Platte für die Vorwand wurde in der Wandverkleidung geändert und bleibt – bitte dort prüfen.";
/** After a change of the optional products (`offer` already holds it): the WC no longer wants the
 *  plate → it goes when unchanged; changed → it stays, once announced (`orphan`). */
export function afterOptChange(offer: Record<string, any>): (Change & { toast: string | null }) | null {
  const wv: Fields = offer.wandverkleidung ?? {}, mark = markOf(wv);
  if (!mark) return null;
  if (wantsPlate(offer.optional)) return mark.orphan ? { wv: { [MARK]: { ...mark, orphan: false } }, dw: {}, toast: null } : null;
  if (mark.orphan) return null;
  const n = countOf(rowsOf(wv), mark.decor);
  if (n === mark.count && n > 0) return { ...removePlate(offer), toast: REMOVED };
  if (!n) return { wv: { [MARK]: undefined }, dw: dropNote(offer.duschwanne, mark), toast: null }; // the plate is gone already
  return { wv: { [MARK]: { ...mark, orphan: true } }, dw: {}, toast: KEPT };
}

/** A change of the rows elsewhere moved the marked Dekor's plates to another Dekor (a palette tile on
 *  its group, a typed number, a row's Dekor): the mark follows. `wvFields` = the change. */
export function followPlate(wv: Fields, wvFields: Fields): Fields {
  if (!("wvWwRows" in wvFields) || MARK in wvFields) return {};
  const mark = markOf(wv);
  if (!mark) return {};
  const before = rowsOf(wv), after = rowsOf({ ...wv, ...wvFields });
  const was = countOf(before, mark.decor);
  if (!was || countOf(after, mark.decor)) return {};
  const codes = [...new Set(after.map((r) => r.code).filter((c): c is string => !!c && c !== mark.decor))];
  const to = codes.filter((c) => countOf(after, c) - countOf(before, c) === was);
  if (to.length !== 1) return {};
  return { [MARK]: { ...mark, decor: to[0]!, count: mark.count - was + countOf(after, to[0]!), picked: true } };
}
