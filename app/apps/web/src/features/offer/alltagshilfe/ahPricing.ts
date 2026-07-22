// AH client-side pricing, ported 1:1 from legacy computeAHGesamt (src/public/script.js).
// AH does NOT go through the server pricing engine (it returns an empty shell for
// "ah"); totals are computed here on the client.
import type { AhService } from "./ahPayload";
import { FREQ_PER_MONTH, parseDurationMinutes } from "./ahServices";

export const ANFAHRT_PER_EINSATZ = 7.96;
export const STUNDENSATZ_HND = 40.56;
export const STUNDENSATZ_AB = 53.04;
export const SERVICEPAUSCHALE = 1.2; // HnD + Selbstzahler only
export const DEFAULT_ENTLASTUNGSBETRAG = 131;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Zone {
  zone: number;
  billMin: number;
}

/** One-way travel minutes → zone. ≤0 → null (no zone; no travel time billed). */
export function computeZone(oneWayMinutes: number): Zone | null {
  if (!oneWayMinutes || oneWayMinutes <= 0) return null;
  const billMin = Math.max(10, Math.ceil(oneWayMinutes / 5) * 5);
  return { zone: (billMin - 10) / 5 + 1, billMin };
}

export interface SchedRow {
  dauer: string;
  regelmaessigkeit: string;
  dauerMin: number;
  reiseRoundMin: number;
  perVisitMin: number;
  freq: number;
  monthlyH: number;
}

interface SvcTotals {
  totalEinsaetze: number;
  totalMonatlichH: number;
  schedRows: SchedRow[];
}

function computeSvc(svc: AhService | undefined, reisezeitH: number): SvcTotals {
  const scheds = svc?.schedules ?? [];
  let totalEinsaetze = 0;
  let totalMonatlichH = 0;
  const schedRows: SchedRow[] = [];
  for (const sched of scheds) {
    const dauerH = parseDurationMinutes(sched.dauer || "") / 60;
    const freq = sched.regelmaessigkeit === "Einmalig" ? 1 : FREQ_PER_MONTH[sched.regelmaessigkeit] || 0;
    if (!dauerH || !freq) continue;
    const perVisitH = dauerH + reisezeitH;
    const monthlyH = perVisitH * freq;
    totalEinsaetze += freq;
    totalMonatlichH += monthlyH;
    schedRows.push({
      dauer: sched.dauer || "",
      regelmaessigkeit: sched.regelmaessigkeit || "",
      dauerMin: Math.round(dauerH * 60),
      reiseRoundMin: Math.round(reisezeitH * 60),
      perVisitMin: Math.round(perVisitH * 60),
      freq,
      monthlyH,
    });
  }
  return { totalEinsaetze, totalMonatlichH, schedRows };
}

export interface AhTotals {
  gesamt: number;
  eigenanteil: number;
  isSelbstzahler: boolean;
  servicepauschale: number;
  zone: Zone | null;
  allBase: number;
  // HnD
  gesamtBase: number;
  anfahrtTotal: number;
  leistungenTotal: number;
  totalEinsaetze: number;
  totalMonatlichH: number;
  schedRows: SchedRow[];
  // Alltagsbegleitung
  hasAb: boolean;
  abGesamtBase: number;
  abAnfahrtTotal: number;
  abLeistungenTotal: number;
  abTotalEinsaetze: number;
  abTotalMonatlichH: number;
  abSchedRows: SchedRow[];
}

export function computeAhTotals(
  services: AhService[],
  opts: { isSelbstzahler: boolean; zone: Zone | null; entlastungsbetrag: number },
): AhTotals {
  const { isSelbstzahler, zone, entlastungsbetrag } = opts;
  const reisezeitH = zone ? zone.billMin / 60 : 0;

  const hnd = computeSvc(services.find((s) => s.type === "Haushaltsnahedienstleistungen"), reisezeitH);
  const ab = computeSvc(services.find((s) => s.type === "Alltagsbegleitung"), reisezeitH);

  const anfahrtTotal = r2(hnd.totalEinsaetze * ANFAHRT_PER_EINSATZ);
  const leistungenTotal = r2(hnd.totalMonatlichH * STUNDENSATZ_HND);
  const gesamtBase = r2(anfahrtTotal + leistungenTotal);

  const abAnfahrtTotal = r2(ab.totalEinsaetze * ANFAHRT_PER_EINSATZ);
  const abLeistungenTotal = r2(ab.totalMonatlichH * STUNDENSATZ_AB);
  const abGesamtBase = r2(abAnfahrtTotal + abLeistungenTotal);

  const allBase = r2(gesamtBase + abGesamtBase);
  const servicepauschale = isSelbstzahler && hnd.totalMonatlichH > 0 ? SERVICEPAUSCHALE : 0;
  const gesamt = r2(allBase + servicepauschale);
  const eigenanteil = isSelbstzahler ? gesamt : r2(Math.max(0, gesamt - entlastungsbetrag));

  return {
    gesamt,
    eigenanteil,
    isSelbstzahler,
    servicepauschale,
    zone,
    allBase,
    gesamtBase,
    anfahrtTotal,
    leistungenTotal,
    totalEinsaetze: hnd.totalEinsaetze,
    totalMonatlichH: hnd.totalMonatlichH,
    schedRows: hnd.schedRows,
    hasAb: ab.totalMonatlichH > 0,
    abGesamtBase,
    abAnfahrtTotal,
    abLeistungenTotal,
    abTotalEinsaetze: ab.totalEinsaetze,
    abTotalMonatlichH: ab.totalMonatlichH,
    abSchedRows: ab.schedRows,
  };
}

/**
 * HnD "⚡ optimize": largest 5-min Dauer whose monthly price (incl. Anfahrt +
 * Reisezeit) still fits under the Entlastungsbetrag. Returns minutes (0 = none fits).
 */
export function optimizeDauerMinutes(
  regelmaessigkeit: string,
  opts: { reisezeitH: number; entlastungsbetrag: number },
): number {
  const freq = regelmaessigkeit === "Einmalig" ? 1 : FREQ_PER_MONTH[regelmaessigkeit];
  if (typeof freq !== "number") return 0;
  let best = 0;
  for (let m = 5; m <= 480; m += 5) {
    const price = r2(freq * ANFAHRT_PER_EINSATZ + (m / 60 + opts.reisezeitH) * freq * STUNDENSATZ_HND);
    if (price > opts.entlastungsbetrag) break;
    best = m;
  }
  return best;
}
