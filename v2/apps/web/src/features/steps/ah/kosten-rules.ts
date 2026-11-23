// Alltagshilfe · Kosten (UX-CHANGES U-051): a read-only page, one card per booked service with
// today's table rows (script.js __buildAHKostenHTML, AH branch) and the one shared total block
// (Summary.tsx). Nothing is calculated here: every figure is read from ahOfferTotals().detail
// (computeAhPricing); this file only picks and formats them — today's wording:
//  - HnD card when it has hours (totalMonatlichH > 0), AB card when it has hours (hasAb)
//  - row „Leistungen (inkl. Fahrtzeit Hinfahrt)“: hours as decimal „8,13 h“ × rate (40,56 / 53,04 €) = sum
//  - row „Anfahrtspauschale“ (AB: „kombiniert mit HnD“ when the visit is shared): visits „4,33×“ × 7,96 € = sum
//  - subtotal „Gesamt HnD-Leistungen“ / „Gesamt / Monat“ (AB): the service's net (no Servicepauschale —
//    ADR 028: it is a note on the total block, for a Selbstzahler too)
//  - details without a click: one line per time row (rhythm, minutes + Hinfahrt = per visit), one for the zone
//  - AB: footnote „Fahrten im Rahmen der Alltagsbegleitung: 0,35 € / km …“
import { AH_CONSTANTS, type AhOfferTotals } from "@oc/pricing";
import type { Kind } from "./rules.js";

export interface KostenRow {
  key: "hours" | "visits";
  label: string;
  /** muted addition to the label (today's small grey text) */
  hint?: string;
  qty: string;
  unit: string;
  total: string;
  /** narrow screens join qty and unit with „×“ (not for „4,33×“) */
  times: boolean;
}
export interface KostenService {
  kind: Kind;
  title: string;
  rows: KostenRow[];
  subtotal: { label: string; value: string };
  /** muted lines under the table: time rows, then the zone */
  details: { kind: "rhythm" | "zone" | "no-zone"; text: string }[];
  /** AB only */
  footnote?: string;
}

/** today's fmtH: 8.125 → „8,13 h“ */
export const hoursText = (h: number) => `${(Math.round((Number(h) || 0) * 100) / 100).toFixed(2).replace(".", ",")} h`;
/** today's fmtNum + „×“: 4.333 → „4,33×“ */
export const visitsText = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(n) || 0)}×`;

type Sched = { regelmaessigkeit?: unknown; dauerMin?: unknown; reiseRoundMin?: unknown; perVisitMin?: unknown };
const rhythmLine = (r: Sched) => `${String(r.regelmaessigkeit || "")} · ${r.dauerMin} min + ${r.reiseRoundMin} min Hinfahrt = ${r.perVisitMin} min pro Einsatz`;
function detailsOf(t: AhOfferTotals, rows: Sched[]): KostenService["details"] {
  const z = t.detail.zoneData;
  return [
    ...rows.map((r) => ({ kind: "rhythm" as const, text: rhythmLine(r) })),
    z
      ? { kind: "zone" as const, text: `Zone ${z.zone} · Hinfahrt ${z.billMin} min pro Einsatz (im Stundensatz enthalten · Rückfahrt wird nicht berechnet)` }
      : { kind: "no-zone" as const, text: "Keine Zone bestimmt." },
  ];
}

/** the cards of the page, in today's order (HnD, then Alltagsbegleitung); none when nothing is booked */
export function kostenServices(t: AhOfferTotals, fmt: (n: number) => string): KostenService[] {
  const d = t.detail, out: KostenService[] = [];
  if (d.totalMonatlichH > 0) {
    out.push({
      kind: "hnd", title: "Haushaltsnahe Dienstleistungen",
      rows: [
        { key: "hours", label: "Leistungen", hint: "(inkl. Fahrtzeit Hinfahrt)", qty: hoursText(d.totalMonatlichH), unit: fmt(AH_CONSTANTS.STUNDENSATZ_HND), total: fmt(d.leistungenTotal), times: true },
        { key: "visits", label: "Anfahrtspauschale", qty: visitsText(d.totalEinsaetze), unit: fmt(AH_CONSTANTS.ANFAHRT_PER_EINSATZ), total: fmt(d.anfahrtTotal), times: false },
      ],
      subtotal: { label: "Gesamt HnD-Leistungen", value: fmt(d.gesamtBase) },
      details: detailsOf(t, d.schedRows),
    });
  }
  if (d.hasAb) {
    out.push({
      kind: "ab", title: "Alltagsbegleitung",
      rows: [
        { key: "hours", label: "Leistungen", hint: "(inkl. Fahrtzeit Hinfahrt)", qty: hoursText(d.abTotalMonatlichH), unit: fmt(AH_CONSTANTS.STUNDENSATZ_AB), total: fmt(d.abLeistungenTotal), times: true },
        { key: "visits", label: "Anfahrtspauschale", ...(d.abCombinedVisit ? { hint: "(kombiniert mit HnD)" } : {}), qty: visitsText(d.abAnfahrtEinsaetze), unit: fmt(AH_CONSTANTS.ANFAHRT_PER_EINSATZ), total: fmt(d.abAnfahrtTotal), times: false },
      ],
      subtotal: { label: "Gesamt / Monat", value: fmt(d.abGesamtBase) },
      details: detailsOf(t, d.abSchedRows),
      footnote: `Separate Direktrechnung — nicht im Gesamtbetrag. Fahrten im Rahmen der Alltagsbegleitung: ${fmt(d.abKmRate)} / km · inkl. MwSt. Wird bei Bedarf direkt abgerechnet.`,
    });
  }
  return out;
}
