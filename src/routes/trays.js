// routes/trays.js
import { Router } from 'express';
import Product from '../models/Product.js';

const r = Router();

r.get('/suggest', async (req, res) => {
  try {
    const w = Number(req.query.w), l = Number(req.query.l), h = Number(req.query.h);
    if (![w,l,h].every(Number.isFinite)) return res.status(400).json({ error: 'Bad query' });

    // only SLA* products with dimensions
    const items = await Product.find(
      { productId: /^SLA/i, widthCm: { $gt: 0 }, lengthCm: { $gt: 0 }, heightCm: { $gt: 0 } },
      { productId: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1 }
    ).lean();

    if (!items.length) return res.status(404).json({ error: 'No SLA products with dimensions' });

    const score = (a,b) => Math.hypot(a.widthCm-b.widthCm, a.lengthCm-b.lengthCm, a.heightCm-b.heightCm);
    const ranked = items
      .map(p => ({ ...p, distance: score(p, { widthCm: w, lengthCm: l, heightCm: h }) }))
      .sort((a,b) => a.distance - b.distance)
      .slice(0, 3);

    res.set('Cache-Control','no-store'); // avoid 304s
    res.json({ ok: true, query: { w,l,h }, suggestions: ranked });
  } catch (e) {
    console.error('suggest error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default r;
