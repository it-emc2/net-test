import type { CustomerDetail, CustomersListResponse } from "@emc2/shared";
import { api } from "@/lib/api";

export const customersApi = {
  list: (params: { q?: string; page?: number; pageSize?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    const qs = sp.toString();
    return api.get<CustomersListResponse>(`/api/customers${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) =>
    api.get<{ customer: CustomerDetail }>(`/api/customers/${id}`).then((r) => r.customer),
};
