// Planning panel + week calendar of the Hauptmenü on the LEAN planning API (route-plannung #35, through
// our server which holds the key). Same screen as today's „Heutige Termine Planung“ / „Wochenkalender
// Vertrieb“, other data source. Pure functions — no React, no DOM.
//  Today: plan.termine in the planner's order (`order`); status fixed = „Termin fixiert“, cancelled = shown, not openable.
//  Search: lower case, no accents, ß = ss, over name, address, phone, e-mail and the date label.
//  Departure row: plan.departure + the first drive (min/km) + startLocation; return row: plan.returnAt + the last
//    appointment that takes place; travel rows from driveMinutesAfter/Km; pause card from plan.pause (+ charge).
//  Notes: adresshinweise and hinweise; warning line for tightByMinutes > 0 and stageAlert.
//  Full route: all not cancelled addresses, round trip from/to the start location.
//  Week: 7 days from /week?from=<Monday>, short entries (time, name, type, deal, status); tap loads that day.
//  Transfer into a new offer (as today's applyPlanningAppointmentToForm): first/last name, street/PLZ/city, phone, e-mail,
//    bitrixContactId, customerNumber (API, else the contact id — as today's UI), auftragId = deal, else contact, else id;
//    the salutation comes with the data; the Bitrix contact then fills the Anrede and EMPTY fields only.
export interface Termin {
  order?: number; id: string; status: "fixed" | "planned" | "cancelled"; offerType?: string | null; dealId?: string | number | null; bitrixContactId?: string | number | null;
  customerNumber?: string | number | null; salutation?: string; firstName?: string; lastName?: string; name?: string; street?: string; zip?: string; city?: string; address?: string;
  phone?: string | null; email?: string | null; hinweise?: string | null; adresshinweise?: string | null; start?: string; end?: string; durationMinutes?: number;
  tightByMinutes?: number; driveKmBefore?: number; driveKmAfter?: number; driveMinutesBefore?: number; driveMinutesAfter?: number; stageAlert?: unknown;
}
export interface Plan {
  date: string; generatedAt?: string; dayLocked?: boolean; departure?: string | null; returnAt?: string | null; totalKm?: number; termine: Termin[];
  startLocation?: { name?: string; street?: string; zip?: string; city?: string } | null;
  pause?: { start?: string; end?: string; durationMinutes?: number } | null; charge?: { name?: string; power?: string | number } | null;
}
export interface TodayPayload { ok?: boolean; updatedAt?: string; plan?: Plan | null }
export interface WeekEntry { id: string; start?: string; end?: string; name?: string; offerType?: string | null; dealId?: string | number | null; status?: string }
export interface WeekPayload { from?: string; generatedAt?: string; days?: { date: string; entries?: WeekEntry[] }[] }

