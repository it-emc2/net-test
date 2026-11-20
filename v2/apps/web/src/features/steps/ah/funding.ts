// Alltagshilfe: the Entlastungsbetrag follows the Pflegegrad answer of Kundendaten while the
// Finanzierung was never touched (owner decision 1, 2026-11-20; rules in fin-rules.ts). One store
// subscription, as settle.ts: only a CHANGE of the answer in an open offer writes — opening or
// loading an offer never does, and a stored tick of a touched Finanzierung is never changed.
// Writes only `ahEntlastungsbetragNutzen` ("on" or removed), so the offer stays "never touched".
import { useOfferStore, type OfferState } from "../../offer/index.js";
import { careOf, ebDefault, finOf, touched } from "./fin-rules.js";

type F = Record<string, any>;
const answerKey = (o: F | null) => { const kd = (o?.Kundendaten ?? {}) as F; return `${kd.hasPflegegrad ?? ""}|${kd.pflegegrad ?? ""}`; };

function onChange(s: OfferState, prev: OfferState): void {
  const o = s.offer as F | null;
  if (!o || o.activeOffer !== "ah" || !prev.offer) return;
  // a new or opened offer (or another variant): take it as it is
  if (s.dealId !== prev.dealId || s.variantId !== prev.variantId || s.version === 0 || s.version <= prev.version) return;
  if (answerKey(o) === answerKey(prev.offer as F)) return;
  if (touched(o.Finanzierung) || String(o.Kundendaten?.payer || "") === "Selbstzahler") return;
  const want = ebDefault(careOf(o));
  if (want === finOf(o.Finanzierung).eb) return;
  useOfferStore.getState().patch("Finanzierung" as never, { ahEntlastungsbetragNutzen: want ? "on" : undefined } as never);
}

let off: (() => void) | null = null;
/** idempotent: the subscription exists once */
export function installAhFundingDefaults(): void {
  if (!off) off = useOfferStore.subscribe(onChange);
}
