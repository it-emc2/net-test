// Alltagshilfe: ONE total for the screen, the offer documents, the online signing page, the send
// record and Bitrix (ADR 028, owner decisions 2026-11-20). computeAhPricing (ah.ts) stays the
// legacy-exact port (golden master of today's screen); every v2 consumer reads ahOfferTotals:
//  (2) no payer chosen = Kassenkunde (only "Selbstzahler" is a Selbstzahler, case-insensitive)
//  (3) Selbstzahler: net (Leistungen und Anfahrt) + 7 % MwSt = gross, the amount to pay; the
//      Servicepauschale (1,20 € for HnD) is NOT in the total, only a note — for both payers.
//      VAT rounding as the offer DOCX: vat = r2(net · 7 %), gross = r2(net + vat).
//      Kassenkunde: net (no VAT) − the ticked funding = Eigenanteil, rounded as the offer DOCX:
//      deductions = r2(sum of the sources), eigenanteil = r2(max(0, net − deductions))
//  (4) the deal amount in Bitrix (move and signature) and the send record's total = the
//      customer-facing monthly amount: gross for a Selbstzahler, net for a Kassenkunde — NOT the
//      Eigenanteil
// The Pflegegrad never refuses a deduction: the ticks decide (as today).
import { ahInputFromPayload, computeAhPricing, type AhPricingInput, type AhPricingResult, type AhService, type AhZone } from "./ah.js";

/** 7 % on top for a Selbstzahler (Buchhaltung 10/2026; the offer DOCX's AH_MWST_SATZ) */
export const AH_VAT_RATE_SZ = 0.07;
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const isAhSelbstzahler = (payer: unknown): boolean => String(payer ?? "").trim().toUpperCase() === "SELBSTZAHLER";

export interface AhDeductions {
  /** as ticked; × 2 with „2 Personen“ */
  entlastungsbetrag: number;
  verhinderungspflege: number;
  umwidmung: number;
  /** r2 of the three (not capped at the net amount — the DOCX prints it so) */
  total: number;
}

export interface AhOfferTotals {
  rules: "2026-11";
  payer: "Selbstzahler" | "Kassenkunde";
  /** Leistungen und Anfahrt pro Monat (no Servicepauschale) */
  net: number;
  vatRate: number;
  vat: number;
  /** net + vat (= net for a Kassenkunde) */
  gross: number;
  /** all 0 for a Selbstzahler */
  deductions: AhDeductions;
  /** Kassenkunde: max(0, net − deductions); Selbstzahler: gross */
  eigenanteil: number;
  /** what the customer pays per month: gross (Selbstzahler) or Eigenanteil (Kassenkunde) */
  amountToPay: number;
  /** the deal amount and the send record's total: gross (Selbstzahler) or net (Kassenkunde) */
  customerAmount: number;
  /** the Servicepauschale is billed separately (HnD only) — a note, never in the total */
  servicepauschaleNote: { show: boolean; amount: number };
  /** § 35a: min(cap, Eigenanteil × 12 × pct) — Kassenkunde only, as today */
  steuerabsetzJahr: number;
  /** the detail (hours, Anfahrt, zone …) of the legacy-exact function for this payer */
  detail: AhPricingResult;
}

export function ahOfferTotals(input: AhPricingInput): AhOfferTotals {
  const sz = isAhSelbstzahler(input.payer);
  const payer = sz ? "Selbstzahler" : "Kassenkunde";
  const detail = computeAhPricing({ ...input, payer });
  const net = detail.allBase;
  const vat = sz ? r2(net * AH_VAT_RATE_SZ) : 0;
  const gross = sz ? r2(net + vat) : net;
  const deductions: AhDeductions = sz
    ? { entlastungsbetrag: 0, verhinderungspflege: 0, umwidmung: 0, total: 0 }
    : {
      entlastungsbetrag: detail.entlastungsbetragMonat,
      verhinderungspflege: detail.verhinderungspflegeMonat,
      umwidmung: detail.umwidmungMonat,
      total: r2(detail.entlastungsbetragMonat + detail.verhinderungspflegeMonat + detail.umwidmungMonat),
    };
  const eigenanteil = sz ? gross : r2(Math.max(0, net - deductions.total));
  const steuerabsetzJahr = sz
    ? 0
    : r2(Math.min(input.config.steuerabsetzCapJahr || 4000, eigenanteil * 12 * ((input.config.steuerabsetzPct || 20) / 100)));
  return {
    rules: "2026-11",
    payer,
    net,
    vatRate: sz ? AH_VAT_RATE_SZ : 0,
    vat,
    gross,
    deductions,
    eigenanteil,
    amountToPay: sz ? gross : eigenanteil,
    customerAmount: sz ? gross : net,
    servicepauschaleNote: { show: detail.totalMonatlichH > 0, amount: detail.servicepauschale },
    steuerabsetzJahr,
    detail,
  };
}

