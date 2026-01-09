// src/routes/offers.js - Updated POST handler

import express from 'express';
import Offer from '../models/Offer.js';

export const router = express.Router();

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