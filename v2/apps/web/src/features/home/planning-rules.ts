// Planning panel + week calendar of the Hauptmenü, as today's UI (script.js "Heutige Termine Planung",
// "Wochenkalender Vertrieb"). Pure functions — no React, no DOM.
//  Today's list (buildPlanningEntries): planning.futurePlanned of today (plannedDate = local yyyy-mm-dd),
//    else planning.days of today; ordered by start minute, no start = keeps the planner's order.
//  Search: lower case, no accents, ß = ss, over name, address, phone, e-mail, priority, prefDay,
//    companyAddress and the date label.
//  Badge: cancelled „Abgesagt“ · locked slot „Fixer Slot n“ · „Fixiert“ · priority Hoch/Mittel/Niedrig · „Geplanter Termin“.
//    Compact (week): „Abgesagt“ · „Slot n“ · „Fixiert“ · Hoch/Mittel/Niedrig · „Termin“.
//  Pause chip: after the last appointment starting before the pause start (none starts after: the last one).
//  Full route: all not cancelled addresses with a round trip to the company address.
//  Week: offset 0 = planning.days (richer), other weeks from rawWpByDate (Mon–Fri of currentWeekStart ± 7 d);
//    ◀ ▶ stop where rawWpByDate ends; zone chip = most frequent PLZ region of the day.
//  Transfer into a new offer (applyPlanningAppointmentToForm): first/last name split at the last blank,
//    street/PLZ/city from the entry else from the address, bitrixContactId = contactId, customerNumber too,
//    auftragId = deal, else contact, else entry id; the Bitrix contact then fills the Anrede and EMPTY fields only.
import type { Appointment } from "./rules.js";

export interface PlanningEntry extends Appointment {
  contactId?: string | number; priority?: string; lockedSlot?: number | string; dayLocked?: boolean; travelMinutesAfter?: number;
  street?: string; postalCode?: string; city?: string; prefDay?: string; companyAddress?: string; zone?: number | string;
  entryId: string; dateLabel: string;
}
export interface PlanningDay { date?: string; label?: string; shortLabel?: string; dateLabel?: string; locked?: boolean; dayIndex?: number; customers?: PlanningEntry[] }
export interface PlanningPayload { planning?: { futurePlanned?: PlanningEntry[]; days?: PlanningDay[]; currentWeekStart?: string; rawWpByDate?: Record<string, PlanningEntry[]>; board?: { lockedDays?: Record<string, unknown> }; todayPause?: { start?: string; end?: string; durationMinutes?: number } } | null }

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDate = (v: unknown): Date | null => { if (!v) return null; const d = new Date(v as string); return Number.isNaN(d.getTime()) ? null : d; };
const sameDay = (a: Date | null, b: Date) => !!a && dayKey(a) === dayKey(b);
const DE = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("de-DE", o);

