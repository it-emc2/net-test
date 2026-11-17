// Hauptmenü rules, as today's UI (script.js, ux.js P7-1, quickwins C5, deal-draft.js U-016).
//  „Öffnen“ field (P7-1): digits (1–12) = deal number · ANG + digits = offer number · else text search.
//  Today's appointments (C5): planning.futurePlanned of today (plannedDate = local yyyy-mm-dd), else
//    planning.days of today; sorted by start minute (none = last, stable); cancelled = shown, not openable.
//  Time: "HH:MM · N Min" (start wraps at 24 h), only start, only duration, or "Dauer offen".
//  Device list (U-016): pending (dirty/conflict) first, then up to 3 transferred, at most 8;
//    state: conflict "⚠ an anderer Stelle geändert", dirty "● wartet auf Internet", else "✓ übertragen".
import { DEAL_NUMBER_RE, TEMP_DRAFT_KEY_RE } from "@oc/api-contract";

export type OpenKind = "deal" | "offer" | "text" | "";
export function classifyOpen(raw: string): { kind: OpenKind; value: string } {
  const v = raw.trim();
  if (!v) return { kind: "", value: "" };
  if (DEAL_NUMBER_RE.test(v)) return { kind: "deal", value: v };
  if (/^ANG[-\s]?\d+/i.test(v)) return { kind: "offer", value: v.toUpperCase() };
  return { kind: "text", value: v };
}

export interface Appointment {
  id?: string; name?: string; address?: string; phone?: string; email?: string; importDealId?: string | number;
  manualStartMinutes?: number; duration?: number; cancelled?: unknown; locked?: boolean; hinweise?: string;
  plannedDate?: string; taetigkeitenBadge?: string;
}
type Planning = { futurePlanned?: Appointment[]; days?: { date?: string; customers?: Appointment[] }[] } | null | undefined;

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function todaysAppointments(planning: Planning, now = new Date()): Appointment[] {
  const key = localDay(now);
  const fromFuture = (planning?.futurePlanned ?? []).filter((c) => c?.plannedDate === key);
  const list = fromFuture.length ? fromFuture : (planning?.days ?? []).find((d) => d?.date && localDay(new Date(d.date)) === key)?.customers ?? [];
  const start = (a: Appointment) => (Number.isFinite(Number(a.manualStartMinutes)) && a.manualStartMinutes != null ? Number(a.manualStartMinutes) : Infinity);
  return list.map((a, i) => ({ ...a, id: String(a.id ?? `${key}-${i}`) })).sort((a, b) => (start(a) === start(b) ? 0 : start(a) < start(b) ? -1 : 1));
}

export const isCancelled = (a: Appointment) => a.cancelled === true || a.cancelled === "true" || a.cancelled === 1 || a.cancelled === "1";
const clock = (m: number) => { const w = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`; };
export function timeLabel(a: Appointment): string {
  const s = a.manualStartMinutes != null && Number(a.manualStartMinutes) >= 0 && Number.isFinite(Number(a.manualStartMinutes)) ? clock(Number(a.manualStartMinutes)) : null;
  const d = Number(a.duration) > 0 ? `${Number(a.duration)} Min` : null;
  return s && d ? `${s} · ${d}` : s ?? d ?? "Dauer offen";
}

export interface DeviceDraft { key: string; offerType?: string; title?: string; localAt?: number; dirty?: boolean; conflict?: boolean }
export function shownDrafts(all: DeviceDraft[]): DeviceDraft[] {
  const pending = all.filter((r) => r.dirty || r.conflict);
  return pending.concat(all.filter((r) => !r.dirty && !r.conflict).slice(0, 3)).slice(0, 8);
}
export const draftState = (r: DeviceDraft) => (r.conflict ? "⚠ an anderer Stelle geändert" : r.dirty ? "● wartet auf Internet" : "✓ übertragen");
export const isTempKey = (k: string) => TEMP_DRAFT_KEY_RE.test(k);
