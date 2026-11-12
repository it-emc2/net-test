// Customers: store, search, read (legacy src/routes/customers.js; contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mongoose from "mongoose";
import { Customer } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

// ---------------- customers (legacy helpers, verbatim semantics) ----------------
const escRegex = (v = "") => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ns = (v: unknown) => String(v ?? "").trim();
function pickSearchableKundendaten(s: any = {}) {
  return {
    salutation: ns(s.salutation), customerNumber: ns(s.customerNumber || s.bitrixContactId),
    bitrixContactId: ns(s.bitrixContactId || s.customerNumber), firstName: ns(s.firstName), lastName: ns(s.lastName),
    company: ns(s.company), email: ns(s.email).toLowerCase(), phone: ns(s.phone), street: ns(s.street), city: ns(s.city),
    postalCode: ns(s.postalCode), state: ns(s.state), country: ns(s.country), emc2_contact: ns(s.emc2_contact),
    payer: ns(s.payer), customerType: ns(s.customerType), deployment: ns(s.deployment), kassenkundeName: ns(s.kassenkundeName),
    cp_name: ns(s.cp_name), cp_phone: ns(s.cp_phone), cp_city: ns(s.cp_city),
  };
}
function normalizeCustomerPayload(body: any = {}) {
  const kundendaten = body?.kundendaten && typeof body.kundendaten === "object" ? body.kundendaten : body;
  return { ...pickSearchableKundendaten(kundendaten), kundendaten, sourceOfferType: ns(body.sourceOfferType || body.offerType || "") };
}
function buildSearchFilter(q: string) {
  const safe = escRegex(q.trim());
  const rx = new RegExp(safe, "i");
  // NOTE (legacy quirk kept): emc2_contact / cp_name / kassenkundeName are not in the strict
  // schema, so they are never stored and these clauses never match.
  return {
    $or: [
      { customerNumber: rx }, { bitrixContactId: rx }, { firstName: rx }, { lastName: rx }, { company: rx },
      { email: rx }, { phone: rx }, { city: rx }, { street: rx }, { cp_name: rx }, { emc2_contact: rx }, { kassenkundeName: rx },
      { $expr: { $regexMatch: { input: { $trim: { input: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] } } }, regex: safe, options: "i" } } },
    ],
  };
}

export async function registerCustomers(app: FastifyInstance) {
  // ---------------- customers ----------------
  app.post("/api/customers", async (req, reply) => {
    const data = normalizeCustomerPayload(req.body ?? {});
    if (!data.firstName && !data.lastName && !data.company && !data.cp_name) {
      return fail(req, reply, 400, "BAD_REQUEST", "Bitte mindestens Vorname/Nachname, Firma oder Ansprechpartner angeben.");
    }
    const filter = data.customerNumber
      ? { customerNumber: data.customerNumber }
      : { firstName: data.firstName, lastName: data.lastName, company: data.company, email: data.email };
    // FIX B-1 (ADR 016): a missing customer number is stored as ABSENT, not "". The collection
    // has a unique *sparse* index on customerNumber — sparse skips only missing fields, so the
    // legacy "" made every second customer without number fail with HTTP 500.
    const { customerNumber, ...rest } = data;
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (customerNumber) set.customerNumber = customerNumber;
    const customer = await Customer.findOneAndUpdate(
      filter,
      { $set: set, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return { ok: true, customer };
  });

  app.get("/api/customers/search", async (req) => {
    const query = req.query as Record<string, string | undefined>;
    const q = String(query.q || "").trim();
    const limit = Math.min(Math.max(Number.parseInt(query.limit || "10", 10) || 10, 1), 50);
    if (!q) return { ok: true, items: [] };
    const items = await Customer.find(buildSearchFilter(q))
      .sort({ updatedAt: -1, createdAt: -1 }).limit(limit)
      .select("customerNumber bitrixContactId salutation firstName lastName company email phone street city postalCode state country emc2_contact payer customerType deployment kassenkundeName cp_name cp_phone cp_city kundendaten sourceOfferType updatedAt createdAt")
      .lean();
    return { ok: true, items };
  });

  app.get("/api/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!mongoose.isValidObjectId(id)) return fail(req, reply, 404, "NOT_FOUND", "Kundendaten nicht gefunden.");
    const customer = await Customer.findById(id).lean();
    if (!customer) return fail(req, reply, 404, "NOT_FOUND", "Kundendaten nicht gefunden.");
    return { ok: true, customer };
  });
}
