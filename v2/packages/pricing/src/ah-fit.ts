// AH budget mode ("Im Budget bleiben"): the durations per visit are computed so that the monthly
// price fits the Entlastungsbetrag. Port of today's "⚡ Gesamtzeit auf Entlastungsbetrag optimieren"
// (src/public/script.js optimizeAllForEntlastungsbetrag + maxMinsForBudget):
//  - every time row with a duration and a priced rhythm takes part ("Einmalig" is not priced → left as is)
//  - ONE shared factor k scales the rows' base durations (keeps their ratio); a row gets
//    max(5, min(cap, floor(base·k / 5)·5)) minutes — at least 5 minutes, never 0
//  - cap of a row = the longest 5-minute duration (≤ 8 h) whose own monthly price (Anfahrt +
//    travel time + work, visits rarer than monthly counted as one per month) fits the budget
//  - k = the largest factor at which the whole AH price (computeAhPricing().allBase: zone,
//    "Gleicher Termin", 2 Personen all count) is ≤ budget — binary search, 40 steps
// v2 adds one step (UX-CHANGES U-048): afterwards rows get 5 more minutes, one step at a time and
// the row furthest below its share first, while the price still fits — so no single row could
// take 5 more minutes within the budget, and fitting a fitted offer changes nothing (without this
// step neither holds: two rows bumped at the same factor step leave money unused that one of them
// alone would fit into). Rows that cost the same per minute keep their ratio within 5 minutes;
// a much cheaper row (e.g. "Jährlich" next to "Wöchentlich") takes up what the dearer one cannot.
// Nothing fits even at 5 minutes per row → `fits: false` and the base durations are returned.
import { AH_CONSTANTS, AH_FREQ, computeAhPricing, parseDurationMinutes, type AhPricingInput, type AhSchedule, type AhService } from "./ah.js";

export const AH_FIT_STEP_MIN = 5;
export const AH_FIT_MAX_MIN = 480;

/** minutes → "H:MM" as today's page stores a duration ("1:30", "0:45"); 0 → "" */
export const ahDauer = (min: number): string => (min > 0 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` : "");

/** the longest duration (5-minute steps, ≤ 8 h) at which ONE row alone fits the budget (legacy maxMinsForBudget) */
export function ahRowCap(freq: number, rate: number, budget: number, travelH: number): number {
  const f = Math.max(freq, 1);
  let best = 0;
  for (let m = AH_FIT_STEP_MIN; m <= AH_FIT_MAX_MIN; m += AH_FIT_STEP_MIN) {
    const price = Math.round((f * AH_CONSTANTS.ANFAHRT_PER_EINSATZ + (m / 60 + travelH) * f * rate) * 100) / 100;
    if (price > budget) break;
    best = m;
  }
  return best;
}

export interface AhFitResult {
  /** the services with the fitted durations (other fields untouched; time rows as `schedules`) */
  services: AhService[];
  /** false: even 5 minutes per row exceed the budget — the base durations are returned */
  fits: boolean;
  /** allBase of the returned services */
  total: number;
}

/**
 * Fit the durations of `input.services` into `budget`.
 * `base[i][j]` = the base minutes of service i, time row j (the user's own durations; the ratio is
 * kept between these). Missing entries fall back to the row's current duration.
 */
export function fitAhToBudget(input: AhPricingInput, budget: number, base: ReadonlyArray<ReadonlyArray<number | undefined> | undefined> = []): AhFitResult {
  const travelH = input.zone ? input.zone.billMin / 60 : 0;
  const services: AhService[] = input.services.map((s) => {
    const rows: AhSchedule[] = s.schedules ?? (s.schedule ? [s.schedule] : []);
    const { schedule: _old, ...rest } = s;
    return { ...rest, schedules: rows.map((r) => ({ ...r })) };
  });
  interface Row { i: number; j: number; base: number; cap: number }
  const rows: Row[] = [];
  services.forEach((s, i) => s.schedules!.forEach((sched, j) => {
    const b = base[i]?.[j] ?? parseDurationMinutes(sched.dauer);
    const freq = AH_FREQ[String(sched.regelmaessigkeit ?? "")];
    if (!b || typeof freq !== "number") return;
    const rate = s.type === "Haushaltsnahedienstleistungen" ? AH_CONSTANTS.STUNDENSATZ_HND : AH_CONSTANTS.STUNDENSATZ_AB;
    rows.push({ i, j, base: b, cap: ahRowCap(freq, rate, budget, travelH) });
  }));
  const priceOf = () => computeAhPricing({ ...input, services }).allBase;
  const set = (r: Row, m: number) => { services[r.i]!.schedules![r.j]!.dauer = ahDauer(m); };
  if (!rows.length) return { services, fits: true, total: priceOf() };

  const minsAt = (r: Row, k: number) => Math.max(AH_FIT_STEP_MIN, Math.min(r.cap, Math.floor((r.base * k) / AH_FIT_STEP_MIN) * AH_FIT_STEP_MIN));
  const priceAt = (k: number) => { rows.forEach((r) => set(r, minsAt(r, k))); return priceOf(); };

  if (priceAt(0) > budget) {
    rows.forEach((r) => set(r, r.base));
    return { services, fits: false, total: priceOf() };
  }
  let lo = 0, hi = Math.max(...rows.map((r) => r.cap / r.base)) + 0.01;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (priceAt(mid) <= budget) lo = mid; else hi = mid;
  }
  const mins = rows.map((r) => minsAt(r, lo));
  rows.forEach((r, n) => set(r, mins[n]!));

  // v2: fill what is left, 5 minutes at a time, the row furthest below its share first
  for (;;) {
    const order = rows.map((_r, n) => n).sort((a, b) => mins[a]! / rows[a]!.base - mins[b]! / rows[b]!.base || a - b);
    let grown = false;
    for (const n of order) {
      const r = rows[n]!;
      if (mins[n]! + AH_FIT_STEP_MIN > Math.min(r.cap, AH_FIT_MAX_MIN)) continue;
      set(r, mins[n]! + AH_FIT_STEP_MIN);
      if (priceOf() <= budget) { mins[n] = mins[n]! + AH_FIT_STEP_MIN; grown = true; break; }
      set(r, mins[n]!);
    }
    if (!grown) break;
  }
  return { services, fits: true, total: priceOf() };
}
