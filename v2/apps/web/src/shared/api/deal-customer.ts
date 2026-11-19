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
