// Shared AH totals derivation so every step (Leistungen live view, Kosten,
// Zusammenfassung) computes from the same inputs.
import { useAhOffer } from "./AhOfferContext";
import { computeAhTotals, computeZone, DEFAULT_ENTLASTUNGSBETRAG, type AhTotals, type Zone } from "./ahPricing";

// ponytail: Entlastungsbetrag hardcoded to the current value (legacy admin default
// 131 €/Mo, § 45b SGB XI). Wire to admin config if it ever needs to be tunable.
export const ENTLASTUNGSBETRAG = DEFAULT_ENTLASTUNGSBETRAG;

export function useAhTotals(): { totals: AhTotals; zone: Zone | null; reisezeitH: number } {
  const { payload } = useAhOffer();
  const zone = computeZone(parseInt(payload.ah.travelMinutes, 10) || 0);
  const reisezeitH = zone ? zone.billMin / 60 : 0;
  const isSelbstzahler = payload.Kundendaten.payer === "Selbstzahler";
  const totals = computeAhTotals(payload.ah.services, { isSelbstzahler, zone, entlastungsbetrag: ENTLASTUNGSBETRAG });
  return { totals, zone, reisezeitH };
}
