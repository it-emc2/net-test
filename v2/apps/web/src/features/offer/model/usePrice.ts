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

/** Alltagshilfe is priced in the browser (model/ah-price.ts), no price request. Winterdienst and
 *  Hausmeister-Service are asked like today: the server answers its empty shell (`_clientSideOffer`,
 *  @oc/domain isClientPricedOffer) — the Kosten page shows its zeros, the total shows „–“ (as today). */
const SHELL_TYPES = ["wd", "hms"];
const browserPriced = (offer: Record<string, unknown>): boolean => isClientPricedOffer(offer) && !SHELL_TYPES.includes(String(offer.activeOffer ?? "").toLowerCase());

export function usePrice() {
  const version = useOfferStore((s) => s.version);
  const hasOffer = useOfferStore((s) => s.offer !== null);
  const clientPriced = useOfferStore((s) => (s.offer ? browserPriced(s.offer) : false));
  // the key names THIS OPENING of an offer as well as its change count: the count starts at 0 every
  // time an offer is opened, so without it another offer — or the same variant opened again after it
  // was changed — would be answered from an older cached price (and show it until the next change)
  const opening = useOfferStore((s) => s.opening);
  const [settled, setSettled] = useState(version);
  useEffect(() => {
    if (version === settled) return;
    const t = setTimeout(() => setSettled(version), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [version, settled]);

  const query = useQuery({
    queryKey: ["price", opening, settled],
    // the offer is read at request time, so the request always carries the latest state
    queryFn: ({ signal }) => call("price", { body: useOfferStore.getState().offer, signal }),
    // only for a settled version: a hook that saw the offer before it changed (e.g. mounted while the
    // draft was loading, then a device snapshot opened as version 1) would otherwise ask at once for
    // its outdated key — with the same offer as the request that follows for the new key (2 calls)
    enabled: hasOffer && !clientPriced && version === settled,
    // while the next price is on its way the last one of the SAME opening stays on the page — never another offer's
    placeholderData: (prev, last) => (last?.queryKey[1] === opening ? keepPreviousData(prev) : undefined),
    staleTime: Infinity,
    retry: false,
  });
  // a client-priced offer (Alltagshilfe: model/ah-price.ts) never shows a server price — not even
  // one cached for the same key by another offer opened before (the key counts changes, not offers)
  if (clientPriced) return { data: null, total: null, selfPay: null, pending: false, error: null };
  // the empty shell of Winterdienst / Hausmeister-Service has no total of its own (today's summary shows „–“)
  const shell = (query.data as { _clientSideOffer?: unknown } | undefined)?._clientSideOffer === true;
  return { data: query.data ?? null, total: shell ? null : query.data?.total ?? null, selfPay: query.data?.selfPayAmount ?? null, pending: query.isFetching || version !== settled, error: query.error };
}
