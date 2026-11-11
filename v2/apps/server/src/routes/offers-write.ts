// Offers + drafts — write endpoints (phase 4, group 2b). Ported 1:1 from legacy
// src/routes/offers.js + src/routes/drafts.js + src/lib/ansprechpartner.js.
// Legacy quirks kept on purpose (parity): computePrices mutates the payload it is given
// (shallow copies share nested sections, so the stored payload carries those changes);
// saving an offer always sets locked:true; `status` is not in the schema and is dropped.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { computeFingerprint, type PricingEngine } from "@oc/pricing";
import { Draft, Offer, User } from "../models.js";
import { OfferChangedError, assertUnchangedSinceSent, offerChangedBody } from "../sends/store.js";
import { wasSentBeforeRecords } from "../sends/offer-record.js";
import { offerIdentity } from "../sends/identity.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: object = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id, ...extra } });

const ELIGIBLE = { active: true, signatureDataUrl: { $exists: true, $ne: "" } };
const findEligible = (email: string) => (email ? User.findOne({ ...ELIGIBLE, email }).lean() : null);

/** Ansprechpartner resolution (legacy src/lib/ansprechpartner.js). */
export async function resolveAnsprechpartner(kundendaten: any, reqUser: { email?: string } | undefined, defaultEmail = "") {
  const k = kundendaten || {};
  const apEmail = String(k.ansprechpartner || "").trim().toLowerCase();
  const user: any =
    (await findEligible(apEmail)) ||
    (await findEligible(String(reqUser?.email || "").toLowerCase())) ||
    (await findEligible(String(defaultEmail || "").trim().toLowerCase())) ||
    (await User.findOne(ELIGIBLE).sort({ createdAt: 1 }).lean());
  if (!user) return k;
  return { ...k, ansprechpartner: user.email, emc2_contact: user.name || user.email };
}