export const cancelled = (e: { cancelled?: unknown }) => e.cancelled === true || e.cancelled === "true" || e.cancelled === 1 || e.cancelled === "1";
const startOf = (e: PlanningEntry) => { const n = Number(e.manualStartMinutes); return Number.isFinite(n) ? n : Infinity; };
const byStart = (a: PlanningEntry, b: PlanningEntry) => (startOf(a) === startOf(b) ? 0 : startOf(a) < startOf(b) ? -1 : 1);
export const clock = (m: number) => { const w = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`; };
export const startClock = (e: PlanningEntry) => { const n = Number(e.manualStartMinutes); return Number.isFinite(n) && n >= 0 ? clock(n) : null; };
export const timeDisplay = (e: PlanningEntry) => { const s = startClock(e), d = Number(e.duration) > 0 ? `${Number(e.duration)} Min` : null; return s && d ? `${s} · ${d}` : s ?? d ?? "Dauer offen"; };
const withId = (c: PlanningEntry, day: PlanningDay | null, i: number, label: PlanningDay): PlanningEntry => ({ ...c, entryId: String(c.id || `${day?.date || "day"}-${i}`), dateLabel: label.dateLabel || "", dayLocked: !!label.locked });

/** today's appointments + the label of the day */
export function todayEntries(payload: PlanningPayload | null | undefined, now = new Date()): { entries: PlanningEntry[]; dateLabel: string } {
  const p = payload?.planning ?? {};
  const key = dayKey(now);
  const fromFuture = (p.futurePlanned ?? []).filter((c) => c?.plannedDate === key);
  const long = DE(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const day: PlanningDay | null = fromFuture.length
    ? { date: key, customers: fromFuture, locked: !!(fromFuture[0] as { dayLocked?: boolean }).dayLocked, dateLabel: long }
    : (p.days ?? []).find((d) => sameDay(parseDate(d?.date), now)) ?? null;
  const entries = (day?.customers ?? []).map((c, i) => withId(c, day, i, day!)).sort(byStart);
  return { entries, dateLabel: day?.dateLabel || long };
}

export const normalize = (v: unknown) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const blob = (e: PlanningEntry) => [e.name, e.address, e.phone, e.email, e.priority, e.prefDay, e.companyAddress, e.dateLabel].filter(Boolean).join(" ");
export const searchEntries = (list: PlanningEntry[], q: string) => { const n = normalize(q.trim()); return n ? list.filter((e) => normalize(blob(e)).includes(n)) : list; };

const PRIORITY: Record<string, [string, string]> = { high: ["Priorität Hoch", "Hoch"], medium: ["Priorität Mittel", "Mittel"], low: ["Priorität Niedrig", "Niedrig"] };
const prio = (e: PlanningEntry) => PRIORITY[String(e.priority || "").trim().toLowerCase()];
export function badge(e: PlanningEntry, compact = false): string {
  if (cancelled(e)) return "Abgesagt";
  if (e.locked && Number.isFinite(Number(e.lockedSlot))) return `${compact ? "Slot" : "Fixer Slot"} ${Number(e.lockedSlot) + 1}`;
  if (e.locked) return "Fixiert";
  return prio(e)?.[compact ? 1 : 0] ?? (compact ? "Termin" : "Geplanter Termin");
}
export const typeTone = (t?: string) => ({ BU: "bu", BWT: "bwt", HMS: "hms", WD: "hms", HL: "hl", AH: "ah" } as Record<string, string>)[(t || "").toUpperCase()] ?? "manual";
export const subtitle = (e: PlanningEntry) => (cancelled(e) ? "Termin abgesagt" : e.dayLocked ? "Tag gesperrt" : e.locked ? "Termin fixiert" : "Planungstermin");

export function pause(p: NonNullable<PlanningPayload["planning"]>["todayPause"], entries: PlanningEntry[]): { text: string; index: number } | null {
  if (!p || !(Number(p.durationMinutes) > 0)) return null;
  const text = p.start && p.end ? `Pause ${p.start}–${p.end} · ${p.durationMinutes} Min` : `Pause · ${p.durationMinutes} Min`;
  const [h, m] = String(p.start || "").split(":").map(Number);
  const at = (h ?? NaN) * 60 + (m ?? NaN);
  let index = entries.length - 1;
  if (Number.isFinite(at)) { const after = entries.findIndex((e) => Number(e.manualStartMinutes) > at); if (after !== -1) index = Math.max(after - 1, 0); }
  return { text, index };
}

export const phoneHref = (v?: string) => String(v || "").trim().replace(/[^+\d]/g, "");
export const routeHref = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
export function fullRouteHref(entries: PlanningEntry[]): string | null {
  const stops = entries.filter((e) => !cancelled(e) && e.address).map((e) => e.address!);
  if (!stops.length) return null;
  const company = entries.find((e) => e.companyAddress)?.companyAddress || "Kornhausacker 10, Hof";
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: company, destination: company, waypoints: stops.join("|"), travelmode: "driving" })}`;
}

