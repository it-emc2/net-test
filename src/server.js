const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://automatisierungemc2configurator:dWSnuYvMlh06ltIz@emc2cluster.nzox91s.mongodb.net/';
const MONGODB_DB  = process.env.MONGODB_DB || 'KonfiguratorDB';
const PORT        = process.env.PORT || 3000;

// Mongo connect
mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB })
  .then(() => console.log('MongoDB connected ->', MONGODB_DB))
  .catch(err => { console.error('MongoDB connection error:', err); process.exit(1); });

// Models
const Product = require('./src/models/Product');
const Submission = require('./src/models/Submission');

// Business logic
const pricing = require('./src/logic/pricing')(Product);

// Routes
const api = express.Router();

api.get('/health', (req, res) => res.json({ ok: true, db: MONGODB_DB }));

// Products
api.post('/products/bulk', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length) return res.status(400).json({ error: 'Body must be an array of products' });
    const ops = items.map(p => ({
      updateOne: {
        filter: { productId: p.productId },
        update: {
  $set: {
    name:   p.name,
    price:  Number(p.price || 0),
    widthCm:  p.widthCm  ?? null,
    lengthCm: p.lengthCm ?? null,
    heightCm: p.heightCm ?? null,
    source:   p.source   ?? null,   // <‑‑ allow setting source
  },
},
        upsert: true
      }
    }));
    const result = await Product.bulkWrite(ops);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.get('/products/:id', async (req, res) => {
  try {
    const p = await Product.findOne({ productId: req.params.id }).lean();
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Pricing (no save)
api.post('/price', async (req, res) => {
  try {
    const payload = req.body;
    const result = await pricing.computePrices(payload);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Submissions (save + computed)
api.post('/submissions', async (req, res) => {
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

app.use('/api', api);

// Static frontend (put your index.html here)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for direct navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});