/** A sent (locked) offer number gets a fresh one so the edited copy never overwrites it. */
export async function freshNumberIfSent(offerNumber: string, now = () => new Date()): Promise<string | null> {
  if (!offerNumber) return null;
  if (!(await Offer.exists({ offerNumber, locked: true }))) return null;
  const d = now();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const base = `ANG${d.getFullYear()}-${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const taken = (await Offer.exists({ offerNumber: candidate })) || (await Draft.exists({ offerNumber: candidate }));
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

export async function registerOffersWrite(app: FastifyInstance, pricing: PricingEngine, opts: { apDefaultEmail?: string } = {}) {
  app.post("/api/offers/:offerNumber/recompute", async (req, reply) => {
    const { offerNumber } = req.params as { offerNumber: string };
    const offer: any = await Offer.findOne({ offerNumber });
    if (!offer) return fail(req, reply, 404, "NOT_FOUND", "Angebot nicht gefunden", { offerNumber });
    if (offer.locked) return fail(req, reply, 409, "LOCKED", "Angebot ist gesperrt — Preis kann nicht neu berechnet werden.");
    const pricingPayload = { ...offer.payload, offerNumber, offerType: offer.offerType, forceRecompute: true };
    const computedPricing = await pricing.computePrices(pricingPayload);
    offer.pricing = computedPricing;
    offer.pricingFingerprint = computeFingerprint(pricingPayload);
    await offer.save();
    return { ok: true, pricing: computedPricing, message: `Preis für ${offerNumber} neu berechnet` };
  });

  app.post("/api/offers", async (req, reply) => {
    const { offerNumber, offerType, payload, status } = (req.body ?? {}) as Record<string, any>;
    if (!offerNumber) return fail(req, reply, 400, "BAD_REQUEST", "offerNumber ist erforderlich");
    if (!payload) return fail(req, reply, 400, "BAD_REQUEST", "payload ist erforderlich");
    // Decision C (ADR 023): an offer that was sent is immutable. Saving it again unchanged is
    // fine (downloads, post after e-mail); changed content under the sent number is refused —
    // before, it overwrote the sent offer while the old price stayed pinned (audit create F01).
    let knownSend: unknown = null;
    try { knownSend = await assertUnchangedSinceSent(String(offerNumber), payload); }
    catch (e) {
      if (e instanceof OfferChangedError) return reply.status(409).send(offerChangedBody(e, req.id));
      req.log.warn({ err: e, offerNumber }, "sent-offer check failed — saving anyway");
    }
    let pricingPayload: Record<string, any> = { ...payload, offerNumber, offerType };
    // No send record: the stored offer under this number is either one the OLD app sent, or it
    // was only saved/downloaded. Content changed since then →
    //  - sent by the old app (its mail/post/signing logs say so): refused like above;
    //  - never sent: priced FRESH. Before, the old total stayed pinned to the new positions.
    if (!knownSend) {
      try {
        // tolerant comparison (key order, empty values, workflow sections ignored) — a reopened
        // offer is rebuilt from the form and must not count as changed
        const stored: any = await Offer.findOne({ offerNumber }, { payload: 1, locked: 1 }).lean();
        if (stored?.locked && stored.payload && offerIdentity(stored.payload, offerNumber).contentHash !== offerIdentity(payload, offerNumber).contentHash) {
          if (await wasSentBeforeRecords(String(offerNumber))) {
            const e = new OfferChangedError(["Inhalt (Positionen, Preise oder Kundendaten)"], { sendId: "", channel: "", at: new Date(0), to: "", by: "" });
            return reply.status(409).send(offerChangedBody(e, req.id));
          }
          pricingPayload = { ...pricingPayload, forceRecompute: true };
        }
      } catch (e) { req.log.warn({ err: e, offerNumber }, "stored-offer comparison failed — saving as before"); }
    }
    const computedPricing = await pricing.computePrices(pricingPayload);
    const offerDoc = {
      offerNumber,
      offerType: offerType || "bu",
      payload,
      pricing: computedPricing,
      pricingFingerprint: computeFingerprint(pricingPayload),
      status: status || "saved",
      locked: true,
      updatedAt: new Date(),
    };
    try {
      const result = await Offer.findOneAndUpdate(
        { offerNumber },
        { $set: offerDoc, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true, runValidators: true },
      );
      req.log.info({ offerNumber }, "offer saved");
      return { ok: true, offer: result, message: `Angebot ${offerNumber} erfolgreich gespeichert` };
    } catch (err: any) {
      if (err?.code === 11000) return fail(req, reply, 409, "DUPLICATE", "Ein Angebot mit dieser Nummer existiert bereits");
      throw err;
    }
  });

  app.post("/api/drafts/recompute", async (req, reply) => {
    const offerNumber = String(((req.body ?? {}) as Record<string, unknown>).offerNumber || "").trim();
    if (!offerNumber) return fail(req, reply, 400, "BAD_REQUEST", "offerNumber ist erforderlich");
    const draft: any = await Draft.findOne({ offerNumber }).sort({ updatedAt: -1 });
    if (!draft) return fail(req, reply, 404, "NOT_FOUND", "Kein Entwurf mit dieser Angebotsnummer gefunden", { offerNumber });
    if (draft.locked) return fail(req, reply, 409, "LOCKED", "Entwurf ist gesperrt — Preis kann nicht neu berechnet werden.");
    const pricingPayload = { ...draft.payload, offerType: draft.offerType, forceRecompute: true };
    const computedPricing = await pricing.computePrices(pricingPayload);
    draft.pricing = computedPricing;
    draft.pricingFingerprint = computeFingerprint(pricingPayload);
    await draft.save();
    return { ok: true, pricing: computedPricing, message: `Preis für Entwurf "${draft.name}" neu berechnet` };
  });

  app.post("/api/drafts", async (req, reply) => {
    const { name, offerType, payload, savedAt, clientSaveId } = (req.body ?? {}) as Record<string, any>;
    const trimmedName = String(name || "").trim();
    const trimmedOffer = String(offerType || "").trim();
    const findExisting = () => Draft.findOne({ name: trimmedName, offerType: trimmedOffer }).lean();
    const respondForExisting = (existing: any) => {
      if (clientSaveId && existing.clientSaveId === clientSaveId) {
        return reply.status(200).send({
          id: existing._id, name: existing.name, offerType: existing.offerType,
          savedAt: existing.savedAt, createdAt: existing.createdAt, updatedAt: existing.updatedAt,
        });
      }
      return fail(req, reply, 409, "DUPLICATE", "Ein Entwurf mit diesem Namen existiert bereits für diesen Bereich");
    };
    if (!name || !offerType || !payload) return fail(req, reply, 400, "BAD_REQUEST", "name, offerType und payload sind erforderlich");
    if (!trimmedName) return fail(req, reply, 400, "BAD_REQUEST", "Name darf nicht leer sein");
    try {
      const existing = await findExisting();
      if (existing) return respondForExisting(existing);
      const parsedSavedAt = savedAt ? new Date(savedAt) : null;
      const freshNumber = await freshNumberIfSent(String(payload?.offerNumber || "").trim());
      let draftPayload = freshNumber ? { ...payload, offerNumber: freshNumber } : payload;
      const resolvedKundendaten = await resolveAnsprechpartner(draftPayload.Kundendaten, req.user, opts.apDefaultEmail);
      if (freshNumber) {
        const p2 = (n: number) => String(n).padStart(2, "0");
        const today = new Date();
        resolvedKundendaten.date = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
      }
      draftPayload = { ...draftPayload, Kundendaten: resolvedKundendaten };
      const pricingPayload = { ...draftPayload, offerType: trimmedOffer };
      const computedPricing = await pricing.computePrices(pricingPayload);
      const doc: any = await Draft.create({
        name: trimmedName,
        offerType: trimmedOffer,
        payload: draftPayload,
        offerNumber: String(draftPayload?.offerNumber || "").trim() || undefined,
        pricing: computedPricing,
        pricingFingerprint: computeFingerprint(pricingPayload),
        savedAt: parsedSavedAt && !Number.isNaN(parsedSavedAt.getTime()) ? parsedSavedAt : new Date(),
        clientSaveId: clientSaveId ? String(clientSaveId) : undefined,
      });
      return reply.status(201).send({
        id: doc._id, name: doc.name, offerType: doc.offerType, offerNumber: doc.offerNumber,
        savedAt: doc.savedAt, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await findExisting();
        if (existing) return respondForExisting(existing);
      }
      req.log.error({ err }, "draft save failed");
      return fail(req, reply, 500, "INTERNAL", "Serverfehler beim Speichern des Entwurfs");
    }
  });
}
