import type { DealPrefillResponse } from "@emc2/shared";
import { api } from "@/lib/api";

export const bitrixApi = {
  dealPrefill: (id: string) =>
    api.get<DealPrefillResponse>(`/api/bitrix/deal/${encodeURIComponent(id)}/prefill`),
  dealsForContact: (id: string) =>
    api.get<{ deals: { id: string; title: string }[] }>(`/api/bitrix/contact/${encodeURIComponent(id)}/deals`).then((r) => r.deals),
};
