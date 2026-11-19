// Offers + drafts — write endpoints (phase 4, group 2b). Ported 1:1 from legacy
// src/routes/offers.js + src/routes/drafts.js + src/lib/ansprechpartner.js.
// Legacy quirks kept on purpose (parity): computePrices mutates the payload it is given
// (shallow copies share nested sections, so the stored payload carries those changes);
// saving an offer always sets locked:true (the stored flag means "saved"; whether the price is
// pinned is decided by "sent" — sends/pinned-price.ts); `status` is not in the schema and is dropped.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { computeFingerprint, type PricingEngine } from "@oc/pricing";
import { Draft, Offer, User } from "../../platform/models.js";
import { OfferChangedError, assertUnchangedSinceSent, offerChangedBody } from "../sends/index.js";
import { isReactClient, markReactOffer, offerIdentity, sentOriginalFor } from "../sends/index.js";

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

/**
 * ANG<YYYY>-<MMDD>-<HHmmss> in Europe/Berlin wall-clock time (DST-aware), like the client —
 * the server runs in UTC (main 495b210b, src/routes/drafts.js berlinOfferNumber).
 */
export function berlinOfferNumber(d: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(d); // "2026-11-16 13:33:15"
  const m = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`berlinOfferNumber: unexpected date format "${s}"`);
  const [, y, mo, da, h, mi, se] = m;
  return `ANG${y}-${mo}${da}-${h}${mi}${se}`;
}

/** A sent (locked) offer number gets a fresh one so the edited copy never overwrites it. */
export async function freshNumberIfSent(offerNumber: string, now = () => new Date()): Promise<string | null> {
  if (!offerNumber) return null;
  if (!(await Offer.exists({ offerNumber, locked: true }))) return null;
  const base = berlinOfferNumber(now());
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
    const { offerNumber, offerType, payload, status, client } = (req.body ?? {}) as Record<string, any>;
    if (!offerNumber) return fail(req, reply, 400, "BAD_REQUEST", "offerNumber ist erforderlich");
    if (!payload) return fail(req, reply, 400, "BAD_REQUEST", "payload ist erforderlich");
    // An offer the OLD app sent, saved from today's UI: the stored offer stays as it is — the
    // form's rebuild of it is not the offer (sends/sent-original.ts). Nothing is written.
    if (await sentOriginalFor(offerNumber, payload, client)) {
      const kept = await Offer.findOne({ offerNumber }).lean();
      req.log.info({ offerNumber }, "offer sent by the old app — stored offer kept");
      return { ok: true, offer: kept, message: `Angebot ${offerNumber} erfolgreich gespeichert` };
    }
    // Decision C (ADR 023): an offer that was sent is immutable. Saving it again unchanged is
    // fine (downloads, post after e-mail); changed content under the sent number is refused —
    // before, it overwrote the sent offer while the old price stayed pinned (audit create F01).
    // An offer the old app sent (no send record, its logs say so) is refused the same way.
    try { await assertUnchangedSinceSent(String(offerNumber), payload); }
    catch (e) {
      if (e instanceof OfferChangedError) return reply.status(409).send(offerChangedBody(e, req.id));
      req.log.warn({ err: e, offerNumber }, "sent-offer check failed — saving anyway");
    }
    // Created by the React app, never sent and changed since the last save → priced FRESH by the
    // engine (sends/pinned-price.ts); forceRecompute on top, so that a switched-off auto-recompute
    // does not serve the old total either. An offer the old app stored keeps its price — the
    // engine ignores forceRecompute for it.
    let pricingPayload: Record<string, any> = { ...payload, offerNumber, offerType };
    let isNew = false;
    try {
      const stored: any = await Offer.findOne({ offerNumber }, { payload: 1 }).lean();
      isNew = !stored;
      if (stored?.payload && offerIdentity(stored.payload, offerNumber).contentHash !== offerIdentity(payload, offerNumber).contentHash) {
        pricingPayload = { ...pricingPayload, forceRecompute: true };
      }
    } catch (e) { req.log.warn({ err: e, offerNumber }, "stored-offer comparison failed — saving as before"); }
    // `_locked` tells the UI why the price does not move — a flag of the answer, never stored
    // (a saved-again old offer kept it in its price otherwise: seen on the copy of the real data)
    const { _locked: _flag, ...computedPricing } = (await pricing.computePrices(pricingPayload)) as Record<string, unknown>;
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
      // the React app says who it is (`client: "react"`); an offer it creates is a React offer (sends/origin.ts)
      if (isNew && isReactClient(client)) await markReactOffer(String(offerNumber)).catch((e) => req.log.warn({ err: e, offerNumber }, "marking the offer as created by the React app failed"));
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
