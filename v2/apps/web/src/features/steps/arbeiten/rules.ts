// Arbeiten (Badumbau) — the rules of today's UI (test/fixtures/arbeiten.json,
// v2/scripts/capture-arbeiten.cjs):
//  - the Umbauart ticks the removal of what is there and the installation of what comes; a task
//    ticked or unticked by hand is never changed again (`duschwanne.manualTasks`)
//  - `duschwanne.workTasks` holds the ticked tasks in page order (not stored when none)
//  - free tasks: stored trimmed, without empty rows and without doubles
//  - a dry-wall position adds 2 h to the time on site (removing takes them off again); only
//    positions with a width are stored
//  - the ticked tasks give the automatic work-time suggestion stored in `Arbeitszeit`
import { addMinutes, derived } from "../arbeitszeit/rules.js";
import { TASKS } from "./tasks.js";

type Fields = Record<string, unknown>;

export const KINDS = [
  { value: "wanne_dusche", label: "Badewanne → Dusche" }, { value: "dusche_dusche", label: "Dusche → Dusche" },
  { value: "wanne_wanne", label: "Badewanne → Badewanne" }, { value: "dusche_wanne", label: "Dusche → Badewanne" },
  { value: "ohne_rueckbau", label: "Ohne Rückbau" },
] as const;
const BY_KIND: Record<string, readonly string[]> = {
  wanne_dusche: ["remove_tub", "install_tray"], wanne_wanne: ["remove_tub", "install_bathtub"],
  dusche_dusche: ["remove_showertub", "install_tray"], dusche_wanne: ["remove_showertub", "install_bathtub"], ohne_rueckbau: [],
};
/** the tasks the Umbauart decides */
const BY_KIND_TASKS = new Set(Object.values(BY_KIND).flat());
/** A chosen product also wants its installation. Today's UI knows this for every product; here
 *  it is known for the products of the steps built so far: the bathtub and the shower tray
 *  (a picked tray or a free item, while the tray is switched on). */
const productWants = (task: string, dw: Fields): boolean =>
  (task === "install_bathtub" && !!String(dw.chosenBathtubProductId ?? "").trim()) ||
  (task === "install_tray" && dw.trayEnabled === true && (!!String(dw.chosenTrayProductId ?? "").trim() || (Array.isArray(dw.quickAdd) && dw.quickAdd.length > 0)));

/** Optionale Produkte: a ticked product of these groups wants its task (today's WORK_RULES). The
 *  shower system is one group for two tasks — where the tap sits says which one; a sibling the
 *  user ticked by hand covers the product. */
const picked = (opt: Fields, group: string): boolean => Array.isArray(opt[group]) && (opt[group] as unknown[]).length > 0;
const OPTIONAL_WANTS: readonly { task: string; has: (opt: Fields) => boolean; sibling?: string }[] = [
  { task: "replace_thermostat", has: (o) => picked(o, "optThermo[]") },
  { task: "replace_shower_no_thermo", has: (o) => picked(o, "optShower[]") && o.showerMount === "versetzt", sibling: "replace_shower_with_thermo" },
  { task: "replace_shower_with_thermo", has: (o) => picked(o, "optShower[]") && o.showerMount === "direkt", sibling: "replace_shower_no_thermo" },
  { task: "replace_sink_faucet", has: (o) => picked(o, "optBasinTap[]") },
  { task: "install_sink", has: (o) => picked(o, "optBasin[]") },
  { task: "install_shower_basket", has: (o) => picked(o, "optDuschzub[]") },
  { task: "install_lifting_unit", has: (o) => picked(o, "optHebe[]") },
];

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",").filter(Boolean) : []);
/** ticked tasks in page order; values the page does not know (older offers) stay at the end */
const inPageOrder = (ticked: Set<string>): string[] => [...TASKS.map((t) => t.value).filter((v) => ticked.has(v)), ...[...ticked].filter((v) => !TASKS.some((t) => t.value === v))];
const stored = (ticked: Set<string>): Fields => ({ workTasks: ticked.size ? inPageOrder(ticked) : undefined });

/** The tasks the Umbauart and the chosen products decide, brought up to date. Nothing happens
 *  without an Umbauart (older offers); a task changed by hand is left alone. */
