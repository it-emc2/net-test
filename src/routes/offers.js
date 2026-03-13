// src/routes/offers.js - Updated POST handler

import express from 'express';
import Offer from '../models/Offer.js';
import Draft from '../models/Draft.js';

export const router = express.Router();

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function scoreSearchResult(doc, rawQuery) {
  const q = String(rawQuery || '').trim();
  if (!q) return 0;

  const qLower = q.toLowerCase();
  const qDigits = q.replace(/\D/g, '');

  const values = {
    offerNumber: normalizeValue(doc.offerNumber),
    angNumber: normalizeValue(doc.angNumber),
    customerNumber: normalizeValue(doc.customerNumber),
    dealId: normalizeValue(doc.dealId),
    firstName: normalizeValue(doc.firstName),
    lastName: normalizeValue(doc.lastName),
    city: normalizeValue(doc.city),
    email: normalizeValue(doc.email),
    postalCode: normalizeValue(doc.postalCode),
    phone: normalizeValue(doc.phone),
    createdAt: normalizeValue(doc.createdAt),
    updatedAt: normalizeValue(doc.updatedAt)
  };

  let score = 0;

  const angCandidates = [values.offerNumber, values.angNumber, values.customerNumber].filter(Boolean);
  const dealCandidates = [values.dealId].filter(Boolean);
  const surnameCandidates = [values.lastName].filter(Boolean);
  const cityCandidates = [values.city].filter(Boolean);
  const otherCandidates = [
    values.firstName,
    values.email,
    values.postalCode,
    values.phone,
    values.createdAt,
    values.updatedAt
  ].filter(Boolean);

  for (const value of angCandidates) {
    const lower = value.toLowerCase();
    const digits = value.replace(/\D/g, '');
    if (lower === qLower) score += 1000;
    else if (lower.startsWith(qLower)) score += 700;
    else if (lower.includes(qLower)) score += 420;
    if (qDigits && digits && digits === qDigits) score += 850;
  }

  for (const value of dealCandidates) {
    const lower = value.toLowerCase();
    const digits = value.replace(/\D/g, '');
    if (lower === qLower) score += 920;
    else if (lower.startsWith(qLower)) score += 650;
    else if (lower.includes(qLower)) score += 380;
    if (qDigits && digits && digits === qDigits) score += 780;
  }

  for (const value of surnameCandidates) {
    const lower = value.toLowerCase();
    if (lower === qLower) score += 820;
    else if (lower.startsWith(qLower)) score += 560;
    else if (lower.includes(qLower)) score += 310;
  }

  for (const value of cityCandidates) {
    const lower = value.toLowerCase();
    if (lower === qLower) score += 540;
    else if (lower.startsWith(qLower)) score += 360;
    else if (lower.includes(qLower)) score += 210;
  }

  for (const value of otherCandidates) {
    const lower = value.toLowerCase();
    if (lower === qLower) score += 200;
    else if (lower.startsWith(qLower)) score += 120;
    else if (lower.includes(qLower)) score += 60;
  }

  if (values.firstName && values.lastName) {
    const fullName = `${values.firstName} ${values.lastName}`.trim().toLowerCase();
    if (fullName === qLower) score += 700;
    else if (fullName.includes(qLower)) score += 250;
  }

  return score;
}

function mapSearchResult(doc, type, query) {
  const kundendaten = doc.payload?.Kundendaten || doc.kundendaten || {};

  const mapped = {
    ...doc,
    _type: type,
    id: doc._id,
    offerNumber: doc.offerNumber || doc.angNumber || doc.customerNumber || '',
    angNumber: doc.angNumber || doc.offerNumber || doc.customerNumber || '',
    customerNumber: doc.customerNumber || '',
    dealId: doc.dealId || kundendaten.dealId || doc.payload?.dealId || '',
    firstName: doc.firstName || kundendaten.firstName || '',
    lastName: doc.lastName || kundendaten.lastName || '',
    email: doc.email || kundendaten.email || '',
    city: doc.city || kundendaten.city || '',
    postalCode: doc.postalCode || kundendaten.postalCode || '',
    phone: doc.phone || kundendaten.phone || '',
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };

  mapped._score = scoreSearchResult(mapped, query);
  return mapped;
}

