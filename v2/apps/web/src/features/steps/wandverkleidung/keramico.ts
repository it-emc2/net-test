// Wandverkleidung, line Badolux (Keramico panels, 95 × 255 cm) — the rules of today's UI
// (test/fixtures/wv-badolux.json, v2/scripts/capture-wv-badolux.cjs).
//  - one row = decor (or Sonder-Dekor with a motif name) + number of panels; the rows are the
//    data (`wvKRows`, a JSON text). The first row's decor is also the offer's `wvColor`, and
//    the panel table of the line VIGOUR carries it as its colour
//  - with every change of the rows: 2 bags of adhesive per panel, connecting profiles =
//    panels − 1 (winwall's accessories are used for Keramico as well)
//  - the first panel switches the four consumables of the offer on, the last one going
//    switches them off — as on the line VIGOUR
//  - a Badolux accessory is in the offer while its quantity is above 0 (`wvBx_<id>: "on"`)
import { keramicoPanelPlan } from "@oc/pricing";
import type { Plan, Situation, WallKey } from "./calc.js";

type Fields = Record<string, unknown>;
export interface KRow { pid: string; name: string; qty: number }
export const SONDER = "WP007";
export const SONDER_NAME = "Wandpaneel Sonder-Dekor";
export const SONDER_PRICE = 136; // KERAMICO_SONDER_PRICE of the price rules: fixed, no discount
export const SHOP_URL = "https://cleverbad.de/konfigurator";
/** the decors of the line — today's tiles (products WP… of the source Badolux) */
export const DECORS = [
  ["WP001", "Standard-Dekor Marmor weiß"], ["WP002", "Standard-Dekor steingrau"], ["WP003", "Standard-Dekor grau"], ["WP004", "Standard-Dekor creme"],
  ["WP005", "Standard-Dekor Sahara"], ["WP006", "Standard-Dekor Cafe"], [SONDER, SONDER_NAME],
].map(([pid, name]) => ({ value: `${pid}|${name}`, pid: pid!, name: name!, caption: name!.replace(/^(Standard-Dekor|Wandpaneel)\s+/i, ""), img: `/assets/budget/${pid}.webp` }));
export const image = (pid: string): string => `/assets/budget/${pid}.webp`;
const short = (name: string) => name.replace(/^(Standard-Dekor|Wandpaneel)\s+/i, "");
export const rowTitle = (r: KRow): string => (r.pid === SONDER ? (r.name && r.name !== SONDER_NAME ? r.name : "Sonder-Dekor") : short(r.name));
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const pidOf = (value: unknown) => String(value ?? "").split("|", 1)[0]!;
const isMotif = (wv: Fields) => /^WP007\|/i.test(String(wv.wvColor ?? ""));

/** the rows as stored; an older offer without rows but with a Keramico decor has one row */
export function rowsOf(wv: Fields): KRow[] {
  try {
    const arr: unknown = JSON.parse(String(wv.wvKRows || "null"));
    if (Array.isArray(arr)) return arr.filter((r) => /^WP/i.test(String(r?.pid))).map((r) => ({ pid: String(r.pid), name: String(r.name || ""), qty: Math.max(1, Math.round(Number(r.qty) || 1)) }));
  } catch { /* older offers: no rows */ }
  const pid = pidOf(wv.wvColor);
  if (!/^WP/i.test(pid)) return [];
  const manual = Math.round(num(wv.wvKQty));
  return [{ pid, name: String(wv.wvColor).split("|").slice(1).join("|"), qty: manual > 0 ? manual : Math.max(1, planOf(wv).gesamt || 1) }];
}
export const totalPanels = (rows: readonly KRow[]): number => rows.reduce((a, r) => a + (r.qty || 0), 0);
/** m² of the panels — the sealing sets follow it */
export const areaOf = (rows: readonly KRow[]): number => totalPanels(rows) * 2.4225;

const NO_PANELS = { "1497x2550": { color: "", enabled: false, overrideColor: "", qty: 0 }, "997x2550": { color: "", enabled: false, overrideColor: "", qty: 0 } };
const accessory = (id: string, qty: number): Fields => ({ [`wvWwQty_${id}`]: String(qty), [`wvWw_${id}`]: qty > 0 ? "on" : undefined });
const CONSUMABLES = ["wvSealingSelected", "wvFlachenSelected", "wvSilikonSelected", "wvEndProfileSelected"];

