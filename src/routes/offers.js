// src/routes/offers.js
import express from 'express';
import Offer from '../models/Offer.js';

const router = express.Router();

/**
 * Save (create/replace) an offer snapshot
 * Body: { offerNumber, payload, pricing, pdfUrl? }
 */
router.post('/', async (req, res) => {
  try {
    const { offerNumber, payload, pricing, pdfUrl } = req.body || {};
    if (!offerNumber || !payload || !pricing) {
      return res.status(400).json({
        ok: false,
        error: 'offerNumber, payload and pricing are required.',
      });
    }

    // derive quick customer fields for searching
    const b = payload?.bereich || {};
    const customer = {
      salutation:     b.salutation || b.Anrede || '',
      firstName:      b.firstName  || b.Vorname || '',
      lastName:       b.lastName   || b.Nachname || '',
      phone:          b.phone || '',
      email:          b.email || '',
      customerNumber: b.customerNumber || '',
      city:           b.city || b.Stadt || '',
      postalCode:     b.postalCode || b.PLZ || '',
    };

    // normalize Hassmann quick add rows (if present)
    const hassmannQuickAdd = (payload?.duschabtrennung?.quickAdd || []).map((x) => ({
      kind:      String(x.kind || ''),
      productId: String(x.productId || ''),
      priceRaw:  typeof x.price === 'string' ? x.price : (x.price != null ? String(x.price) : ''),
      price:     Number.isFinite(+x.price) ? +x.price : undefined,
      qty:       Number(x.qty || 0),
    }));

    const doc = await Offer.findOneAndUpdate(
      { offerNumber },
      {
        $set: {
          payload,
          pricing,
          customer,
          hassmannQuickAdd,
          pdfUrl: pdfUrl || null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ ok: true, offer: { id: doc._id, offerNumber: doc.offerNumber } });
  } catch (err) {
    console.error('[offers] POST / -> failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * Fetch by offerNumber
 */
router.get('/:offerNumber', async (req, res) => {
  try {
    const { offerNumber } = req.params;
    const doc = await Offer.findOne({ offerNumber }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.json({ ok: true, offer: doc });
  } catch (err) {
    console.error('[offers] GET /:offerNumber -> failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
