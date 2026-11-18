// An offer the OLD app sent, opened again in today's UI (ADR 023, addendum 2026-11-18, part 2).
//
// Today's UI rebuilds an opened offer from its form, and the rebuilt offer is never the stored
// one: fields the old offer did not have get defaults, sealing and travel cost are calculated
// again at today's rates, some sections are dropped. Measured on a copy of the real data
// (v2/scripts/audit-reopen-sent-offers.cjs): 39 of 39 sent offers, opened and saved WITHOUT a
// change, were refused as "changed" — and with the save every resend, letter and signature.
//
// Owner, 2026-11-18: for such an offer the STORED offer is the offer. The server takes the
// content from the stored offer and only the workflow sections (mail, recipient, deal) from the
// request. Nothing is refused, and what goes out is what the customer has. Today's UI shows a
// sent offer read-only; a change needs "Neue Version" there (a new number).
//
// Applies only when ALL hold:
//   - the request does not come from the React app (it sends `client: "react"` and keeps the
//     comparison and "Neue Version erstellen");
//   - an offer is stored under the number;
//   - the old app sent it: no send record, its own logs say so. Remembered in offer_origins,
//     because the first send from here writes a send record.
// An offer sent by THIS server is not touched: there a changed form right after the send is a
// real change and stays refused.
import { Offer } from "../../platform/models.js";
import { storedContentWith } from "./identity.js";
import { wasSentBeforeRecords } from "./offer-record.js";
import { isOldSentOffer, isReactClient, markOldSentOffer } from "./origin.js";
import { lastSentOffer } from "./store.js";

/**
 * The payload to work with instead of the request's, or null when the request's own stays.
 * A failing lookup returns null: the request is then handled as before.
 */
export async function sentOriginalFor(offerNumber: unknown, requestPayload: unknown, client: unknown): Promise<Record<string, unknown> | null> {
  const nr = String(offerNumber || "").trim();
  if (!nr || isReactClient(client)) return null;
  try {
    const stored: any = await Offer.findOne({ offerNumber: nr, locked: true }, { payload: 1 }).lean();
    if (!stored?.payload || typeof stored.payload !== "object") return null;
    if (!(await isOldSentOffer(nr))) {
      if (await lastSentOffer(nr)) return null; // sent by this server
      if (!(await wasSentBeforeRecords(nr))) return null; // never sent: an ordinary saved offer
      await markOldSentOffer(nr);
    }
    return storedContentWith(stored.payload, requestPayload);
  } catch (e) {
    console.warn("[sends] sent-original lookup failed — request handled as it came:", (e as Error)?.message || e);
    return null;
  }
}
