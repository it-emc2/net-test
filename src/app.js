import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import offersRouter from './routes/offers.js';


import traysRouter from './routes/trays.js';

// PDF/DOCX routes
import { router as pdfRouter } from './routes/pdf.js';
import pdfTemplateRouter from './routes/pdf-template.js';
import docxTemplateRouter from './routes/docx-template.js';

// Models (ESM default exports)
import Product from './models/Product.js';
import Submission from './models/Submission.js';
import Offer from './models/Offer.js'; // <-- NEW (ESM import)

// Pricing logic (factory(Product))
import pricingFactory from './logic/pricing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

process.env.PDFJS_DISABLE_WORKER = 'true';

// ---------------- Helmet / CSP ----------------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        frameSrc: ["'self'", "https://gconlineplus.de", "https://*.gconlineplus.de"],
        scriptSrc: [
          "'self'",
          // keep your hashes:
          "'sha256-/N6XS1N1HWcS1jcxJkTULItDFffd/I1mw8tPD5FTS3o='",
          "'sha256-5RmoD/+nJXNc4AM8oTu6YJEmH8lgRnYL9t8PcLUZxcY='",
          "'sha256-pmi68vLyMeGurqDvTzm+MD6lhDeARWXCNqv7x536RmA='",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

// Trust proxy (Fly/ngrok)
app.set('trust proxy', 1);

// ---------------- CORS ----------------
const allowedExact = new Set([
  'https://angebotskonfiguratoremc2.fly.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedExact.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (
      u.protocol === 'https:' &&
      (u.hostname === 'ngrok-free.app' || u.hostname.endsWith('.ngrok-free.app'))
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Preflight
app.options(
  /.*/,
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// ---------------- Common middleware ----------------
app.use(compression());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// ---------------- Mongo ----------------
mongoose.set('strictQuery', true);

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Set it in .env');
  process.exit(1);
}
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
console.log('MongoDB connected ->', MONGODB_DB);

// ---------------- Business logic ----------------
const pricing = pricingFactory(Product);

// ---------------- Routers ----------------
app.use('/api/trays', traysRouter);
app.use('/pdf', pdfRouter);
app.use('/pdf-template', pdfTemplateRouter);
app.use('/docx-template', docxTemplateRouter);
app.use('/material-overview', docxTemplateRouter);
app.use('/api/offers', offersRouter);
app.use('/api/offers', offersRouter);

// ---------------- Health ----------------
app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: MONGODB_DB, time: new Date().toISOString() })
);

// ---------------- Products APIs ----------------

// Bulk upsert products: [{ productId, name, price }]
app.post('/api/products/bulk', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length) {
      return res.status(400).json({ error: 'Body must be an array of products' });
    }
    const ops = items.map((p) => ({
      updateOne: {
        filter: { productId: p.productId },
        update: { $set: { name: p.name, price: Number(p.price || 0) } },
        upsert: true,
      },
    }));
    const result = await Product.bulkWrite(ops);
    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// SLA list (debug/helper)
app.get('/api/products/sla', async (req, res) => {
  try {
    const docs = await Product.find(
      { productId: /^SLA/i },
      { productId: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, price: 1 }
    )
      .sort({ lengthCm: 1, widthCm: 1, heightCm: 1 })
      .lean();

    return res.json(docs);
  } catch (e) {
    console.error('GET /api/products/sla failed:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Single product by productId
app.get('/api/products/:id', async (req, res) => {
  try {
    const p = await Product.findOne({ productId: req.params.id }).lean();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- Pricing (stateless) ----------------
app.post('/api/price', async (req, res) => {
  try {
    const payload = req.body;
    const result = await pricing.computePrices(payload);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- Submissions (legacy) ----------------
app.post('/api/submissions', async (req, res) => {
  try {
    const payload = req.body;
    const computed = await pricing.computePrices(payload);
    const doc = await Submission.create({ payload, computed });
    res.status(201).json({ id: doc._id, computed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- Health (legacy) ----------------
app.get('/health', (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// ---------------- Static ----------------
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- SPA fallback (keep LAST) ----------------
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------- Listen ----------------
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Mounted: POST /pdf-template');
  console.log('Mounted: POST /docx-template');
  console.log('Mounted: POST /api/products/bulk');
  console.log('Mounted: GET  /api/products/:id');
  console.log('Mounted: POST /api/price');
  console.log('Mounted: POST /api/submissions');
  console.log('Mounted: POST /api/offers/save');
  console.log('Mounted: GET  /api/offers/:offerNumber');
});
