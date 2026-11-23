// The customer of a Bitrix deal (GET /api/deals/:dealId/customer) as ONE TanStack query, shared by
// the planning (starting an offer from an appointment) and Kundendaten: whoever asks first, the
// others get the same answer without another request while it is fresh (as long as the server keeps it).
import { DEAL_CUSTOMER_TTL_MS } from "@oc/api-contract";
import type { QueryClient } from "@tanstack/react-query";
import { call } from "./client.js";

export const dealCustomerKey = (dealId: string) => ["deal-customer", dealId] as const;
export const dealCustomerQuery = (dealId: string) => ({
  queryKey: dealCustomerKey(dealId),
  queryFn: ({ signal }: { signal: AbortSignal }) => call("dealCustomer", { params: { dealId }, signal }),
  staleTime: DEAL_CUSTOMER_TTL_MS,
});
/** asks Bitrix again (the server's copy is skipped), e.g. „Erneut versuchen“ */
export const loadDealCustomerFresh = (qc: QueryClient, dealId: string) =>
  qc.fetchQuery({ queryKey: dealCustomerKey(dealId), queryFn: ({ signal }) => call("dealCustomer", { params: { dealId }, query: "fresh=1", signal }), staleTime: 0 });

// The deals of a Bitrix contact (GET /api/bitrix/contact/:id/deals, one Bitrix call): asked once per
// contact and kept 60 s; callers asking together share one request. A failure is an empty list (as today).
export interface ContactDeal { id: string; title: string }
export const contactDealsQuery = (contactId: string) => ({
  queryKey: ["contact-deals", contactId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => call("bitrixContactDeals", { params: { id: contactId }, signal })
    .then((r): ContactDeal[] => (r.deals ?? []).map((d) => ({ id: String(d.id), title: String((d as { title?: unknown }).title ?? "").trim() }))),
  staleTime: DEAL_CUSTOMER_TTL_MS,
  retry: false,
});
/** the scratch key (offer store) of a contact's deals waiting to be picked: { contactId, deals } */
export const CONTACT_DEALS = "contactDeals";
