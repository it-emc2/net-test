// src/routes/magic.js
import express from 'express';
import { callExternal } from '../external/magicApi.js';

const router = express.Router();

// Beispiel: reines Health-Forwarding
router.get('/health', async (req, res) => {
  try {
    const data = await callExternal('get', '/api/health');
    res.json(data);
  } catch (err) {
    console.error('magic /health failed', err.response?.data || err);
    res
      .status(500)
      .json({ error: 'External API error', detail: err.response?.data || String(err) });
  }
});

// Beispiel: Produkte aus externer API holen
router.get('/products', async (req, res) => {
  try {
    const data = await callExternal('get', '/api/products', {
      params: req.query,
    });

    // Optional: hier Daten mappen oder in deine eigene Product‑Collection schreiben
    res.json(data);
  } catch (err) {
    console.error('magic /products failed', err.response?.data || err);
    res
      .status(500)
      .json({ error: 'External API error', detail: err.response?.data || String(err) });
  }
});

export default router;