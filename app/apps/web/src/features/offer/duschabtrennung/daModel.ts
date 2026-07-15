import { api } from "@/lib/api";
import type { WizardModel } from "./daEngine";

export type DaSupplier = "vigour" | "badolux";

const cache = new Map<DaSupplier, WizardModel>();

/** Lazily fetch + cache a supplier model (Vigour ~11 MB, Badolux small). */
export async function loadDaModel(supplier: DaSupplier): Promise<WizardModel> {
  const hit = cache.get(supplier);
  if (hit) return hit;
  const model = await api.get<WizardModel>(`/api/duschabtrennung/model/${supplier}`);
  cache.set(supplier, model);
  return model;
}

/** Resolve an imageId to a URL.
 *  Vigour: model.images[id] = "assets/<uuid>_<ext>" → API static route.
 *  Badolux: model.images[id] = "/assets/badolux/x.png" → web static (kept as-is). */
export function daImageUrl(model: WizardModel, imageId: string | undefined | null): string | null {
  if (!imageId) return null;
  const raw = model.images?.[imageId];
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  const rel = raw.replace(/^assets\//, "").replace(/_(jpe?g|png|webp|gif)$/i, ".$1");
  return `/api/duschabtrennung/assets/${rel}`;
}
