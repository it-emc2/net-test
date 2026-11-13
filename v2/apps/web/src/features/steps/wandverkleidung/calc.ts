// The wall calculator ("Wände und Dekor — Bedarf berechnen") on the line winwall — the rules of
// today's UI (test/fixtures/wandrechner.json, v2/scripts/capture-wandrechner.cjs).
//  - situation (one wall, corner, U-shape), a width per wall and the height of the cladding
//    are stored as `wvK…`; the plan of the plates is the one the price uses (@oc/pricing)
//  - a wall can have its own decor (`wvWallDecor`, a JSON text). Walls with a decor and a
//    width write the plate rows: one group per decor. The rows the walls made last time
//    (`auto`) are replaced; rows added by hand stay, after them
//  - the suggested connecting profiles follow the wall plan (joints on straight walls, none at
//    corners) while the rows match it
import { KERAMICO_SITUATIONS, WINWALL_FORMATS, winwallPanelPlan } from "@oc/pricing";
import { WW_DECORS } from "./decors.js";
import { decorCode, rowsOf, type Row } from "./rules.js";

type Fields = Record<string, unknown>;
export type WallKey = "links" | "back" | "rechts";
export type Situation = "wand" | "ecke" | "u";
export const SITUATIONS = [{ value: "wand", label: "Eine Wand" }, { value: "ecke", label: "Ecke" }, { value: "u", label: "Nische / U-Form" }] as const;
export const WALLS: Record<WallKey, { name: string; field: string }> = {
  links: { name: "Linke Wand", field: "wvKLinks" }, back: { name: "Rückwand", field: "wvKBack" }, rechts: { name: "Rechte Wand", field: "wvKRechts" },
};
export const NOTE = "winwall-Platten gibt es 100, 125 und 150 cm breit, 205 oder 250 cm hoch. Wandsituation wählen und die Breiten eintragen — der Rechner wählt die im Einkauf günstigste Kombination.";
export const LEGEND = "Wand antippen (Zeichnung oder Liste) → Dekor wählen. Gestrichelte Stücke werden vor Ort zugeschnitten.";

export interface Piece { key: WallKey; start: number; breite: number; zuschnitt: boolean; size: number; format: string; feld: number; platte: number }
export interface Plan { pieces: Piece[]; gesamt: number; schnitte: number; perPanel: number; heightCm: number | null; verschnitt: number; qty: Record<string, number> }

const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
export const fmtCm = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
export const widthsIn = (wv: Fields) => widthsOf(wv);
export const situationOf = (wv: Fields): Situation => ((KERAMICO_SITUATIONS as Record<string, unknown>)[String(wv.wvKSituation)] ? (wv.wvKSituation as Situation) : "wand");
export const wallsOf = (sit: Situation): WallKey[] => (KERAMICO_SITUATIONS as Record<string, { walls: WallKey[] }>)[sit]!.walls;
const widthsOf = (wv: Fields) => ({ links: num(wv.wvKLinks), back: num(wv.wvKBack), rechts: num(wv.wvKRechts) });
/** the plan of all walls that have a width */
export const planOf = (wv: Fields): Plan => winwallPanelPlan(situationOf(wv), widthsOf(wv), { heightCm: num(wv.wvKHoehe) as never }) as unknown as Plan;

// ---- a decor per wall ----
type WallDecor = { line: string; auto?: string[] } & Partial<Record<WallKey, string>>;
/** the per-wall decors of this line (another line's choice is ignored); the key order is kept as stored */
export function wallDecorOf(wv: Fields, line = "ww"): WallDecor {
  try {
    const o: unknown = JSON.parse(String(wv.wvWallDecor || "null"));
    if (o && typeof o === "object" && (o as WallDecor).line === line) return o as WallDecor;
  } catch { /* nothing stored */ }
  return { line };
}
/** The walls write the rows of ANY line: one group of rows per decor; the rows the walls made
 *  last time (`auto`) are replaced, rows added by hand stay after them. null: never used. */
export function wallGroups<R>(wv: Fields, wd: WallDecor, kit: { isTile: (v: string) => boolean; rowsFor: (decor: string, widths: Partial<Record<WallKey, number>>) => R[]; key: (r: R) => string; current: R[] }): { wallDecor: WallDecor; rows: R[] } | null {
  const sit = situationOf(wv), widths = widthsOf(wv);
  const groups = new Map<string, Partial<Record<WallKey, number>>>();
  for (const k of wallsOf(sit)) {
    const v = wd[k];
    if (!(widths[k] > 0) || !v || !kit.isTile(v)) continue;
    if (!groups.has(v)) groups.set(v, {});
    groups.get(v)![k] = widths[k];
  }
  if (!groups.size && !wd.auto?.length) return null;
  const list: R[] = [];
  for (const [v, w] of groups) list.push(...kit.rowsFor(v, w));
  const prev = [...(wd.auto ?? [])];
  const extras = kit.current.filter((r) => { const i = prev.indexOf(kit.key(r)); if (i < 0) return true; prev.splice(i, 1); return false; });
  wd.auto = list.map(kit.key);
  return { wallDecor: wd, rows: [...list, ...extras] };
}
const isTile = (v: unknown) => WW_DECORS.some((d) => d.value === v);
export const decorCaption = (v: unknown): string => WW_DECORS.find((d) => d.value === v)?.caption ?? "";

