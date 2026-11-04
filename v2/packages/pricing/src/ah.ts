// AH (Alltagshilfe) pricing — extracted from the legacy browser code
// src/public/script.js (main@4b6002a): computeAHGesamt() ~12433, computeAHZoneFromMinutes()
// ~12383, getAHZoneData() ~12391, parseDurationMinutes() ~1817, getAHEntlastungsbetragMonat()
// ~6929. The legacy version reads the DOM; here every input is explicit. Arithmetic order and
// constants are kept 1:1 (golden master: tests/golden/fixtures/ah, built from the real UI).

export const AH_FREQ: Readonly<Record<string, number>> = {
  "Wöchentlich": 52 / 12,
  "14-tägig": 26 / 12,
  "alle drei Wochen": 52 / 3 / 12,
  "Monatlich": 1,
  "Vierteljährlich": 4 / 12,
  "Halbjährlich": 2 / 12,
  "Jährlich": 1 / 12,
};
/** Hard-coded in the legacy client (not admin-configurable today). */
export const AH_CONSTANTS = Object.freeze({
  ANFAHRT_PER_EINSATZ: 7.96,
  STUNDENSATZ_HND: 40.56,
  STUNDENSATZ_AB: 53.04,
  SERVICEPAUSCHALE: 1.2,
  AB_KM_RATE: 0.35,
});
/** Hof city PLZs: always Zone 1 up to 15 min one way. */
export const AH_ZONE1_PLZ = ["95026", "95028", "95030", "95032"] as const;

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** "HH:MM" → minutes; anything else → 0 (legacy parseDurationMinutes). */
export function parseDurationMinutes(value: unknown): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export interface AhZone { zone: number; billMin: number }

/** Billing zone from one-way travel minutes (legacy computeAHZoneFromMinutes). */
export function computeAhZoneFromMinutes(oneWayMinutes: number, postalCode: string = ""): AhZone {
  let mins = oneWayMinutes;
  if ((AH_ZONE1_PLZ as readonly string[]).includes(String(postalCode).trim()) && mins <= 15) mins = 10;
  const billMin = Math.max(10, Math.ceil(mins / 10) * 10);
  return { zone: (billMin - 10) / 10 + 1, billMin };
}

/** Zone from an explicit zone number (legacy getAHZoneData step 2). */
export function ahZoneFromNumber(zone: number): AhZone | null {
  const z = Number.parseInt(String(zone ?? "0"), 10) || 0;
  return z ? { zone: z, billMin: (z - 1) * 10 + 10 } : null;
}

export interface AhSchedule { dauer?: string; regelmaessigkeit?: string; [k: string]: unknown }
export interface AhService {
  type?: string; // "Haushaltsnahedienstleistungen" | "Alltagsbegleitung"
  schedules?: AhSchedule[];
  schedule?: AhSchedule;
  combinedVisit?: boolean;
  tasks?: unknown[];
  [k: string]: unknown;
}

export interface AhPricingInput {
  services: AhService[];
  zone: AhZone | null;
  /** Value of the checked payer radio ("Selbstzahler" | "Kassenkunde" | ""). */
  payer: string;
  entlastungsbetragNutzen: boolean;
  zweiPersonen: boolean;
  verhinderungspflegeMonat: number;
  umwidmungBeantragt: boolean;
  umwidmungBetrag: number;
  config: { entlastungsbetragMonat: number; steuerabsetzPct: number; steuerabsetzCapJahr: number };
}