/** the card/the offer picker work on this */
export interface PlanningEntry {
  id?: string; entryId: string; name?: string; address?: string; phone?: string; email?: string; importDealId?: string | number; contactId?: string | number;
  manualStartMinutes?: number; duration?: number; cancelled?: boolean; locked?: boolean; dayLocked?: boolean; taetigkeitenBadge?: string; hinweise?: string; adresshinweise?: string;
  street?: string; postalCode?: string; city?: string; dateLabel: string; salutation?: string; firstName?: string; lastName?: string; customerNumber?: string | number;
  tightBy?: number; stageAlert?: string; driveBefore?: { min?: number; km?: number }; driveAfter?: { min?: number; km?: number };
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (v: string) => new Date(`${v}T12:00:00`);
const DE = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("de-DE", o);
export const cancelled = (e: { cancelled?: unknown }) => e.cancelled === true;
export const clock = (m: number) => { const w = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`; };
const minutes = (hm?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : undefined; };
export const startClock = (e: { manualStartMinutes?: number }) => (Number.isFinite(Number(e.manualStartMinutes)) && e.manualStartMinutes != null && e.manualStartMinutes >= 0 ? clock(e.manualStartMinutes) : null);
const str = (v: unknown) => (v == null ? "" : String(v));
const alertText = (v: unknown): string => (typeof v === "string" ? v : v && typeof v === "object" ? str((v as Record<string, unknown>).message ?? (v as Record<string, unknown>).text ?? (v as Record<string, unknown>).label) : "");

export function entryOf(t: Termin, dateLabel: string, dayLocked: boolean): PlanningEntry {
  const start = minutes(t.start);
  return {
    id: t.id, entryId: t.id, name: t.name || [t.firstName, t.lastName].filter(Boolean).join(" "), address: t.address || [t.street, [t.zip, t.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    phone: str(t.phone), email: str(t.email), ...(t.dealId ? { importDealId: String(t.dealId) } : {}), ...(t.bitrixContactId ? { contactId: String(t.bitrixContactId) } : {}),
    ...(start != null ? { manualStartMinutes: start } : {}), ...(t.durationMinutes ? { duration: t.durationMinutes } : {}), cancelled: t.status === "cancelled", locked: t.status === "fixed", dayLocked, dateLabel,
    ...(t.offerType ? { taetigkeitenBadge: t.offerType } : {}), ...(t.hinweise ? { hinweise: t.hinweise } : {}), ...(t.adresshinweise ? { adresshinweise: t.adresshinweise } : {}),
    street: t.street || "", postalCode: t.zip || "", city: t.city || "", salutation: t.salutation || "", firstName: t.firstName || "", lastName: t.lastName || "", ...(t.customerNumber ? { customerNumber: t.customerNumber } : {}),
    ...(Number(t.tightByMinutes) > 0 ? { tightBy: Number(t.tightByMinutes) } : {}), ...(alertText(t.stageAlert) ? { stageAlert: alertText(t.stageAlert) } : {}),
    driveBefore: { ...(t.driveMinutesBefore != null ? { min: t.driveMinutesBefore } : {}), ...(t.driveKmBefore != null ? { km: t.driveKmBefore } : {}) },
    driveAfter: { ...(t.driveMinutesAfter != null ? { min: t.driveMinutesAfter } : {}), ...(t.driveKmAfter != null ? { km: t.driveKmAfter } : {}) },
  };
}

/** today's day: appointments in the planner's order, the day's own rows, the label */
export function todayModel(payload: TodayPayload | null | undefined) {
  const plan = payload?.plan ?? null;
  const dateLabel = plan?.date ? DE(parseDay(plan.date), { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : DE(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const entries = [...(plan?.termine ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => entryOf(t, dateLabel, !!plan?.dayLocked));
  const sl = plan?.startLocation;
  const home = sl ? { name: sl.name || "Firma", address: [sl.street, [sl.zip, sl.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") } : null;
  return { plan, entries, dateLabel, home };
}

export const normalize = (v: unknown) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
const blob = (e: PlanningEntry) => [e.name, e.address, e.phone, e.email, e.dateLabel].filter(Boolean).join(" ");
export const searchEntries = (list: PlanningEntry[], q: string) => { const n = normalize(q.trim()); return n ? list.filter((e) => normalize(blob(e)).includes(n)) : list; };
export const typeTone = (t?: string) => ({ BU: "bu", BWT: "bwt", HMS: "hms", WD: "hms", HL: "hl", AH: "ah" } as Record<string, string>)[(t || "").toUpperCase()] ?? "manual";
export const subtitle = (e: PlanningEntry) => (cancelled(e) ? "Termin abgesagt" : e.dayLocked ? "Tag gesperrt" : e.locked ? "Termin fixiert" : "Planungstermin");

/** where the pause card goes: after the last appointment starting before the pause (none after: the last) */
export function pause(p: Plan["pause"], entries: PlanningEntry[]): { text: string; index: number; from: string; to: string; min: number } | null {
  if (!p || !(Number(p.durationMinutes) > 0)) return null;
  const at = minutes(p.start);
  let index = entries.length - 1;
  if (at != null) { const after = entries.findIndex((e) => Number(e.manualStartMinutes) > at); if (after !== -1) index = Math.max(after - 1, 0); }
  return { text: p.start && p.end ? `Pause ${p.start} – ${p.end}` : "Pause", index, from: p.start || "", to: p.end || "", min: Number(p.durationMinutes) };
}
export const phoneHref = (v?: string) => String(v || "").trim().replace(/[^+\d]/g, "");
export const routeHref = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
export function fullRouteHref(entries: PlanningEntry[], origin: string): string | null {
  const stops = entries.filter((e) => !cancelled(e) && e.address).map((e) => e.address!);
  if (!stops.length || !origin) return null;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin, destination: origin, waypoints: stops.join("|"), travelmode: "driving" })}`;
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
  // the lean API splits the name itself (last blank); a single word is a lastName there, but today puts it
  // into the first name — kept as today until the owner decides (docs/rewrite/MODULARIZATION-PLAN.md)
  const n = e.firstName || e.lastName ? (e.firstName ? { firstName: e.firstName, lastName: e.lastName || "" } : { firstName: e.lastName!, lastName: "" }) : parseName(e.name || ""), a = parseAddress(e.address || "");
  const contact = e.contactId ? String(e.contactId) : "";
  return {
    kunde: {
      firstName: n.firstName, lastName: n.lastName, phone: e.phone || "", email: e.email || "",
      street: e.street || a.street, postalCode: e.postalCode || a.postalCode, city: e.city || a.city,
      bitrixContactId: contact, customerNumber: e.customerNumber ? String(e.customerNumber) : contact, company: "", country: "", state: "",
      ...(e.salutation ? { salutation: e.salutation } : {}),
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

/** leaving time of the day, as the planner gives it: null when unknown */
export const departure = (hm: string | null | undefined): string | null => (minutes(hm) != null ? (hm as string).slice(0, 5) : null);

// ---- week calendar ----
export const mondayKey = (d: Date, weeks = 0) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() + (m.getDay() === 0 ? -6 : 1 - m.getDay()) + weeks * 7); return dayKey(m); };
export const weekBadge = (status?: string) => (status === "cancelled" ? "Abgesagt" : status === "fixed" ? "Fixiert" : "Termin");
const isoWeek = (d: Date) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7)); return Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7); };
export interface WeekDayView { date: string; name: string; dateNum: string; month: string; today: boolean; active: number; cancelled: number; entries: (WeekEntry & { startMin?: number })[] }
export function weekModel(w: WeekPayload | null | undefined, offset: number, now = new Date()) {
  const days: WeekDayView[] = (w?.days ?? []).map((d) => {
    const dd = parseDay(d.date), list = [...(d.entries ?? [])].map((e) => ({ ...e, startMin: minutes(e.start) })).sort((a, b) => (a.startMin ?? Infinity) - (b.startMin ?? Infinity));
    const canc = list.filter((e) => e.status === "cancelled").length;
    return { date: d.date, name: DE(dd, { weekday: "short" }).replace(".", ""), dateNum: String(dd.getDate()), month: DE(dd, { month: "short" }), today: d.date === dayKey(now), active: list.length - canc, cancelled: canc, entries: list };
  });
  const total = days.reduce((n, d) => n + d.entries.length, 0);
  const first = days[0] && parseDay(days[0].date), last = days.length ? parseDay(days[days.length - 1]!.date) : null;
  const word = offset === 0 ? "diese Woche" : offset === -1 ? "letzte Woche" : offset === 1 ? "nächste Woche" : `${Math.abs(offset)} Wochen ${offset < 0 ? "zurück" : "voraus"}`;
  const range = first && last ? ` (${DE(first, { day: "numeric", month: "short" })} – ${DE(last, { day: "numeric", month: "short" })})` : "";
  return { days, meta: `${total} Termin${total !== 1 ? "e" : ""} · ${word} · KW ${isoWeek(first || now)}${range}` };
}
