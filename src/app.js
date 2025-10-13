import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import traysRouter from './routes/trays.js';

// PDF/DOCX routes (unchanged)
import { router as pdfRouter } from './routes/pdf.js';
import pdfTemplateRouter from './routes/pdf-template.js';
import docxTemplateRouter from './routes/docx-template.js';

// Models (ESM default exports; ensure files export default)
import Product from './models/Product.js';
import Submission from './models/Submission.js';

// Pricing logic (ESM default export -> factory(Product))
import pricingFactory from './logic/pricing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

process.env.PDFJS_DISABLE_WORKER = 'true';

// ---------------- Middleware ----------------
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // keep your existing script hashes here:
      "script-src": [
        "'self'",
        "'sha256-/N6XS1N1HWcS1jcxJkTULItDFffd/I1mw8tPD5FTS3o='",
        "'sha256-5RmoD/+nJXNc4AM8oTu6YJEmH8lgRnYL9t8PcLUZxcY='",
        "'sha256-pmi68vLyMeGurqDvTzm+MD6lhDeARWXCNqv7x536RmA='"
      ],
      // allow your existing inline styles / loaded CSS (adjust if you use a CDN)
      "style-src": ["'self'", "'unsafe-inline'"],
      // allow local + data: fonts; add a CDN here if you load fonts from one
      "font-src": ["'self'", "data:"],
      // typical safe allowances for images (adjust if you need a CDN)
      "img-src": ["'self'", "data:", "blob:"],
      // the only thing we need for the iframe:
      "frame-src": ["'self'", "https://gconlineplus.de", "https://*.gconlineplus.de"]
    }
  }
}));



// Trust proxy because ngrok is a reverse proxy
app.set('trust proxy', 1);

// Dynamic CORS allowing localhost and any HTTPS subdomain of ngrok-free.app
const allowedExact = new Set([
  'https://angebotskonfiguratoremc2.fly.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // allow same-origin/no Origin (curl, Postman)
  if (allowedExact.has(origin)) return true;

  try {
    const u = new URL(origin);
    // Allow any HTTPS origin on ngrok-free.app (any subdomain)
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

// Handle preflight for all routes
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

app.use(compression());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// ----- MongoDB connect -----
mongoose.set('strictQuery', true);

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Set it in .env');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
console.log('MongoDB connected ->', MONGODB_DB);

// ----- Business logic -----
const pricing = pricingFactory(Product);

app.use('/api/trays', traysRouter);
// ----- Existing routes (PDF/DOCX) -----
app.use('/pdf', pdfRouter);
app.use('/pdf-template', pdfTemplateRouter);
app.use('/docx-template', docxTemplateRouter);
app.use('/material-overview', docxTemplateRouter);


// ----- New API: health -----
app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: MONGODB_DB, time: new Date().toISOString() })
);

// ----- New API: Products -----

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
// --- ADD THIS ABOVE the :id route ---
app.get('/api/products/sla', async (req, res) => {
  try {
    const docs = await Product.find(
      { productId: /^SLA/i },
      { productId: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, price: 1 }
    )
    .sort({ lengthCm: 1, widthCm: 1, heightCm: 1 })
    .lean();

    return res.json(docs); // return [] if none
  } catch (e) {
    console.error('GET /api/products/sla failed:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Keep this AFTER the /sla route
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

// Get single product by Hersteller productId
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


// ----- New API: Pricing (does not save) -----
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

// ----- New API: Submissions (save + computed) -----
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

// Legacy health (kept)
app.get('/health', (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// List all SLA products with dimensions (debug utility)



// SPA fallback (keep this last)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Simple echo submit (kept)
app.post('/submit', (req, res) => {
  const payload = {
    receivedAt: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    body: req.body,
  };
  res.status(201).json(payload);
});

// Fallback to SPA index.html
// Express 5 + path-to-regexp v8: use a RegExp catch-all instead of "*"
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});




app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Mounted: POST /pdf-template');
  console.log('Mounted: POST /docx-template');
  console.log('Mounted: POST /api/products/bulk');
  console.log('Mounted: GET  /api/products/:id');
  console.log('Mounted: POST /api/price');
  console.log('Mounted: POST /api/submissions');
});