// One change of "Optionale Produkte": the optional fields, the bathtub on the `duschwanne` path
// (today's attachDuschwanneToPayload reads it from the Wanne picker's fields), the tasks and the
// work time that follow — ONE change of the offer; and what the page remembers beside it.
import { useOfferStore } from "../../offer/index.js";
import { optChanges } from "../arbeiten/rules.js";
import { NO_UI, changedFields, type State, type Ui } from "./rules.js";
import { dwOf } from "./wanne-rules.js";

type Fields = Record<string, unknown>;
const NONE: Fields = {};
export const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** the stored section and what the page remembers beside it */
export const optionalState = (): State => ({ opt: offerNow().optional ?? NONE, ui: (useOfferStore.getState().scratch.optional as Ui | undefined) ?? NO_UI });
export function act(change: (s: State) => State): void {
  const before = optionalState(), next = change(before);
  const fields = changedFields(before.opt, next.opt);
  if (Object.keys(fields).length) useOfferStore.getState().patchAll(optChanges(offerNow(), fields, changedFields(dwOf(before.opt), dwOf(next.opt))));
  if (next.ui !== before.ui) useOfferStore.getState().remember("optional", next.ui);
}