// ---- transfer into a new offer ----
export function parseName(full: string) {
  const parts = String(full || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return parts.length <= 1 ? { firstName: parts[0] ?? "", lastName: "" } : { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1]! };
}
export function parseAddress(address: string) {
  const parts = String(address || "").trim().split(",").map((x) => x.trim()).filter(Boolean);
  let postalCode = "", city = "";
  for (const part of parts) { const m = part.match(/(\d{5})\s+(.+)/); if (m) { postalCode = m[1]!; city = m[2]!; break; } }
  return { street: parts.length && !/\d{5}\s+/.test(parts[0]!) ? parts[0]! : "", postalCode, city };
}
/** Kundendaten fields of the appointment, plus the number the offer is filed under */
export function prefill(e: PlanningEntry) {
  const n = parseName(e.name || ""), a = parseAddress(e.address || "");
  const contact = e.contactId ? String(e.contactId) : "";
  return {
    kunde: {
      firstName: n.firstName, lastName: n.lastName, phone: e.phone || "", email: e.email || "",
      street: e.street || a.street, postalCode: e.postalCode || a.postalCode, city: e.city || a.city,
      bitrixContactId: contact, customerNumber: contact, company: "", country: "", state: "",
    },
    auftragId: String(e.importDealId || e.contactId || e.id || ""),
  };
}
export type Enrichment = { salutation: string; email: string; phone: string; street: string; city: string; postalCode: string };
export function enrichmentOf(c: Record<string, any> | null | undefined): Enrichment {
  const id = String(c?.HONORIFIC?.STATUS_ID ?? c?.HONORIFIC ?? c?.HONORIFIC_ID ?? "").trim();
  return {
    salutation: ({ HNR_DE_1: "Frau", HNR_DE_2: "Herr", "1": "Familie" } as Record<string, string>)[id] || "",
    email: Array.isArray(c?.EMAIL) && c.EMAIL[0] ? c.EMAIL[0].VALUE : "", phone: Array.isArray(c?.PHONE) && c.PHONE[0] ? c.PHONE[0].VALUE : "",
    street: c?.ADDRESS || "", city: c?.ADDRESS_CITY || "", postalCode: c?.ADDRESS_POSTAL_CODE || "",
  };
}
/** the fields of Kundendaten the Bitrix contact adds: the Anrede always, the rest only where still empty */
export function enrichmentPatch(f: Enrichment, kunde: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = f.salutation ? { salutation: f.salutation } : {};
  for (const k of ["email", "phone", "street", "city", "postalCode"] as const) if (f[k] && !kunde[k]) out[k] = f[k];
  return out;
}

// ---- week calendar ----
const SHORT = ["Mo", "Di", "Mi", "Do", "Fr"], LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
const mondayOf = (d: Date) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() + (m.getDay() === 0 ? -6 : 1 - m.getDay())); return m; };
const currentMonday = (p: PlanningPayload) => { const d = parseDate(p.planning?.currentWeekStart); return d ? mondayOf(d) : mondayOf(new Date()); };
export function weekBounds(p: PlanningPayload): { min: number; max: number } {
  const keys = Object.keys(p.planning?.rawWpByDate ?? {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!keys.length) return { min: 0, max: 0 };
  const cur = currentMonday(p).getTime(), wk = 7 * 86400000;
  const off = (k: string) => Math.round((mondayOf(parseDate(k)!).getTime() - cur) / wk);
  return { min: Math.min(off(keys[0]!), 0), max: Math.max(off(keys[keys.length - 1]!), 0) };
}
function weekDays(p: PlanningPayload, offset: number): PlanningDay[] {
  const pl = p.planning ?? {};
  if (offset === 0 && pl.days?.length) return pl.days;
  const monday = currentMonday(p); monday.setDate(monday.getDate() + offset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const date = dayKey(d);
    return { dayIndex: i, date, shortLabel: SHORT[i]!, label: LONG[i]!, dateLabel: DE(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), locked: Boolean(pl.board?.lockedDays?.[date]), customers: pl.rawWpByDate?.[date] ?? [] };
  });
}
const PLZ2: Record<string, string> = { "01": "Dresden", "02": "Görlitz", "03": "Cottbus", "04": "Leipzig", "06": "Halle", "07": "Gera/Jena", "08": "Zwickau", "09": "Chemnitz", "10": "Berlin", "12": "Berlin", "13": "Berlin", "14": "Potsdam", "15": "Frankfurt (Oder)", "16": "Brandenburg", "17": "Neubrandenburg", "18": "Rostock", "19": "Schwerin", "20": "Hamburg", "21": "Hamburg", "22": "Hamburg", "23": "Lübeck", "24": "Kiel", "25": "Husum", "26": "Oldenburg", "27": "Bremerhaven", "28": "Bremen", "29": "Lüneburg", "30": "Hannover", "31": "Hildesheim", "32": "Herford", "33": "Paderborn", "34": "Kassel", "35": "Marburg", "36": "Fulda", "37": "Göttingen", "38": "Braunschweig", "39": "Magdeburg", "40": "Düsseldorf", "41": "Mönchengladbach", "42": "Wuppertal", "44": "Dortmund", "45": "Essen", "46": "Oberhausen", "47": "Duisburg", "48": "Münster", "49": "Osnabrück", "50": "Köln", "51": "Köln", "52": "Aachen", "53": "Bonn", "54": "Trier", "55": "Mainz", "56": "Koblenz", "57": "Siegen", "58": "Hagen", "59": "Hamm", "60": "Frankfurt", "61": "Bad Homburg", "63": "Offenbach", "64": "Darmstadt", "65": "Wiesbaden", "66": "Saarbrücken", "67": "Ludwigshafen", "68": "Mannheim", "69": "Heidelberg", "70": "Stuttgart", "71": "Stuttgart", "72": "Tübingen", "73": "Göppingen", "74": "Heilbronn", "75": "Pforzheim", "76": "Karlsruhe", "77": "Offenburg", "78": "Villingen", "79": "Freiburg", "80": "München", "81": "München", "82": "Starnberg", "83": "Rosenheim", "84": "Landshut", "85": "Ingolstadt", "86": "Augsburg", "87": "Kempten", "88": "Ravensburg", "89": "Ulm", "90": "Nürnberg", "91": "Nürnberg", "92": "Amberg", "93": "Regensburg", "94": "Passau", "95": "Bayreuth", "96": "Bamberg", "97": "Würzburg", "98": "Suhl", "99": "Erfurt" };
const PLZ1: Record<string, string> = { "0": "Sachsen/Ost", "1": "Berlin/Nord-Ost", "2": "Hamburg/Nord", "3": "Hannover/Mitte", "4": "Ruhrgebiet", "5": "Köln/West", "6": "Rhein-Main", "7": "Stuttgart/Süd-West", "8": "München/Süd", "9": "Nürnberg/Franken" };
function zoneOf(e: PlanningEntry): string | null {
  const a = parseAddress(e.address || ""), plz = String(e.postalCode || a.postalCode || "").trim();
  if (/^\d{5}$/.test(plz)) return PLZ2[plz.slice(0, 2)] || PLZ1[plz.slice(0, 1)] || null;
  return String(e.city || a.city || "").trim() || null;
}
function zones(list: PlanningEntry[]) {
  const counts = new Map<string, number>();
  for (const e of list) { if (cancelled(e)) continue; const z = zoneOf(e); if (z) counts.set(z, (counts.get(z) || 0) + 1); }
  return { dominant: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, all: [...counts.keys()] };
}
const isoWeek = (d: Date) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7)); return Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7); };

