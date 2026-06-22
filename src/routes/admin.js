import express from 'express';
import crypto from 'crypto';
import configService, { CONFIG_SCHEMA } from '../services/configService.js';
import AppConfig from '../models/AppConfig.js';

const router = express.Router();

function getSecret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || 'fallback-insecure';
}

function createToken() {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', getSecret()).update(String(expiry)).digest('hex');
  return `${expiry}.${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Date.now() > Number(expiry)) return false;
  const expected = crypto.createHmac('sha256', getSecret()).update(expiry).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// POST /admin/api/login
router.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'ADMIN_PASSWORD ist nicht konfiguriert' });
  if (!password || password !== expected) return res.status(401).json({ error: 'Falsches Passwort' });
  res.json({ token: createToken() });
});

// GET /admin/api/config — all config items with metadata + current values
router.get('/api/config', requireAuth, async (req, res) => {
  try {
    const docs = await AppConfig.find({}).lean();
    const docsMap = new Map(docs.map(d => [d.key, d.value]));

    const result = CONFIG_SCHEMA.map(def => ({
      key: def.key,
      label: def.label,
      description: def.description || '',
      note: def.note || '',
      unit: def.unit || '',
      type: def.type,
      section: def.section,
      order: def.order,
      defaultValue: def.value,
      value: docsMap.has(def.key) ? docsMap.get(def.key) : def.value,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /admin/api/config — bulk update
router.put('/api/config', requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Body muss ein Objekt sein' });
    }
    const validKeys = new Set(CONFIG_SCHEMA.map(d => d.key));
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => validKeys.has(k)),
    );
    await configService.setMany(filtered);
    res.json({ ok: true, updated: Object.keys(filtered).length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/api/config/reset — reset one key to default
router.post('/api/config/reset', requireAuth, async (req, res) => {
  try {
    const { key } = req.body || {};
    const def = CONFIG_SCHEMA.find(d => d.key === key);
    if (!def) return res.status(404).json({ error: 'Unbekannter Key' });
    await configService.set(key, def.value);
    res.json({ ok: true, key, value: def.value });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
