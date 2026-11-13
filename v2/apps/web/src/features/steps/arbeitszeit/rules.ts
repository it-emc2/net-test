// Arbeitszeit — the rules of today's UI, recorded for all five offer types
// (test/fixtures/arbeitszeit.json, v2/scripts/capture-arbeitszeit.cjs).
//
// Entered: distance (one way), nights away, time on site, travel time (one way), the rate of
// the second worker while travelling; Badewannentür also has rows of extra work.
// Everything else in `Arbeitszeit` follows from these and is stored with them, as today:
//  - a day holds 9:45 h minus the way there and back → number of work days
//  - total = work + travel there and back per work day
//  - nights away are at most work days − 1; travel days = work days − nights
//  - Alltagshilfe: the travel time gives the travel zone (10-minute steps)
import type { StepProblem } from "../../offer/index.js";

type Fields = Record<string, unknown>;

// ---- durations as typed (H:MM) ----
const clampMin = (n: number) => String(Math.max(0, Math.min(59, n))).padStart(2, "0");
/** While typing: only digits count; the last two are the minutes ("130" → "1:30", "7" → "7:"). */
export function typeDuration(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `${digits}:`;
  const hours = digits.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  return `${hours}:${clampMin(parseInt(digits.slice(-2), 10) || 0)}`;
}
/** When the field is left: "7" / "7:" → "7:00", "7:5" → "7:05". */
export function leaveDuration(raw: string): string {
  const v = raw.trim();
  if (/^\d+$/.test(v)) return `${parseInt(v, 10) || 0}:00`;
  if (/^\d+:$/.test(v)) return `${v}00`;
  const m = /^(\d+):(\d{1,2})$/.exec(v);
  return m ? `${parseInt(m[1]!, 10) || 0}:${clampMin(parseInt(m[2]!, 10) || 0)}` : v;
}
export function durationMinutes(value: unknown): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
const hhmm = (minutes: number) => { const s = Math.round(Math.max(0, minutes)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
/** the −15 / −5 / +5 / +15 buttons */
export const addMinutes = (value: unknown, delta: number): string => typeDuration(hhmm(durationMinutes(value) + delta));
/** a time from the route service or a zone button, as the field then shows it */
export const fromSeconds = (seconds: number): string => (Number.isFinite(seconds) && seconds >= 0 ? typeDuration(hhmm(Math.round(seconds / 60))) : "");

/** "1:30" → 1.5 (two decimals); anything else → 0 */
export function hoursOf(value: unknown): number {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(value ?? "").trim());
  return m ? Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100 : 0;
}
export function hoursText(hours: number): string {
  const mins = Math.max(0, Math.round((Number(hours) || 0) * 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

// ---- Alltagshilfe: travel zone ----
const ZONE1_PLZ = ["95026", "95028", "95030", "95032"];
export function zoneOf(oneWayMinutes: number, postalCode: unknown): { zone: number; billMin: number } {
  const minutes = ZONE1_PLZ.includes(String(postalCode ?? "").trim()) && oneWayMinutes <= 15 ? 10 : oneWayMinutes;
  const billMin = Math.max(10, Math.ceil(minutes / 10) * 10);
  return { zone: billMin / 10, billMin };
}
export const ZONE_BUTTONS = [10, 20, 30, 40, 50] as const;
export const zoneText = (zone: unknown): string => (Number(zone) > 0 ? `Zone ${Number(zone)} · Hinfahrt ${Number(zone) * 10} min pro Einsatz` : "Noch nicht bestimmt");

// ---- what follows from the entries ----
export const DAY_HOURS = 9.75;
const secondRate = (v: unknown) => (Number(v ?? 35) === 35 ? 35 : 25);

/** `Arbeitszeit` with everything derived brought up to date. `ctx`: what it depends on outside. */
export function derived(az: Fields, ctx: { type: string | null; payer: unknown; postalCode: unknown }): Fields {
  const work = hoursOf(az.laborHoursHHMM || "0:00");
  const oneWay = hoursOf(az.travelTimeHHMM || "0:00");
  const perDay = DAY_HOURS - 2 * oneWay;
  const days = work > 0 && perDay > 0 ? Math.ceil(work / perDay) : 0;
  const total = days > 0 ? work + days * (2 * oneWay) : 0;
  const travel = days * (2 * oneWay);
  const nights = Math.max(0, Math.min(Number(az.uebernachten) || 0, days > 0 ? days - 1 : 0));
  const rate = ctx.payer === "Kassenkunde" || ctx.payer === "Selbstzahler" ? 69.5 : 0;
  const second = secondRate(az.travelSecondWorkerRate);
  const costs = { laborRate: rate, secondWorkerRate: second, workCost: work * 2 * rate, travelDriverCost: travel * rate, travelSecondWorkerCost: travel * second };
  const minutes = durationMinutes(az.travelTimeHHMM);
  return {
    ...az,
    totalHoursHHMM: hoursText(total), totalHoursNumeric: total, ReiseHoursNumeric: travel, ArbeitHoursNumeric: work,
    workDays: days, uebernachten: nights, travelDays: Math.max(0, days - nights),
    travelSecondWorkerRate: second,
    travelCostDebug: { ...costs, totalCost: costs.workCost + costs.travelDriverCost + costs.travelSecondWorkerCost },
    ...(ctx.type === "ah" && minutes > 0 ? { ahTravelZone: zoneOf(minutes, ctx.postalCode).zone } : {}),
  };
}
/** the travel time leaves no time to work on a day */
export const travelTooLong = (az: Fields): boolean => hoursOf(az.laborHoursHHMM || "0:00") > 0 && DAY_HOURS - 2 * hoursOf(az.travelTimeHHMM || "0:00") <= 0;

// ---- what the page says ----
export const totalText = (az: Fields): string => `Gesamtzeit (Arbeit + Fahrt): ${hoursText(Number(az.totalHoursNumeric) || 0)} • Arbeitstage: ${Number(az.workDays) || 0}`;
export const TOO_LONG = "⚠️ Reisezeit zu lang für 09:45 h/Tag – bitte Zeiten prüfen.";
export const roundTripText = (az: Fields): string => `= ${Math.round(Math.max(0, Number(az.distanceKm) || 0) * 2 * (Number(az.travelDays) || 0))} km (Hin- & Rückfahrt × ${Number(az.travelDays) || 0} Reisetage)`;
export const travelDaysText = (az: Fields): string => `Reisetage: ${Number(az.travelDays) || 0} (Arbeitstage ${Number(az.workDays) || 0} − Übernachten ${Number(az.uebernachten) || 0})`;

// ---- route suggestion ----
export interface Route { oneWayKm?: unknown; roundTripKm?: unknown; oneWaySeconds?: unknown; from?: { address?: unknown } | null | undefined; to?: { address?: unknown } | null | undefined }
/** what a suggested route fills in, and the line shown under the button (null: no usable route) */
export function fromRoute(route: Route): { fields: Fields; text: string; basis: string } | null {
  const oneWay = Number(route.oneWayKm || 0);
  if (!Number.isFinite(oneWay) || oneWay <= 0) return null;
  const roundRaw = Number(route.roundTripKm || 0);
  const round = Number.isFinite(roundRaw) && roundRaw > 0 ? roundRaw : oneWay * 2;
  const de = (n: number) => n.toFixed(1).replace(".", ",");
  const time = fromSeconds(Number(route.oneWaySeconds ?? NaN));
  return {
    fields: { distanceKm: oneWay.toFixed(1), ...(time ? { travelTimeHHMM: time } : {}) },
    text: `Vorschlag: ${de(oneWay)} km (Hin- & Rückfahrt: ${de(round)} km) ✓ Automatisch eingetragen`,
    basis: `Basis: Strecke von ${String(route.from?.address || "Firma")} zu ${String(route.to?.address || "Kundenadresse")} · Wert kann manuell angepasst werden`,
  };
}
export const NO_ADDRESS = "Bitte zuerst Adresse, PLZ oder Ort beim Kunden ausfüllen.";

// ---- Badewannentür: extra work ----
export interface ExtraRow { duration: string; task: string }
export const EMPTY_EXTRA: ExtraRow = { duration: "", task: "" };
/** stored: only rows with something in them; with none, neither key is stored */
export function storedExtra(rows: readonly ExtraRow[]): Fields {
  const tasks = rows.map((r) => ({ durationHHMM: r.duration.trim(), task: r.task.trim() })).filter((r) => r.durationHHMM || r.task)
    .map((r) => ({ durationHHMM: r.durationHHMM, durationHours: hoursOf(r.durationHHMM || "0:00") || 0, task: r.task }));
  if (!tasks.length) return { extraTasks: undefined, extraHoursTotal: undefined };
  return { extraTasks: tasks, extraHoursTotal: Math.round(tasks.reduce((sum, t) => sum + (t.durationHours > 0 ? t.durationHours : 0), 0) * 100) / 100 };
}
export function extraRows(az: Fields, remembered: unknown): ExtraRow[] {
  if (Array.isArray(remembered)) return remembered as ExtraRow[];
  const stored = az.extraTasks as { durationHHMM?: unknown; task?: unknown }[] | undefined;
  return Array.isArray(stored) ? stored.map((t) => ({ duration: String(t.durationHHMM ?? ""), task: String(t.task ?? "") })) : [];
}

// ---- "Weiter" ----
/** As today: distance, time on site and travel time must be filled in (Alltagshilfe: the travel
 *  time is its travel zone). Today the browser marks the field; here a message names them. */
export function arbeitszeitProblem(type: string | null, az: Fields): StepProblem | null {
  const empty = (k: string) => !String(az[k] ?? "").trim();
  const missing: [string, string][] = [];
  if (empty("distanceKm")) missing.push(["Entfernung in Kilometern", "#az-distance"]);
  if (type !== "ah" && empty("laborHoursHHMM")) missing.push(["Dauer vor Ort", "#az-labor"]);
  if (empty("travelTimeHHMM")) missing.push(type === "ah" ? ["Reisezone", "#az-zone-10"] : ["Reisezeit", "#az-travel"]);
  return missing.length ? { message: `Bitte in „Arbeitszeit“ ausfüllen: ${missing.map(([l]) => l).join(", ")}`, focus: missing[0]![1] } : null;
}
