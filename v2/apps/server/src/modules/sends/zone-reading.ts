// Alltagshilfe: which reading of the travel zone an offer's documents use (ADR 028, addendum
// 2026-11-23, owner): an offer sent from now on follows the screen (travel time + Hof rule); an
// offer that already went out stays exactly as it went out (the documents' own reading: the saved
// `Arbeitszeit.ahTravelZone` first).
//
// The reading is decided ONCE per offer number, at its first send or hand-over after this change,
// and kept on the send record (`ahZoneReading`). Every later send, resend, download, signing page,
// signature and Bitrix amount of that number reads the same marker again:
//   1. a send record of the number that carries a marker → that marker (the earliest one; every
//      marker is computed by these same rules, so all records of one number carry the same one)
//   2. evidence that the number reached a customer before markers existed → "document":
//      a completed send record without a marker (not "Nur in Bitrix ablegen"), the old app's logs
//      (e-mail log, posted letter, signed signing request), any signing request of the number
//      (a link or on-site hand-over whose page the customer may have seen)
//   3. otherwise the offer is new → "screen" (also a "Neue Version": it has a new number)
// Without a database (or when the check fails) the old reading is kept: it never changes what a
// customer already has.
import mongoose from "mongoose";
import { isAhZoneReading, type AhZoneReading } from "@oc/pricing";
import { SigningRequest } from "../../platform/models.js";
import { wasSentBeforeRecords } from "./offer-record.js";
import { OfferSend } from "./store.js";

export type { AhZoneReading };

/** The zone reading of an offer number (see the rules above). */
export async function ahZoneReadingOf(offerNumber: unknown): Promise<AhZoneReading> {
  const nr = String(offerNumber ?? "").trim();
  if (!nr) return "screen"; // no number: nothing can have been sent under it
  if (mongoose.connection.readyState !== 1) return "document";
  try {
    const marked: any = await OfferSend.findOne({ offerNumber: nr, ahZoneReading: { $in: ["document", "screen"] } }, { ahZoneReading: 1 }).sort({ startedAt: 1 }).lean();
    if (marked && isAhZoneReading(marked.ahZoneReading)) return marked.ahZoneReading;
    if (await OfferSend.exists({ offerNumber: nr, status: "done", channel: { $ne: "bitrix" } })) return "document";
    if (await wasSentBeforeRecords(nr)) return "document";
    if (await SigningRequest.exists({ offerNumber: nr })) return "document";
    return "screen";
  } catch (e) {
    console.warn("[ah-zone] reading check failed — the old reading is kept:", (e as Error)?.message || e);
    return "document";
  }
}

const isAhBody = (body: any) => /^ah/i.test(String(body?.activeOffer ?? "")) || String(body?.offerType ?? "").toLowerCase() === "ah";

/** The reading for rendering an offer body: only an AH offer is looked up; every other type keeps the documents' reading (its AH fields are unused there). */
export async function ahZoneReadingForBody(body: any): Promise<AhZoneReading> {
  return isAhBody(body) ? ahZoneReadingOf(body?.offerNumber) : "document";
}
