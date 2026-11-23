// Alltagshilfe is priced in the browser (as today: the server answers an empty shell for AH, see
// @oc/domain isClientPricedOffer). The frame (total in the step bar / sidebar), Leistungen and
// Finanzierung read the same numbers — THE AH total of screen, documents, signing page and Bitrix:
// ahOfferTotals(ahInputFromPayload(offer)) with the AH values of the business settings (ADR 028:
// no payer = Kassenkunde; Selbstzahler = net + 7 % MwSt, the Servicepauschale only as a note) —
// no price request.
import { ahInputFromPayload, ahOfferTotals, type AhOfferTotals } from "@oc/pricing";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { call } from "../../../shared/api/index.js";
import { useOfferStore } from "./store.js";

export interface AhConfig {
  entlastungsbetragMonat: number; steuerabsetzPct: number; steuerabsetzCapJahr: number;
  /** Verhinderungspflege per year (the monthly maximum is a twelfth of it) */
  verhinderungspflegeJahr: number;
}
/** today's defaults while the settings load (script.js: __entlastungsbetragMonat = 131, 2.418 €, 20 %, 4.000 €) */
export const AH_CONFIG_DEFAULT: AhConfig = Object.freeze({ entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000, verhinderungspflegeJahr: 2418 });
/** the AH values of GET /admin/api/config/public */
export function ahConfigOf(d: unknown): AhConfig {
  const c = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const num = (k: string, f: number) => (typeof c[k] === "number" ? (c[k] as number) : f);
  return {
    entlastungsbetragMonat: num("ENTLASTUNGSBETRAG_MONAT", 131), steuerabsetzPct: num("STEUERABSETZ_PCT", 20), steuerabsetzCapJahr: num("STEUERABSETZ_CAP_JAHR", 4000),
    verhinderungspflegeJahr: num("VERHINDERUNGSPFLEGE_JAHR", 2418),
  };
}

let latest: AhConfig = AH_CONFIG_DEFAULT;
/** the settings as last loaded (for code outside React, e.g. the budget re-fit after a change) */
export const getAhConfig = (): AhConfig => latest;

/** the AH settings (shares the "public-config" query of the other steps) */
export function useAhConfig(): AhConfig {
  const q = useQuery({ queryKey: ["public-config"], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("publicConfig", { signal }) });
  const cfg = useMemo(() => (q.data ? ahConfigOf(q.data) : AH_CONFIG_DEFAULT), [q.data]);
  latest = cfg;
  return cfg;
}

/** THE AH totals of an offer (pure) */
export const ahTotalsOf = (offer: unknown, cfg: AhConfig): AhOfferTotals => ahOfferTotals(ahInputFromPayload(offer as Record<string, unknown>, cfg));

/** the AH totals of the open offer, or null when the open offer is not an AH offer */
export function useAhPrice(): AhOfferTotals | null {
  const offer = useOfferStore((s) => s.offer);
  const cfg = useAhConfig();
  return useMemo(() => (offer && offer.activeOffer === "ah" ? ahTotalsOf(offer, cfg) : null), [offer, cfg]);
}