// ---------------------------------------------------------------------------
// How the offer documents (DOCX, signing page, Bitrix fields) read a stored offer — kept exactly as
// the documents read it today so that no printed number changes (ADR 028; legacy docx-template
// buildAhData): services from `ah.services` (HnD first; an untyped service is neither kind), time
// rows only from `schedules`, durations "H:MM" or decimal hours, travel from the saved zone
// (Arbeitszeit.ahTravelZone) — without one the travel time itself (no zone rounding).
// The screen reads the same offer with ahInputFromPayload; both agree for every offer v2 writes
// (zone and travel time written together). Old offers whose saved zone does not match their travel
// time (e.g. Hof postcodes before the zone-1 rule) differ — see ADR 028.
// Owner 2026-11-23 (ADR 028 addendum): an offer that was NOT sent before is read with the screen's
// zone ("screen": travel time + Hof rule, as ahInputFromPayload); an offer that was already sent
// keeps the reading it went out with ("document", the default here). Only the zone differs between
// the two readings; the server decides which one applies (modules/sends zone-reading.ts).
export type AhZoneReading = "document" | "screen";
export const isAhZoneReading = (v: unknown): v is AhZoneReading => v === "document" || v === "screen";
type Loose = Record<string, any> | null | undefined;
const on = (v: unknown) => v === "on" || v === true;
const ORDER: Record<string, number> = { Haushaltsnahedienstleistungen: 0, Alltagsbegleitung: 1 };

/** "H:MM" or decimal hours → hours (the documents' parseHHMM) */
export function ahDocHours(str: unknown): number {
  if (!str) return 0;
  const s = String(str).trim();
  const i = s.indexOf(":");
  if (i !== -1) return (parseInt(s.slice(0, i), 10) || 0) + (parseInt(s.slice(i + 1), 10) || 0) / 60;
  return parseFloat(s) || 0;
}

/** the services as the documents list them (HnD first) */
export function ahDocServices(payload: Loose): any[] {
  const ah = (payload?.ah ?? {}) as Record<string, any>;
  return (Array.isArray(ah.services) ? ah.services : []).slice()
    .sort((a: any, b: any) => (ORDER[a?.type] ?? 99) - (ORDER[b?.type] ?? 99));
}

/** the zone exactly as the screen reads it (ahInputFromPayload: travel time + Hof rule, else the saved zone) */
export function ahScreenZone(payload: Loose): AhZone | null {
  return ahInputFromPayload(payload, { entlastungsbetragMonat: 0, steuerabsetzPct: 0, steuerabsetzCapJahr: 0 }).zone;
}

/** zone number and travel hours per visit as the documents read them (`reading`: see AhZoneReading) */
export function ahDocTravel(payload: Loose, reading: AhZoneReading = "document"): { zoneNum: number; travelTimeH: number } {
  if (reading === "screen") {
    const z = ahScreenZone(payload);
    return { zoneNum: z?.zone ?? 0, travelTimeH: z ? z.billMin / 60 : 0 };
  }
  const az = (payload?.Arbeitszeit ?? {}) as Record<string, any>;
  const zoneNum = parseInt(az.ahTravelZone || "0") || 0;
  return { zoneNum, travelTimeH: zoneNum > 0 ? ((zoneNum - 1) * 10 + 10) / 60 : ahDocHours(az.travelTimeHHMM || "") };
}

export function ahDocumentInput(payload: Loose, config: AhPricingInput["config"], reading: AhZoneReading = "document"): AhPricingInput {
  const kd = (payload?.Kundendaten ?? {}) as Record<string, any>;
  const fin = (payload?.Finanzierung ?? {}) as Record<string, any>;
  const { zoneNum, travelTimeH } = ahDocTravel(payload);
  const services: AhService[] = ahDocServices(payload).map((s: any) => ({
    type: s?.type,
    combinedVisit: !!s?.combinedVisit,
    tasks: Array.isArray(s?.tasks) ? s.tasks : [],
    schedules: (Array.isArray(s?.schedules) ? s.schedules : []).map((r: any) => ({ ...r, hours: ahDocHours(r?.dauer) })),
  }));
  return {
    services,
    // whole minutes for a saved zone (so billMin / 60 is the documents' own hours exactly)
    zone: reading === "screen" ? ahScreenZone(payload)
      : zoneNum > 0 ? { zone: zoneNum, billMin: (zoneNum - 1) * 10 + 10 } : travelTimeH > 0 ? { zone: 0, billMin: travelTimeH * 60 } : null,
    payer: String(kd.payer || ""),
    entlastungsbetragNutzen: on(fin.ahEntlastungsbetragNutzen),
    zweiPersonen: on(kd.ahZweiPersonen),
    verhinderungspflegeMonat: Number(fin.ahVerhinderungspflegeMonat) || 0,
    umwidmungBeantragt: on(fin.ahUmwidmungBeantragt),
    umwidmungBetrag: Number(fin.ahUmwidmungBetrag) || 0,
    config,
  };
}