/** Rows → fields. `wv`: the offer's section before the change (for what stays). */
export function fromRows(wv: Fields, rows: readonly KRow[]): Fields {
  const total = totalPanels(rows), before = totalPanels(rowsOf(wv));
  const edge = total > 0 && before === 0 ? true : total === 0 && before > 0 ? false : null;
  const first = rows[0] && DECORS.find((d) => d.pid === rows[0]!.pid);
  const table = (wv.panelConfigs ?? NO_PANELS) as Record<string, Fields>;
  return {
    wvKRows: JSON.stringify(rows.map((r) => ({ pid: r.pid, name: r.name, qty: r.qty }))),
    ...(first ? { wvColor: first.value, panelConfigs: Object.fromEntries(Object.entries(table).map(([k, c]) => [k, { ...c, color: first.value }])) } : {}),
    ...(edge === null ? {} : Object.fromEntries(CONSUMABLES.map((k) => [k, edge]))),
    ...accessory("R_4260602", 2 * total), ...accessory("WS80113", Math.max(0, total - 1)),
  };
}
export const addRow = (rows: readonly KRow[]): KRow[] => { const c = rows[rows.length - 1] ?? DECORS[0]!; return [...rows, { pid: c.pid, name: c.name, qty: 1 }]; };
/** a decor tile for one row */
export const withDecor = (r: KRow, value: string): KRow => ({ ...r, pid: pidOf(value), name: value.split("|").slice(1).join("|") });

// ---- Badolux accessories ----
export const BX_ACCESSORIES = [
  { id: "PR101VBM3", caption: "Polymer Kleber Weiß", small: "Polymer Kleber Weiß 290 ml · PR101VBM3 · Kartuschen" },
  { id: "PR47VBM02", caption: "Dichtband Blau", small: "Dichtband Blau · PR47VBM02 · lfm" },
  { id: "PR59VBM03", caption: "Abdichtung Innenecke", small: "Abdichtung DIN 18534 Innenecke · PR59VBM03 · Stück" },
  { id: "PR59VBM05", caption: "Abdichtung Außenecke", small: "Abdichtung DIN 18534 Außenecke · PR59VBM05 · Stück" },
  { id: "PR59VBM07", caption: "Wandmanschette", small: "Wandmanschette Rohrdurchführung · PR59VBM07 · Stück" },
  { id: "PRI130VBM01", caption: "Fliesenabschlussleiste", small: "Fliesenabschlussleiste Edelstahl 2550 mm · PRI130VBM01 · Stück" },
  { id: "PRI130VBM02", caption: "Abschluss-Würfel", small: "Abschluss-Würfel Edelstahl poliert · PRI130VBM02 · Stück" },
] as const;
export const bxQty = (wv: Fields, id: string): number => Math.max(0, Math.round(Number(wv[`wvBxQty_${id}`]) || 0));
export const setBxQty = (id: string, qty: number): Fields => { const n = Math.max(0, Math.round(qty) || 0); return { [`wvBxQty_${id}`]: String(n), [`wvBx_${id}`]: n > 0 ? "on" : undefined }; };
/** the switch: on gives one (or keeps the number), off gives none */
export const toggleBx = (wv: Fields, id: string, on: boolean): Fields => setBxQty(id, on ? bxQty(wv, id) || 1 : 0);
export const anyBx = (wv: Fields): boolean => BX_ACCESSORIES.some((a) => !!wv[`wvBx_${a.id}`]);

// ---- the wall calculator on this line ----
export const NOTE = "Ein Keramico-Paneel ist 95 cm breit und 255 cm hoch. Wandsituation wählen und die Breiten eintragen — die Paneele laufen von links über jede Wand.";
export const MAX_HEIGHT = 255;
export const MIX = "95 × 255 cm";
const plan = (wv: Fields, sit: unknown, widths: Partial<Record<WallKey, unknown>>, reuse: boolean): Plan =>
  keramicoPanelPlan(sit, widths, { heightCm: num(wv.wvKHoehe) as never, reuse }) as unknown as Plan;
/** the plan of all walls; a Sonder-Dekor runs over the whole panel, so its strips are not reused */
export const planOf = (wv: Fields): Plan => plan(wv, wv.wvKSituation, { links: wv.wvKLinks, back: wv.wvKBack, rechts: wv.wvKRechts }, !isMotif(wv));
/** the row a group of walls with one decor needs */
export function rowsForPlan(wv: Fields, sit: Situation, widths: Partial<Record<WallKey, number>>, value: string): KRow[] {
  const pid = pidOf(value), n = plan(wv, sit, widths, pid !== SONDER).gesamt;
  return n ? [{ pid, name: value.split("|").slice(1).join("|"), qty: n }] : [];
}
export const motifCutNote = (wv: Fields): string => (isMotif(wv) ? " (Motiv-Paneele werden nicht geteilt, das Motiv läuft über das ganze Paneel)" : "");