export function syncTasks(dw: Fields, opt?: Fields): Fields {
  const kind = String(dw.umbauart ?? "");
  if (!kind) return {};
  const ticked = new Set(list(dw.workTasks));
  const manual = new Set(list(dw.manualTasks));
  const want = new Set(BY_KIND[kind] ?? []);
  for (const task of BY_KIND_TASKS) {
    if (manual.has(task)) continue;
    if (want.has(task) || productWants(task, dw)) ticked.add(task); else ticked.delete(task);
  }
  if (opt) for (const rule of OPTIONAL_WANTS) { // the tasks of the optional products (only where the offer has that section)
    if (manual.has(rule.task)) continue;
    const covered = !!rule.sibling && manual.has(rule.sibling) && ticked.has(rule.sibling);
    if (!covered && rule.has(opt)) ticked.add(rule.task); else ticked.delete(rule.task);
  }
  return stored(ticked);
}
export const chooseKind = (dw: Fields, kind: string): Fields => ({ umbauart: kind, ...syncTasks({ ...dw, umbauart: kind }) });
export function toggleTask(dw: Fields, task: string, on: boolean): Fields {
  const ticked = new Set(list(dw.workTasks));
  if (on) ticked.add(task); else ticked.delete(task);
  const manual = list(dw.manualTasks);
  return { ...stored(ticked), manualTasks: manual.includes(task) ? manual : [...manual, task] };
}

// ---- free tasks ----
export const freeTasksOf = (dw: Fields, remembered: unknown): string[] => {
  const rows = Array.isArray(remembered) ? (remembered as string[]) : list(dw.extraTasks);
  return rows.length ? rows : [""];
};
export function storedFreeTasks(rows: readonly string[]): Fields {
  const filled = [...new Set(rows.map((r) => r.trim()).filter(Boolean))];
  return { extraTasks: filled.length ? filled : undefined };
}
export const filledCount = (rows: readonly string[]): number => rows.filter((r) => r.trim()).length;

// ---- dry-wall positions ----
export const WALL_MINUTES = 120;
export const wallRowsOf = (dw: Fields, remembered: unknown): string[] =>
  Array.isArray(remembered) ? (remembered as string[]) : Array.isArray(dw.trockenbauAusgleich) ? (dw.trockenbauAusgleich as unknown[]).map((r) => String((r && typeof r === "object" ? (r as Fields).widthMm : r) ?? "")) : [];
export function storedWall(rows: readonly string[]): Fields {
  const widths = rows.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return { trockenbauAusgleich: widths.length ? widths.map((widthMm) => ({ widthMm })) : undefined };
}