/** The walls write the plate rows. null: the walls were never used — the rows stay as they are. */
export function wallRows(wv: Fields, wd: WallDecor): { wallDecor: WallDecor; rows: Row[] } | null {
  const sit = situationOf(wv), widths = widthsOf(wv);
  const groups = new Map<string, Partial<Record<WallKey, number>>>();
  for (const key of wallsOf(sit)) {
    const v = wd[key];
    if (!(widths[key] > 0) || !v || !isTile(v)) continue;
    if (!groups.has(v)) groups.set(v, {});
    groups.get(v)![key] = widths[key];
  }
  if (!groups.size && !wd.auto?.length) return null;
  const list: Row[] = [];
  for (const [v, w] of groups) {
    const plan = winwallPanelPlan(sit, w, { heightCm: num(wv.wvKHoehe) as never }) as unknown as Plan;
    for (const [fmt, n] of Object.entries(plan.qty ?? {})) if (n > 0) list.push({ code: decorCode(v), fmt, qty: n, custom: false, text: "" });
  }
  const key = (r: Row) => `${r.code}|${r.fmt}`;
  const prev = [...(wd.auto ?? [])];
  const extras = rowsOf(wv).filter((r) => { const i = prev.indexOf(key(r)); if (i < 0) return true; prev.splice(i, 1); return false; });
  wd.auto = list.map(key);
  return { wallDecor: wd, rows: [...list, ...extras] };
}
/** a decor for one wall; the next wall without one opens */
export function setWallDecor(wv: Fields, wall: WallKey, value: string, line = "ww"): { wallDecor: WallDecor; next: WallKey | null } {
  const wd = wallDecorOf(wv, line);
  wd[wall] = value;
  return { wallDecor: wd, next: wallsOf(situationOf(wv)).find((k) => !wd[k]) ?? null };
}
/** "Alle Wände gleiches Dekor": the open wall's decor (or the first there is) on every wall */
export function sameDecorEverywhere(wv: Fields, open: WallKey | null, line = "ww"): WallDecor | null {
  const wd = wallDecorOf(wv, line), walls = wallsOf(situationOf(wv));
  const v = (open && wd[open]) || walls.map((k) => wd[k]).find(Boolean);
  if (!v) return null;
  walls.forEach((k) => { wd[k] = v; });
  return wd;
}

// ---- what the page says ----
const format = (code: string) => WINWALL_FORMATS.find((f) => f.code === code)!;
const mixText = (plan: Plan) => Object.entries(plan.qty).filter(([, n]) => n > 0).map(([c, n]) => `${n} × ${format(c).widthCm}×${format(c).heightCm}`).join(" + ");
export function cutList(plan: Plan, mix: string = `${mixText(plan)} cm`): { title: string; text: string } | null {
  if (!plan.schnitte) return null;
  const parts: string[] = [];
  if (plan.perPanel > 1) parts.push(`Höhe: aus jedem Paneel ${plan.perPanel} Stücke à ${fmtCm(plan.heightCm ?? 0)} cm schneiden — ${plan.pieces.length} Felder brauchen ${plan.gesamt} ${plan.gesamt === 1 ? "Paneel" : "Paneele"}.`);
  else if (plan.heightCm) parts.push(`Höhe: jedes Paneel auf ${fmtCm(plan.heightCm)} cm kürzen.`);
  const cuts = plan.pieces.filter((p) => p.zuschnitt);
  if (cuts.length) parts.push(`Breite: ${cuts.map((p) => `${plan.perPanel > 1 ? `Feld ${p.feld}` : `Platte ${p.platte}`} auf ${fmtCm(p.breite)} cm`).join(", ")} (Verschnitt ${fmtCm(plan.verschnitt)} cm Breite).`);
  return { title: `${plan.schnitte === 1 ? "1 Schnitt" : `${plan.schnitte} Schnitte`} vor Ort`, text: `Geliefert werden ${plan.gesamt} Paneele ungeschnitten (${mix}). ${parts.join(" ")}` };
}
export const MAX_HEIGHT = 250;
export const heightWarning = (wv: Fields, max = MAX_HEIGHT): string => {
  const h = num(wv.wvKHoehe);
  return h > max ? `Höhe ${fmtCm(h)} cm liegt über der Paneelhöhe von ${max} cm. Die Paneele decken die Wand nicht bis oben ab — Ausführung bitte klären (z. B. Abschlussleiste oder zweite Reihe). Die Menge berücksichtigt das nicht.` : "";
};
