// Offer numbers are registered with the server (ADR 023, increment 3).
//
// The app mints the number on the device from its clock (ANGyyyy-mmdd-hhmmss) — it has to, it
// works offline. Two devices starting in the same second got the same number, and the later
// save silently overwrote the other offer (audit create F08). Now the app registers its number
// as soon as it is online: free → it is reserved for this offer; taken by another unsaved offer
// → the server hands out a new unique number, which the app puts into the form.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mongoose, { Schema } from "mongoose";
import { Draft, Offer } from "../../platform/models.js";
import { DealDraft } from "../deal-drafts/index.js";
import { OfferSend } from "./store.js";

const model = <T>(name: string, schema: Schema<T>) =>
  (mongoose.models[name] as mongoose.Model<T>) ?? mongoose.model<T>(name, schema);

export const OfferNumber = model("OfferNumber", new Schema({
  offerNumber: { type: String, required: true },
  /** random id of the device (browser) that holds the number */
  claimId: { type: String, required: true },
  by: { type: String, default: "" },
  at: { type: Date, required: true },
}, { collection: "offer_numbers" }));

export async function migrateOfferNumberIndexes() {
  await OfferNumber.collection.createIndex({ offerNumber: 1 }, { unique: true, name: "uniq_offerNumber" });
}

const NUMBER = /^ANG[A-Za-z0-9-]{4,40}$/;
const CLAIM = /^[A-Za-z0-9_-]{8,64}$/;
const p2 = (n: number) => String(n).padStart(2, "0");

/** ANGyyyy-mmdd-hhmmss in German local time, like the app's own numbers. */
export function mintNumber(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return `ANG${parts.year}-${parts.month}${parts.day}-${p2(Number(parts.hour) % 24)}${parts.minute}${parts.second}`;
}

/** Saved work under this number (offer, draft, autosaved deal draft, send) — then it simply belongs to that offer. */
async function inUse(offerNumber: string): Promise<boolean> {
  return !!(
    (await Offer.exists({ offerNumber })) || (await Draft.exists({ offerNumber })) ||
    (await OfferSend.exists({ offerNumber })) || (await DealDraft.exists({ "payload.offerNumber": offerNumber }))
  );
}

async function reserve(offerNumber: string, claimId: string, by: string): Promise<boolean> {
  const held: any = await OfferNumber.findOne({ offerNumber }).lean();
  if (held) return held.claimId === claimId;
  try { await OfferNumber.create({ offerNumber, claimId, by, at: new Date() }); return true; }
  catch (e) { if ((e as { code?: number })?.code === 11000) return false; throw e; }
}

export async function claimNumber(current: string, claimId: string, by: string, now = new Date()): Promise<{ offerNumber: string; changed: boolean; reason: "reserved" | "in-use" | "taken" }> {
  // already held by this device
  const held: any = await OfferNumber.findOne({ offerNumber: current }).lean();
  if (held?.claimId === claimId) return { offerNumber: current, changed: false, reason: "reserved" };
  // saved work under this number (offer, draft, autosave, send): the user opened that offer → theirs,
  // whoever reserved the number first
  if (await inUse(current)) return { offerNumber: current, changed: false, reason: "in-use" };
  if (!held && (await reserve(current, claimId, by))) return { offerNumber: current, changed: false, reason: "reserved" };
  // held by another offer session → a new unique number
  for (let i = 0; i < 20; i++) {
    const base = mintNumber(new Date(now.getTime() + i * 1000));
    if (!(await inUse(base)) && (await reserve(base, claimId, by))) return { offerNumber: base, changed: true, reason: "taken" };
  }
  throw new Error("Keine freie Angebotsnummer gefunden");
}

export async function registerOfferNumbers(app: FastifyInstance) {
  app.post("/api/offer-numbers/claim", async (req: FastifyRequest, reply: FastifyReply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const current = String(b.current || "").trim(), claimId = String(b.claimId || "").trim();
    if (!NUMBER.test(current) || !CLAIM.test(claimId)) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Ungültige Angebotsnummer", requestId: req.id } });
    }
    return { ok: true, ...(await claimNumber(current, claimId, String(req.user?.email || ""))) };
  });
}
