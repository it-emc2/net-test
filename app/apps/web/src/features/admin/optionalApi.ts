import type { OptionalCatalogAdminResponse, OptionalCategoryDef } from "@emc2/shared";
import { api } from "@/lib/api";

export const optionalAdminApi = {
  get: () => api.get<OptionalCatalogAdminResponse>("/api/admin/optional"),
  save: (categories: OptionalCategoryDef[]) =>
    api.put<{ ok: true; count: number }>("/api/admin/optional", { categories }),
};
