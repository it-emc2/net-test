// routes/trays.js
import { Router } from 'express';
import Product from '../models/Product.js';

const r = Router();

r.get('/suggest', async (req, res) => {
  try {
    const w = Number(req.query.w), l = Number(req.query.l), h = Number(req.query.h);
    if (![w,l,h].every(Number.isFinite)) return res.status(400).json({ error: 'Bad query' });

    // only SLA* products with dimensions
      // Primary: only trays >= the requested size on all 3 axes
  const items = await Product.find(
    {
      productId: /^SLA/i,
      widthCm:  { $gte: w },
      lengthCm: { $gte: l },
      heightCm: { $gte: h }
    },
    { productId: 1, name: 1, price: 1, widthCm: 1, lengthCm: 1, heightCm: 1 }
  ).lean();

  let pool = items;
  // Fallback: if none are >=, consider any SLA trays (still pick the closest 3)
  if (!pool.length) {
    pool = await Product.find(
      { productId: /^SLA/i, widthCm: { $gt: 0 }, lengthCm: { $gt: 0 }, heightCm: { $gt: 0 } },
     { productId: 1, name: 1, price: 1, widthCm: 1, lengthCm: 1, heightCm: 1 }
    ).lean();
  }

  const score = (a,b) => Math.hypot(a.widthCm-b.widthCm, a.lengthCm-b.lengthCm, a.heightCm-b.heightCm);
  const results = pool
    .map(p => ({ ...p, score: score(p, { widthCm: w, lengthCm: l, heightCm: h }) }))
    .sort((a,b) => (a.score - b.score) || (a.price - b.price))
    .slice(0, 3);

  res.json({ results, input: { w, l, h } });
  } catch (e) {
    console.error('suggest error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default r;
