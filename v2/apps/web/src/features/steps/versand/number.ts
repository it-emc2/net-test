// The offer gets a new number — in ONE change with the mail's subject and text, which name it.
// Used by the Dokumentenstudio (DOCX / PDF) and by sending (an offer that has no number yet).
import { useOfferStore } from "../../offer/index.js";
import { newOfferNumber } from "./documents.js";
import { mailChanges, touchedOf, type Touched } from "./mail-rules.js";

type Offer = Record<string, unknown>;
export function giveNumber(): string {
  const st = useOfferStore.getState(), before = (st.offer ?? {}) as Offer, offer: Offer = { ...before, offerNumber: newOfferNumber() };
  const mail = mailChanges(offer, (st.scratch.mailTouched as Touched | undefined) ?? touchedOf(before), st.scratch.mailAntrag === true);
  st.setTop({ offerNumber: offer.offerNumber, ...(Object.keys(mail).length ? { mail: { ...((offer.mail ?? {}) as Offer), ...mail } } : {}) });
  return String(offer.offerNumber);
}