// ===========================
// GLOBAL SEARCH across Drafts + Offers
// Must be above '/:offerNumber'
// ===========================
router.get('/search-all', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    if (!q) {
      return res.json([]);
    }

    const safeRegex = new RegExp(escapeRegex(q), 'i');

    const searchFields = [
      'offerNumber',
      'angNumber',
      'customerNumber',
      'dealId',
      'firstName',
      'lastName',
      'email',
      'city',
      'postalCode',
      'street',
      'company',
      'phone',
      'payload.Kundendaten.firstName',
      'payload.Kundendaten.lastName',
      'payload.Kundendaten.email',
      'payload.Kundendaten.city',
      'payload.Kundendaten.postalCode',
      'payload.Kundendaten.street',
      'payload.Kundendaten.company',
      'payload.Kundendaten.phone',
      'payload.Zusammenfassung.angebotNummer',
      'payload.Zusammenfassung.dealId',
      'payload.Anfragedetails.rawImportText',
      'payload.Anfragedetails.dealTitle',
      'payload.Anfragedetails.Anfragedetails',
      'kundendaten.firstName',
      'kundendaten.lastName',
      'kundendaten.email',
      'kundendaten.city',
      'kundendaten.postalCode',
      'kundendaten.street',
      'kundendaten.company',
      'kundendaten.phone'
    ];

    const orQuery = searchFields.map((field) => ({ [field]: safeRegex }));
    const mongoQuery = { $or: orQuery };

    const [drafts, offers] = await Promise.all([
      Draft.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(limit * 2).lean(),
      Offer.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(limit * 2).lean()
    ]);

    const results = [
      ...drafts.map((doc) => mapSearchResult(doc, 'draft', q)),
      ...offers.map((doc) => mapSearchResult(doc, 'offer', q))
    ];

    results.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bDate - aDate;
    });

    res.json(results.slice(0, limit));
  } catch (err) {
    console.error('[offers] SEARCH-ALL error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/offers/:offerNumber - Load an offer by number
router.get('/:offerNumber', async (req, res) => {
  try {
    const { offerNumber } = req.params;
    
    const offer = await Offer.findOne({ offerNumber }).lean();
    
    if (!offer) {
      return res.status(404).json({ 
        error: 'Angebot nicht gefunden',
        offerNumber 
      });
    }
    
    res.json({ ok: true, offer });
  } catch (err) {
    console.error('[offers] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/offers - Save a new offer or update existing
router.post('/', async (req, res) => {
  try {
    const { offerNumber, offerType, payload, pricing, status } = req.body;
    
    if (!offerNumber) {
      return res.status(400).json({ error: 'offerNumber ist erforderlich' });
    }
    
    if (!payload) {
      return res.status(400).json({ error: 'payload ist erforderlich' });
    }

    // Prepare the offer document
    const offerDoc = {
      offerNumber,
      offerType: offerType || 'bu',
      payload,
      pricing: pricing || null,
      status: status || 'saved',
      updatedAt: new Date()
    };

    // Upsert: update if exists, insert if not
    const result = await Offer.findOneAndUpdate(
      { offerNumber },
      { 
        $set: offerDoc,
        $setOnInsert: { createdAt: new Date() }
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true 
      }
    );

    console.log('[offers] Saved offer:', offerNumber);

    res.json({
      ok: true,
      offer: result,
      message: `Angebot ${offerNumber} erfolgreich gespeichert`
    });

  } catch (err) {
    console.error('[offers] POST error:', err);
    
    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(409).json({ 
        error: 'Ein Angebot mit dieser Nummer existiert bereits' 
      });
    }
    
    res.status(500).json({ error: err.message });
  }
});

// GET /api/offers - List all offers (with optional search)
router.get('/', async (req, res) => {
  try {
    const { q, offerType, limit = 50 } = req.query;
    
    const filter = {};
    
    if (q) {
      filter.$or = [
        { offerNumber: { $regex: q, $options: 'i' } },
        { 'payload.Kundendaten.lastName': { $regex: q, $options: 'i' } },
        { 'payload.Kundendaten.firstName': { $regex: q, $options: 'i' } }
      ];
    }
    
    if (offerType) {
      filter.offerType = offerType;
    }

    const offers = await Offer.find(filter)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit, 10))
      .select('offerNumber offerType status createdAt updatedAt payload.Kundendaten.firstName payload.Kundendaten.lastName')
      .lean();

    res.json(offers);
  } catch (err) {
    console.error('[offers] LIST error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
