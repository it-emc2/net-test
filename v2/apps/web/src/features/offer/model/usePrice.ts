// The price of the current offer. One request per change at most: changes within DEBOUNCE_MS are
// collected, and a request that is still running when the offer changes again is aborted.
// (Computing the price in the browser with @oc/pricing, so that the server only confirms it,
// is added with the first screens that change prices — see MODULARIZATION-PLAN.md.)
import { isClientPricedOffer } from "@oc/domain";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { useOfferStore } from "./store.js";

export const DEBOUNCE_MS = 250;

export function usePrice() {
  const version = useOfferStore((s) => s.version);
  const hasOffer = useOfferStore((s) => s.offer !== null);
  const clientPriced = useOfferStore((s) => (s.offer ? isClientPricedOffer(s.offer) : false));
  const [settled, setSettled] = useState(version);
  useEffect(() => {
    if (version === settled) return;
    const t = setTimeout(() => setSettled(version), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [version, settled]);

  const query = useQuery({
    queryKey: ["price", settled],
    // the offer is read at request time, so the request always carries the latest state
    queryFn: ({ signal }) => call("price", { body: useOfferStore.getState().offer, signal }),
    enabled: hasOffer && !clientPriced,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  });
  return { total: query.data?.total ?? null, selfPay: query.data?.selfPayAmount ?? null, pending: query.isFetching || version !== settled, error: query.error };
}
