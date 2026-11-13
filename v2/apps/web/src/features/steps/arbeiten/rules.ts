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

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",").filter(Boolean) : []);
/** ticked tasks in page order; values the page does not know (older offers) stay at the end */
const inPageOrder = (ticked: Set<string>): string[] => [...TASKS.map((t) => t.value).filter((v) => ticked.has(v)), ...[...ticked].filter((v) => !TASKS.some((t) => t.value === v))];
const stored = (ticked: Set<string>): Fields => ({ workTasks: ticked.size ? inPageOrder(ticked) : undefined });

/** The tasks the Umbauart and the chosen products decide, brought up to date. Nothing happens
 *  without an Umbauart (older offers); a task changed by hand is left alone. */
export function syncTasks(dw: Fields): Fields {
  const kind = String(dw.umbauart ?? "");
  if (!kind) return {};
  const ticked = new Set(list(dw.workTasks));
  const manual = new Set(list(dw.manualTasks));
  const want = new Set(BY_KIND[kind] ?? []);
  for (const task of BY_KIND_TASKS) {
    if (manual.has(task)) continue;
    if (want.has(task) || productWants(task, dw)) ticked.add(task); else ticked.delete(task);
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

/** The suggestion fields of `Arbeitszeit` for these ticked tasks. Rows that do not come from a
 *  task (wall cladding, flooring, grab bars — from their own steps) are kept as stored. */
export function suggestion(workTasks: unknown, azMinutes: unknown, storedRows: unknown): Fields {
  const live = (azMinutes && typeof azMinutes === "object" ? azMinutes : {}) as Record<string, unknown>;
  const ticked = new Set(list(workTasks));
  const rows: Row[] = [];
  for (const task of TASKS) {
    if (!ticked.has(task.value)) continue;
    const rule = TIMED[task.value];
    const minutes = typeof live[task.value] === "number" ? (live[task.value] as number) : rule?.minutes;
    if (minutes == null) continue; // not a timed task
    rows.push({ key: task.value, label: rule?.label || task.title, minutes: minutes > 0 ? minutes : 0, qty: 1 });
  }
  const isTask = (key: unknown) => TASKS.some((t) => t.value === key);
  for (const r of Array.isArray(storedRows) ? (storedRows as Row[]) : []) if (r && !isTask(r.key)) rows.push(r);
  const total = rows.reduce((sum, r) => sum + r.minutes * r.qty, 0);
  return { autoSuggestedTasks: rows, autoSuggestedHoursHHMM: hhmm(total), autoSuggestedHoursNumeric: Math.round((total / 60) * 100) / 100 };
}

/** One change of the offer for a change on this step: the tasks, and what follows in Arbeitszeit. */
export function arbeitenChanges(offer: Record<string, any>, dwFields: Fields, laborDelta = 0): Record<string, Fields> {
  // as today: after every change the automatic ticking looks at the tasks again
  dwFields = { ...dwFields, ...syncTasks({ ...(offer.duschwanne ?? {}), ...dwFields }) };
  const dw = { ...(offer.duschwanne ?? {}), ...dwFields };
  const az: Fields = { ...(offer.Arbeitszeit ?? {}), ...suggestion(dw.workTasks, offer.pricingRules?.azMinutes, offer.Arbeitszeit?.autoSuggestedTasks) };
  if (laborDelta) { az.laborHoursHHMM = addMinutes(az.laborHoursHHMM, laborDelta); az.laborHoursSource = "manual"; }
  return { duschwanne: dwFields, Arbeitszeit: laborDelta ? derived(az, { type: offer.activeOffer, payer: offer.Kundendaten?.payer, postalCode: offer.Kundendaten?.postalCode }) : az };
}
