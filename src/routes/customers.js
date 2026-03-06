import { Router } from "express";
import Customer from "../models/Customer.js";

const router = Router();

function escRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function pickSearchableKundendaten(snapshot = {}) {
  return {
    salutation: normalizeString(snapshot.salutation),
    customerNumber: normalizeString(snapshot.customerNumber || snapshot.bitrixContactId),
    bitrixContactId: normalizeString(snapshot.bitrixContactId || snapshot.customerNumber),
    firstName: normalizeString(snapshot.firstName),
    lastName: normalizeString(snapshot.lastName),
    company: normalizeString(snapshot.company),
    email: normalizeString(snapshot.email).toLowerCase(),
    phone: normalizeString(snapshot.phone),
    street: normalizeString(snapshot.street),
    city: normalizeString(snapshot.city),
    postalCode: normalizeString(snapshot.postalCode),
    state: normalizeString(snapshot.state),
    country: normalizeString(snapshot.country),
    emc2_contact: normalizeString(snapshot.emc2_contact),
    payer: normalizeString(snapshot.payer),
    customerType: normalizeString(snapshot.customerType),
    deployment: normalizeString(snapshot.deployment),
    kassenkundeName: normalizeString(snapshot.kassenkundeName),
    cp_name: normalizeString(snapshot.cp_name),
    cp_phone: normalizeString(snapshot.cp_phone),
    cp_city: normalizeString(snapshot.cp_city),
  };
}

function normalizeCustomerPayload(body = {}) {
  const kundendaten = body?.kundendaten && typeof body.kundendaten === "object"
    ? body.kundendaten
    : body;

  const core = pickSearchableKundendaten(kundendaten);

  return {
    ...core,
    kundendaten,
    sourceOfferType: normalizeString(body.sourceOfferType || body.offerType || ""),
  };
}

function buildSearchFilter(q) {
  const safe = escRegex(q.trim());
  const rx = new RegExp(safe, "i");
  return {
    $or: [
      { customerNumber: rx },
      { bitrixContactId: rx },
      { firstName: rx },
      { lastName: rx },
      { company: rx },
      { email: rx },
      { phone: rx },
      { city: rx },
      { street: rx },
      { cp_name: rx },
      { emc2_contact: rx },
      { kassenkundeName: rx },
      {
        $expr: {
          $regexMatch: {
            input: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$firstName", ""] },
                    " ",
                    { $ifNull: ["$lastName", ""] },
                  ],
                },
              },
            },
            regex: safe,
            options: "i",
          },
        },
      },
    ],
  };
}

router.post("/", async (req, res) => {
  try {
    const data = normalizeCustomerPayload(req.body || {});

    if (!data.firstName && !data.lastName && !data.company && !data.cp_name) {
      return res.status(400).json({
        error: "Bitte mindestens Vorname/Nachname, Firma oder Ansprechpartner angeben.",
      });
    }

    const filter = data.customerNumber
      ? { customerNumber: data.customerNumber }
      : {
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company,
          email: data.email,
        };

    const customer = await Customer.findOneAndUpdate(
      filter,
      {
        $set: {
          ...data,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("[customers] POST error:", err);
    return res.status(500).json({ error: err.message || "Fehler beim Speichern." });
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10) || 10, 1), 50);

    if (!q) return res.json({ ok: true, items: [] });

    const items = await Customer.find(buildSearchFilter(q))
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .select(
        "customerNumber bitrixContactId salutation firstName lastName company email phone street city postalCode state country emc2_contact payer customerType deployment kassenkundeName cp_name cp_phone cp_city kundendaten sourceOfferType updatedAt createdAt",
      )
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    console.error("[customers] SEARCH error:", err);
    return res.status(500).json({ error: err.message || "Fehler bei der Suche." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ error: "Kundendaten nicht gefunden." });
    }
    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("[customers] GET error:", err);
    return res.status(500).json({ error: err.message || "Fehler beim Laden." });
  }
});

export default router;