export interface WeekDayView { date: string; name: string; dateNum: string; month: string; today: boolean; locked: boolean; active: number; cancelled: number; zone: string | null; entries: PlanningEntry[] }
export function weekView(p: PlanningPayload, wanted: number, now = new Date()) {
  const b = weekBounds(p), offset = Math.min(Math.max(wanted, b.min), b.max);
  const sorted = [...weekDays(p, offset)].sort((x, y) => { const a = parseDate(x.date), c = parseDate(y.date); return !a ? 1 : !c ? -1 : a.getTime() - c.getTime(); });
  const total = sorted.reduce((s, d) => s + (d.customers?.length ?? 0), 0);
  const first = parseDate(sorted[0]?.date), last = parseDate(sorted[sorted.length - 1]?.date);
  const range = first && last ? `${DE(first, { day: "numeric", month: "short" })} – ${DE(last, { day: "numeric", month: "short" })}` : "";
  const word = offset === 0 ? "diese Woche" : offset === -1 ? "letzte Woche" : offset === 1 ? "nächste Woche" : `${Math.abs(offset)} Wochen ${offset < 0 ? "zurück" : "voraus"}`;
  const weekZones: string[] = []; for (const d of sorted) for (const z of zones(d.customers ?? []).all) if (!weekZones.includes(z)) weekZones.push(z);
  const meta = [`${total} Termin${total !== 1 ? "e" : ""} · ${word}`, `KW ${isoWeek(first || now)}${range ? ` (${range})` : ""}`, ...(weekZones.length ? [weekZones.join(", ")] : [])].join(" · ");
  const days: WeekDayView[] = sorted.map((d) => {
    const dd = parseDate(d.date), list = [...(d.customers ?? [])].sort(byStart), canc = list.filter(cancelled).length;
    return {
      date: d.date || "", name: d.shortLabel || (dd ? DE(dd, { weekday: "short" }).replace(".", "") : "?"), dateNum: dd ? String(dd.getDate()) : "–", month: dd ? DE(dd, { month: "short" }) : "",
      today: dd ? sameDay(dd, now) : false, locked: !!d.locked, active: list.length - canc, cancelled: canc, zone: zones(list).dominant,
      entries: list.map((c) => ({ ...c, entryId: String(c.id || `${d.date || ""}-${c.name || ""}`), dateLabel: d.dateLabel || "", dayLocked: !!d.locked })),
    };
  });
  return { offset, bounds: b, meta, days };
}
