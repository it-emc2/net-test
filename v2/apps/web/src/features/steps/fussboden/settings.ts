// The business settings the mode "Wandverkleidung als Fußboden" needs — also read by the
// Wandverkleidung step, which offers the wall's rest for the floor.
import { useQuery } from "@tanstack/react-query";
import { call } from "../../../shared/api/index.js";
import * as w from "./wand.js";

/** the business settings the mode needs: how much of the wall's rest counts, and our own stock per article */
export function useWallSettings(): { rest: w.RestConfig; own: Record<string, number> } {
  const q = useQuery({ queryKey: ["public-config"], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }) => call("publicConfig", { signal }) });
  const d = (q.data ?? {}) as Record<string, unknown>;
  return {
    rest: { usable: typeof d.WV_LEFTOVER_USABLE_PERCENT === "number" ? d.WV_LEFTOVER_USABLE_PERCENT : w.REST_DEFAULTS.usable, min: typeof d.WV_LEFTOVER_MIN_M2 === "number" ? d.WV_LEFTOVER_MIN_M2 : w.REST_DEFAULTS.min },
    own: d.WV_OWN_LAGER && typeof d.WV_OWN_LAGER === "object" ? (d.WV_OWN_LAGER as Record<string, number>) : {},
  };
}

