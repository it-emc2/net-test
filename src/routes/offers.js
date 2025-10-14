// src/routes/offers.js
import express from 'express';
import Offer from '../models/Offer.js';

const router = express.Router();

// Utility: safely read nested
const get = (obj, path, def = undefined) =>
  path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : def), obj);

// Utility: derive fast-searchable customer fields
function deriveCustomer(payload) {
  const b = payload?.bereich || {};
  return {
    salutation: b.salutation || b.Anrede || '',
    firstName:  b.firstName  || b.Vorname || '',
    lastName:   b.lastName   || b.Nachname || '',
    customerNumber: b.customerNumber || '',
    city:       b.city || b.Stadt || '',
    postalCode: b.postalCode || b.PLZ || '',
    phone:      b.phone || '',
    email:      b.email || '',
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
    const { offerNumber, payload, pricing, pdfUrl } = req.body || {};
    if (!offerNumber || !payload || !pricing) {
      return res.status(400).json({ error: 'offerNumber, payload and pricing are required.' });
    }

    const customer = deriveCustomer(payload);
    const hassmannQuickAdd = deriveHassmannQuickAdd(payload);

    const doc = await Offer.findOneAndUpdate(
      { offerNumber },
      {
        $set: {
          offerNumber,
          payload,
          pricing,
          customer,
          hassmannQuickAdd,   // <- derived here
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
