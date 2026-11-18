// The offer gets a new number — in ONE change with the mail's subject and text, which name it.
// Used by the Dokumentenstudio (DOCX / PDF), by sending (an offer that has no number yet) and by
// "Neue Version erstellen" (version.ts).
// Audit 2026-11-17, F12: the number is registered on the server (`/api/offer-numbers/claim`, as
// the add-on modules/web/addons/offer-record.js does for today's UI — same device id). Two
// devices that mint the same number in the same second: the second one is handed another number,
// put into the offer here and said in a notice. No connection: the minted number stays (as today).
import { call } from "../../../shared/api/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { useOfferStore } from "../../offer/index.js";
import { newOfferNumber } from "./documents.js";
import { mailChanges, touchedOf, type Touched } from "./mail-rules.js";

type Offer = Record<string, unknown>;
const CLAIM_KEY = "oc.numberClaimId"; // shared with today's UI: one id per device
let memoryId = "";
export function claimId(): string {
  try {
    let id = localStorage.getItem(CLAIM_KEY) || "";
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CLAIM_KEY, id); }
    return id;
  } catch { return (memoryId ||= crypto.randomUUID()); } // private mode
}
export const numberTaken = (was: string, now: string): string => `Die Angebotsnummer ${was} war bereits vergeben. Dieses Angebot hat jetzt die Nummer ${now}.`;

/** the number goes into the offer, with the mail texts that name it */
function put(number: string): void {
  const st = useOfferStore.getState(), before = (st.offer ?? {}) as Offer, offer: Offer = { ...before, offerNumber: number };
  const mail = mailChanges(offer, (st.scratch.mailTouched as Touched | undefined) ?? touchedOf(before), st.scratch.mailAntrag === true);
  st.setTop({ offerNumber: number, ...(Object.keys(mail).length ? { mail: { ...((offer.mail ?? {}) as Offer), ...mail } } : {}) });
}
const numberNow = () => String((useOfferStore.getState().offer as Offer | null)?.offerNumber ?? "");

/** A new number for the open offer: in the offer at once, then registered. Resolves with the number the offer has in the end. */
export async function giveNumber(): Promise<string> {
  const minted = newOfferNumber();
  put(minted);
  try {
    const r = await call("claimOfferNumber", { body: { current: minted, claimId: claimId() } });
    const got = String(r.offerNumber ?? "").trim();
    // the user may have moved on while the request was under way
    if (r.changed && got && got !== minted && numberNow() === minted) { put(got); toast.info(numberTaken(minted, got)); return got; }
  } catch { /* no connection or an older server: the minted number stays */ }
  return minted;
}
