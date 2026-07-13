import type { TraySuggestResponse } from "@emc2/shared";
import { api } from "@/lib/api";

export const SLATE_COLORS = ["Weiss", "Elfenbein", "Steingrau", "Beton", "Anthrazit", "Schwarz"];

export function suggestTrays(w: string, l: string): Promise<TraySuggestResponse> {
  const sp = new URLSearchParams();
  if (w) sp.set("w", w);
  if (l) sp.set("l", l);
  return api.get<TraySuggestResponse>(`/api/trays/suggest?${sp.toString()}`);
}