export function computeAhPricing(input: AhPricingInput) {
  const { ANFAHRT_PER_EINSATZ, STUNDENSATZ_HND, STUNDENSATZ_AB, SERVICEPAUSCHALE, AB_KM_RATE } = AH_CONSTANTS;
  const zoneData = input.zone;
  const reisezeitH = zoneData ? zoneData.billMin / 60 : 0;

  function computeSvc(svc: AhService | undefined) {
    const scheds = svc ? svc.schedules || (svc.schedule ? [svc.schedule] : []) : [];
    let totalEinsaetze = 0;
    let totalMonatlichH = 0;
    const schedRows: Array<Record<string, unknown>> = [];
    for (const sched of scheds) {
      const dauerH = parseDurationMinutes(sched.dauer || "") / 60;
      const freq = AH_FREQ[sched.regelmaessigkeit as string] || 0;
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

  const hndSvc = input.services.find((s) => s.type === "Haushaltsnahedienstleistungen");
  const abSvc = input.services.find((s) => s.type === "Alltagsbegleitung");
  const hnd = computeSvc(hndSvc);
  const ab = computeSvc(abSvc);
  const isSelbstzahler = input.payer === "Selbstzahler";

  const anfahrtTotal = r2(hnd.totalEinsaetze * ANFAHRT_PER_EINSATZ);
  const leistungenTotal = r2(hnd.totalMonatlichH * STUNDENSATZ_HND);
  const gesamtBase = r2(anfahrtTotal + leistungenTotal);

  const abCombinedVisit = !!(abSvc && abSvc.combinedVisit);
  const abSharedEinsaetze = abCombinedVisit ? Math.min(hnd.totalEinsaetze, ab.totalEinsaetze) : 0;
  const abSharedReiseH = abSharedEinsaetze * reisezeitH;
  ab.totalMonatlichH = Math.max(0, ab.totalMonatlichH - abSharedReiseH);
  const abAnfahrtEinsaetze = ab.totalEinsaetze - abSharedEinsaetze;
  const abAnfahrtTotal = r2(abAnfahrtEinsaetze * ANFAHRT_PER_EINSATZ);
  const abLeistungenTotal = r2(ab.totalMonatlichH * STUNDENSATZ_AB);
  const abGesamtBase = r2(abAnfahrtTotal + abLeistungenTotal);

  const allBase = r2(gesamtBase + abGesamtBase);
  const gesamt = r2(allBase + (isSelbstzahler && hnd.totalMonatlichH > 0 ? SERVICEPAUSCHALE : 0));

  const entlastungsbetragNutzen = input.entlastungsbetragNutzen;
  const entlastungsbetragMonat = entlastungsbetragNutzen
    ? input.config.entlastungsbetragMonat * (input.zweiPersonen ? 2 : 1)
    : 0;
  const verhinderungspflegeMonat = Number(input.verhinderungspflegeMonat) || 0;
  const umwidmungMonat = input.umwidmungBeantragt ? Number(input.umwidmungBetrag) || 0 : 0;
  const eigenanteil = isSelbstzahler
    ? gesamt
    : r2(Math.max(0, gesamt - entlastungsbetragMonat - verhinderungspflegeMonat - umwidmungMonat));

  const steuerabsetzJahr = isSelbstzahler
    ? 0
    : r2(Math.min(input.config.steuerabsetzCapJahr || 4000, eigenanteil * 12 * ((input.config.steuerabsetzPct || 20) / 100)));

  return {
    gesamt,
    eigenanteil,
    entlastungsbetragNutzen,
    entlastungsbetragMonat,
    verhinderungspflegeMonat,
    umwidmungMonat,
    steuerabsetzJahr,
    gesamtBase,
    anfahrtTotal,
    leistungenTotal,
    totalEinsaetze: hnd.totalEinsaetze,
    totalMonatlichH: hnd.totalMonatlichH,
    tasks: hndSvc ? hndSvc.tasks || [] : [],
    isSelbstzahler,
    servicepauschale: SERVICEPAUSCHALE,
    zoneData,
    schedRows: hnd.schedRows,
    hasAb: ab.totalMonatlichH > 0,
    abTotalEinsaetze: ab.totalEinsaetze,
    abAnfahrtEinsaetze,
    abSharedEinsaetze,
    abSharedReiseH,
    abCombinedVisit,
    abTotalMonatlichH: ab.totalMonatlichH,
    abAnfahrtTotal,
    abLeistungenTotal,
    abGesamtBase,
    abTasks: abSvc ? abSvc.tasks || [] : [],
    abSchedRows: ab.schedRows,
    abKmRate: AB_KM_RATE,
    allBase,
  };
}

export type AhPricingResult = ReturnType<typeof computeAhPricing>;
