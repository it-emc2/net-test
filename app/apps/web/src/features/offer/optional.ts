import type { OptionalCatalogResponse } from "@emc2/shared";
import { api } from "@/lib/api";

export function getOptionalCatalog(): Promise<OptionalCatalogResponse> {
  return api.get<OptionalCatalogResponse>("/api/optional/catalog");
}
