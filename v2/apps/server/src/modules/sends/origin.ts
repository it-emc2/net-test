// Which app created a stored offer? (ADR 023, addendum 2026-11-18.)
//
// Owner, 2026-11-18: an offer the OLD app stored never changes its price — whether or not a send
// can be proven. Only an offer the new React app saved and never sent is priced fresh when it
// changes (pinned-price.ts). Today's UI is served by this server too and saves through the same
// route with the same fields (its offline queue also adds `clientSaveId`), so the React client
// says who it is: `client: "react"` in the request. The answer is kept here, in a NEW collection
// (the legacy `offers` schema stays as it is); the offer number is the _id, so no index is needed.
//
// No entry = stored by the old app (every offer that existed before, and every save by today's UI).
// The entry is written only when the React app CREATES the offer: an old offer that React saves
// again stays an old offer.
import mongoose, { Schema } from "mongoose";

const OfferOrigin = (mongoose.models.OfferOrigin as mongoose.Model<any>) ?? mongoose.model("OfferOrigin", new Schema({
  _id: { type: String },
  app: { type: String, required: true },
  at: { type: Date, required: true },
}, { collection: "offer_origins", versionKey: false }));

export const REACT_CLIENT = "react";
export const isReactClient = (v: unknown): boolean => String(v ?? "").trim().toLowerCase() === REACT_CLIENT;

/** Call right after the React app created the offer stored under this number. */
export async function markReactOffer(offerNumber: string): Promise<void> {
  const nr = String(offerNumber || "").trim();
  if (!nr) return;
  await OfferOrigin.updateOne({ _id: nr }, { $setOnInsert: { app: REACT_CLIENT, at: new Date() } }, { upsert: true });
}

/** An offer the old app sent (sent-original.ts): remembered, because the next send from today's UI writes a send record. */
export const OLD_SENT = "old-sent";
export async function markOldSentOffer(offerNumber: string): Promise<void> {
  const nr = String(offerNumber || "").trim();
  if (!nr) return;
  await OfferOrigin.updateOne({ _id: nr }, { $setOnInsert: { app: OLD_SENT, at: new Date() } }, { upsert: true });
}
export async function isOldSentOffer(offerNumber: string): Promise<boolean> {
  const nr = String(offerNumber || "").trim();
  return !!nr && !!(await OfferOrigin.exists({ _id: nr, app: OLD_SENT }));
}

export async function isReactOffer(offerNumber: string): Promise<boolean> {
  const nr = String(offerNumber || "").trim();
  return !!nr && !!(await OfferOrigin.exists({ _id: nr, app: REACT_CLIENT }));
}
