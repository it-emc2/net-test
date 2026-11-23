// Handlauf: the step's reads and writes of payload.hl.
import { useOfferStore } from "../../offer/index.js";
import type { Fields } from "./rules.js";

export const useHl = () => useOfferStore((s) => ((s.offer as Record<string, Fields> | null)?.hl ?? {}) as Fields);
export const hlNow = (): Fields => ((useOfferStore.getState().offer as Record<string, Fields> | null)?.hl ?? {}) as Fields;
export const str = (v: unknown) => (v == null ? "" : String(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** write fields of payload.hl (`undefined` removes a key); nothing changes → no write (no save, no price request) */
export function writeHl(fields: Fields): void {
  const hl = hlNow();
  const diff = Object.fromEntries(Object.entries(fields).filter(([k, v]) => (v === undefined ? k in hl : !same(hl[k], v))));
  if (Object.keys(diff).length) useOfferStore.getState().patch("hl" as never, diff as never);
}
