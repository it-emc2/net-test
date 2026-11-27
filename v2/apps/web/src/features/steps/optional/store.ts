// One change of "Optionale Produkte": the optional fields, the bathtub on the `duschwanne` path
// (today's attachDuschwanneToPayload reads it from the Wanne picker's fields), the tasks and the
// work time that follow — ONE change of the offer; and what the page remembers beside it.
import { useOfferStore } from "../../offer/index.js";
import { optChanges } from "../arbeiten/rules.js";
import { NO_UI, changedFields, type State, type Ui } from "./rules.js";
import { dwOf } from "./wanne-rules.js";
import { afterOptChange, type Change } from "../wandverkleidung/wc-plate.js";
import { toast } from "../../../shared/ui/toaster.js";

type Fields = Record<string, unknown>;
const NONE: Fields = {};
export const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** the stored section and what the page remembers beside it */
export const optionalState = (): State => ({ opt: offerNow().optional ?? NONE, ui: (useOfferStore.getState().scratch.optional as Ui | undefined) ?? NO_UI });
export function act(change: (s: State) => State): void {
  const before = optionalState(), next = change(before);
  const fields = changedFields(before.opt, next.opt);
  if (Object.keys(fields).length) {
    const changes = optChanges(offerNow(), fields, changedFields(dwOf(before.opt), dwOf(next.opt)));
    // the Wand-WC's plate of Wandverkleidung goes again when the WC no longer needs it (ADR 032)
    const plate = afterOptChange({ ...offerNow(), optional: next.opt });
    useOfferStore.getState().patchAll(plate ? withPlate(changes, plate) : changes);
    if (plate?.toast) toast.info(plate.toast);
  }
  if (next.ui !== before.ui) useOfferStore.getState().remember("optional", next.ui);
}

/** one change of the offer with the Wand-WC's plate (`plate`) added; the Weitere Arbeiten show the stored list again */
export function withPlate(changes: Record<string, Fields>, plate: Change): Record<string, Fields> {
  const out = { ...changes };
  if (Object.keys(plate.wv).length) out.wandverkleidung = { ...(out.wandverkleidung ?? {}), ...plate.wv };
  if (Object.keys(plate.dw).length) { out.duschwanne = { ...(out.duschwanne ?? {}), ...plate.dw }; useOfferStore.getState().remember("freeTasks", undefined); }
  return out;
}