// ---- the automatic work-time suggestion ----
/** today's minutes per task; the admin panel's values (pricingRules.azMinutes) come first */
const TIMED: Record<string, { label: string; minutes: number }> = {
  remove_tub: { label: "Badewanne entfernen", minutes: 45 }, install_bathtub: { label: "Badewanne einbauen", minutes: 90 },
  install_bathtub_screen: { label: "Wannenaufsatz montieren", minutes: 60 }, remove_showertub: { label: "Duschwanne entfernen", minutes: 30 },
  remove_enclosure: { label: "Duschabtrennung entfernen", minutes: 25 }, install_tray: { label: "Duschwanne installieren", minutes: 75 },
  install_sitzbath: { label: "Sitzbadewanne einbauen", minutes: 120 }, remove_shower_curtain: { label: "Duschvorhang entfernen", minutes: 15 },
  install_shower_curtain: { label: "Duschvorhang montieren", minutes: 15 }, install_enclosure: { label: "Duschabtrennung montieren", minutes: 60 },
  install_box_enclosure: { label: "Kasten verkleiden", minutes: 60 }, install_distance_profile: { label: "Abstandprofil montieren", minutes: 20 },
  close_valve: { label: "Armatur stilllegen", minutes: 45 }, relocate_faucet: { label: "Armatur versetzen", minutes: 90 },
  relocate_drain: { label: "Abfluss verlegen", minutes: 30 }, convert_faucet: { label: "Armatur umbauen", minutes: 90 },
  replace_thermostat: { label: "Thermostat auswechseln", minutes: 30 }, replace_shower_no_thermo: { label: "Duschsystem auswechseln", minutes: 30 },
  replace_shower_with_thermo: { label: "Duschsystem + Thermostat auswechseln", minutes: 45 }, replace_shower_system: { label: "Duschsystem auswechseln", minutes: 20 },
  install_shower_basket: { label: "Duschkorb montieren", minutes: 15 }, remove_sink: { label: "Waschbecken entfernen", minutes: 30 },
  install_sink: { label: "Waschbecken einbauen", minutes: 45 }, replace_sink_faucet: { label: "Waschbecken-Armatur auswechseln", minutes: 30 },
  remove_furniture: { label: "Bademöbel entfernen", minutes: 20 }, install_furniture: { label: "Bademöbel einbauen", minutes: 30 },
  remove_toilet: { label: "Toilette entfernen", minutes: 50 }, install_toilet: { label: "Toilette montieren", minutes: 20 },
  install_shower_wc: { label: "Dusch-WC einbauen", minutes: 60 },
};
const hhmm = (minutes: number) => { const s = Math.round(Math.max(0, minutes)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
interface Row { key: string; label: string; minutes: number; qty: number }

const positive = (v: unknown): number => { const n = Number(String(v ?? "").trim().replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
/** rows that come from other steps than Arbeiten, in today's order; the ones a React step owns are computed, the others kept as stored */
const OWNED = ["wv997", "wv1497", "wvKeramico", "Silikon", "flooring", "wallCladdingFloor"]; // computed here
const BEFORE_FLOOR = ["wv997", "wv1497", "wvKeramico", "Silikon"];
const GRAB_BARS = ["CLPESG30", "CLPESG40", "CLPESG60", "CLPESG80"]; // computed once the offer's optional products are known

/** The suggestion fields of `Arbeitszeit`: one row per ticked task with a time, then the rows of
 *  the materials (wall cladding, flooring, grab bars). Rows of steps that are not rebuilt yet
 *  are kept as stored. */
export function suggestion(dw: Fields, azMinutes: unknown, storedRows: unknown, wv: Fields = {}, opt?: Fields): Fields {
  const live = (azMinutes && typeof azMinutes === "object" ? azMinutes : {}) as Record<string, unknown>;
  const min = (key: string, fallback: number) => (typeof live[key] === "number" ? (live[key] as number) : fallback);
  const ticked = new Set(list(dw.workTasks));
  const rows: Row[] = [];
  for (const task of TASKS) {
    if (!ticked.has(task.value)) continue;
    const rule = TIMED[task.value];
    const minutes = typeof live[task.value] === "number" ? (live[task.value] as number) : rule?.minutes;
    if (minutes == null) continue; // not a timed task
    rows.push({ key: task.value, label: rule?.label || task.title, minutes: minutes > 0 ? minutes : 0, qty: 1 });
  }
  const isTask = (key: unknown) => TASKS.some((t) => t.value === key);
  const others = (Array.isArray(storedRows) ? (storedRows as Row[]) : []).filter((r) => r && !isTask(r.key) && !OWNED.includes(r.key) && !(opt && GRAB_BARS.some((g) => r.key === `opt_${g}`)));
  // Wandverkleidung (VIGOUR panels, per panel) and its silicone — from the stored panel table
  // and switch, whatever line is chosen at the moment (as today)
  if (wv.wvEnabled === true) {
    const table = (wv.panelConfigs ?? {}) as Record<string, { enabled?: boolean; qty?: unknown; extras?: { qty?: unknown }[] }>;
    const extraColors = (wv.extraColors ?? {}) as Record<string, { qty?: unknown }[]>;
    for (const [size, fallback] of [[997, 30], [1497, 40]] as const) {
      const cfg = table[`${size}x2550`];
      if (!cfg?.enabled) continue;
      const extra = (extraColors[`${size}x2550`] ?? cfg.extras ?? []).reduce((a, e) => a + (Math.round(Number(e.qty)) || 0), 0);
      const minutes = min(`wv${size}`, fallback);
      if (minutes) rows.push({ key: `wv${size}`, label: `Wandverkleidung ${size}×2550`, minutes, qty: Math.max(1, Math.round(positive(cfg.qty) + extra)) });
    }
  }
  if (wv.wvEnabled === true && wv.wvBudgetMode) { // Badolux: Keramico panels take the time of a 997 panel (fixed)
    let panels = 0;
    try { const arr: unknown = JSON.parse(String(wv.wvKRows || "null")); if (Array.isArray(arr)) panels = arr.filter((r) => /^WP/i.test(String(r?.pid))).reduce((a, r) => a + Math.max(1, Math.round(Number(r.qty) || 1)), 0); } catch { /* no rows */ }
    if (panels > 0) rows.push({ key: "wvKeramico", label: "Wandpaneel Keramico 950×2550", minutes: 30, qty: panels });
  }
  if (wv.wvEnabled === true && wv.wvSilikonSelected === true && min("silikon", 10)) rows.push({ key: "Silikon", label: "Silikon", minutes: min("silikon", 10), qty: 1 });
  if (dw.addFlooring === true) { // Fußboden: per m², or a flat time while no area is entered
    const area = positive(dw.floorArea);
    const row = area > 0 ? { minutes: min("flooring_m2", 8), qty: Math.round(area * 10) / 10 } : { minutes: min("flooring_flat", 25), qty: 1 };
    if (row.minutes && row.qty > 0) rows.push({ key: "flooring", label: "Fußboden individuell", ...row });
  }
  if (dw.addWallCladding) { // wall cladding as flooring (with or without the wall's rest): laid like a floor, per m²
    const area = positive(dw.wallCladdingArea);
    if (area > 0 && min("flooring_m2", 8)) rows.push({ key: "wallCladdingFloor", label: "Fußboden (Wandverkleidung)", minutes: min("flooring_m2", 8), qty: Math.round(area * 10) / 10 });
  }
  rows.push(...others.filter((r) => !BEFORE_FLOOR.includes(r.key)));
  if (opt) for (const g of GRAB_BARS) { // Optionale Produkte: every grab bar takes its time
    if (!(Array.isArray(opt["optGrab[]"]) && (opt["optGrab[]"] as unknown[]).some((v) => String(v).endsWith(g)))) continue;
    const n = Number(opt[`qty_${g}`] || 0);
    if (min("grab", 30)) rows.push({ key: `opt_${g}`, label: `Haltegriff ${g}`, minutes: min("grab", 30), qty: Math.max(1, Number.isFinite(n) && n > 0 ? n : 1) });
  }
  const total = rows.reduce((sum, r) => sum + r.minutes * r.qty, 0);
  return { autoSuggestedTasks: rows, autoSuggestedHoursHHMM: hhmm(total), autoSuggestedHoursNumeric: Math.round((total / 60) * 100) / 100 };
}

/** One change of the offer for a change on this step: the tasks, and what follows in Arbeitszeit. */
export function arbeitenChanges(offer: Record<string, any>, dwFields: Fields, laborDelta = 0): Record<string, Fields> {
  // as today: after every change the automatic ticking looks at the tasks again
  dwFields = { ...dwFields, ...syncTasks({ ...(offer.duschwanne ?? {}), ...dwFields }, offer.optional) };
  const dw = { ...(offer.duschwanne ?? {}), ...dwFields };
  const az: Fields = { ...(offer.Arbeitszeit ?? {}), ...suggestion(dw, offer.pricingRules?.azMinutes, offer.Arbeitszeit?.autoSuggestedTasks, offer.wandverkleidung ?? {}, offer.optional) };
  if (laborDelta) { az.laborHoursHHMM = addMinutes(az.laborHoursHHMM, laborDelta); az.laborHoursSource = "manual"; }
  return { duschwanne: dwFields, Arbeitszeit: laborDelta ? derived(az, { type: offer.activeOffer, payer: offer.Kundendaten?.payer, postalCode: offer.Kundendaten?.postalCode }) : az };
}

/** One change of the offer for a change of the Wandverkleidung: its fields, and the rows of the
 *  work-time suggestion that follow from it. */
export function wvChanges(offer: Record<string, any>, wvFields: Fields): Record<string, Fields> {
  const wv = { ...(offer.wandverkleidung ?? {}), ...wvFields };
  return { wandverkleidung: wvFields, Arbeitszeit: { ...(offer.Arbeitszeit ?? {}), ...suggestion(offer.duschwanne ?? {}, offer.pricingRules?.azMinutes, offer.Arbeitszeit?.autoSuggestedTasks, wv, offer.optional) } };
}

/** One change of the offer for a change of the optional products: their fields (`undefined`
 *  removes one), the tasks their products want, and the rows of the work-time suggestion. */
export function optChanges(offer: Record<string, any>, optFields: Fields): Record<string, Fields> {
  const opt: Fields = { ...(offer.optional ?? {}), ...optFields };
  for (const k of Object.keys(optFields)) if (optFields[k] === undefined) delete opt[k];
  const before = offer.duschwanne ?? {};
  const tasks = syncTasks(before, opt);
  const same = !("workTasks" in tasks) || JSON.stringify(tasks.workTasks ?? null) === JSON.stringify((before as Fields).workTasks ?? null);
  const dw = { ...before, ...tasks };
  return { optional: optFields, ...(same ? {} : { duschwanne: tasks }), Arbeitszeit: { ...(offer.Arbeitszeit ?? {}), ...suggestion(dw, offer.pricingRules?.azMinutes, offer.Arbeitszeit?.autoSuggestedTasks, offer.wandverkleidung ?? {}, opt) } };
}
