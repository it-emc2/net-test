// src/routes/offers.js
import express from 'express';
import Offer from '../models/Offer.js';

const router = express.Router();

// Utility: safely read nested
const get = (obj, path, def = undefined) =>
  path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : def), obj);

// Utility: derive fast-searchable customer fields
function deriveCustomer(payload) {
  const k = payload?.Kundendaten || {};
  const b = payload?.bereich || {};

  return {
    salutation: k.salutation || b.salutation || b.Anrede || '',
    firstName:  k.firstName  || b.firstName  || b.Vorname || '',
    lastName:   k.lastName   || b.lastName   || b.Nachname || '',
    customerNumber: k.customerNumber || b.customerNumber || '',
    city:       k.city || b.city || b.Stadt || '',
    postalCode: k.postalCode || b.postalCode || b.PLZ || '',
    phone:      k.phone || b.phone || '',
    email:      k.email || b.email || '',
  };
}


// Utility: derive hassmann quick add FROM payload only
function deriveHassmannQuickAdd(payload) {
  const rows = get(payload, 'duschabtrennung.quickAdd', []);
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    kind: String(r?.kind || '').trim(),
    productId: String(r?.productId || r?.id || '').trim(),
    price: Number(
      typeof r?.price === 'string'
        ? r.price.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.')
        : r?.price || 0
    ) || 0,
    qty: Number(r?.qty || 0) || 0,
  })).filter(x => x.kind || x.productId || x.qty || x.price);
}

// POST /api/offers  (create/replace a snapshot by offerNumber)
router.post('/', async (req, res) => {
  try {
    const { offerNumber, offerType, payload, pricing, pdfUrl } = req.body || {};
    if (!offerNumber || !payload || !pricing) {
      return res.status(400).json({ error: 'offerNumber, payload and pricing are required.' });
    }

    const customer = deriveCustomer(payload);
    const hassmannQuickAdd = deriveHassmannQuickAdd(payload);

    const effectiveOfferType =
      offerType ||
      payload.activeOffer ||
      payload.offerType ||
      'bu';

    const doc = await Offer.findOneAndUpdate(
      { offerNumber },
      {
        $set: {
          offerNumber,
          offerType: effectiveOfferType,
          payload,
          pricing,
          customer,
          hassmannQuickAdd,
          pdfUrl: pdfUrl || null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ ok: true, offer: { id: doc._id, offerNumber: doc.offerNumber } });
  } catch (err) {
    console.error('[offers] POST failed:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// GET /api/offers/:offerNumber (fetch snapshot)
router.get('/:offerNumber', async (req, res) => {
  try {
    const { offerNumber } = req.params;
    const doc = await Offer.findOne({ offerNumber }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true, offer: doc });
  } catch (err) {
    console.error('[offers] GET failed:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
