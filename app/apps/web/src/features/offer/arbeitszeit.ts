// Arbeitszeit (work-time) derivation — ports the legacy updateTotalHours math.
import { api } from "@/lib/api";
import type { Kundendaten } from "./payload";

/** Total available hours per day before travel. */
export const DAILY_CAP_H = 9.75;

export function hhmmToHours(hhmm: string): number {
  const s = String(hhmm || "").trim();
  if (!s) return 0;
  const [h, m] = s.split(":");
  const hours = Number(h) || 0;
  const mins = Number(m) || 0;
  return Math.round((hours + mins / 60) * 100) / 100;
}

export function hoursToHHMM(hours: number): string {
  const h = Math.max(0, Number(hours) || 0);
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}:00`;
  return `${whole}:${String(mins).padStart(2, "0")}`;
}

export function secondsToHHMM(seconds: number): string {
  return hoursToHHMM((Number(seconds) || 0) / 3600);
}

export interface ArbeitszeitInputs {
  laborHoursHHMM: string;
  travelTimeHHMM: string; // one-way
  uebernachten: string;
  travelSecondWorkerRate: number;
  distanceKm: string;
}

export interface ArbeitszeitDerived {
  workDays: number;
  travelDays: number;
  ArbeitHoursNumeric: number;
  ReiseHoursNumeric: number;
  totalHoursNumeric: number;
  totalHoursHHMM: string;
  /** True when one-way travel is so long a full workday can't fit. */
  infeasible: boolean;
}

/**
 * Days = ceil(workHours / (9.75 − 2×oneWayTravel)); total hours add round-trip
 * travel per day. Overnights clamp to [0, days−1]; travelDays = days − overnights.
 */
export function computeArbeitszeit(inp: ArbeitszeitInputs): ArbeitszeitDerived {
  const arbeitsH = hhmmToHours(inp.laborHoursHHMM);
  const reiseOneH = hhmmToHours(inp.travelTimeHHMM);
  const capPerDayH = DAILY_CAP_H - 2 * reiseOneH;

  let days = 0;
  let totalH = 0;
  let infeasible = false;

  if (arbeitsH > 0) {
    if (capPerDayH > 0) {
      days = Math.ceil(arbeitsH / capPerDayH);
      totalH = Math.round((arbeitsH + days * (2 * reiseOneH)) * 100) / 100;
    } else {
      infeasible = true;
    }
  }

  const reiseHoursNumeric = Math.round(days * 2 * reiseOneH * 100) / 100;
  const overnightsRaw = Math.max(0, parseInt(inp.uebernachten, 10) || 0);
  const overnights = Math.min(overnightsRaw, Math.max(0, days - 1));
  const travelDays = Math.max(0, days - overnights);

  return {
    workDays: days,
    travelDays,
    ArbeitHoursNumeric: arbeitsH,
    ReiseHoursNumeric: reiseHoursNumeric,
    totalHoursNumeric: totalH,
    totalHoursHHMM: hoursToHHMM(totalH),
    infeasible,
  };
}

export interface DistanceResult {
  oneWayKm: number;
  roundTripKm: number;
  oneWaySeconds: number;
}

export function suggestDistance(kundendaten: Kundendaten): Promise<DistanceResult> {
  return api.post<DistanceResult>("/api/routing/suggest-distance", {
    Kundendaten: {
      street: kundendaten.street,
      postalCode: kundendaten.postalCode,
      city: kundendaten.city,
      country: (kundendaten as any).country ?? "",
      state: (kundendaten as any).state ?? "",
    },
  });
}
