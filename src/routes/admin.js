import express from 'express';
import configService, { CONFIG_SCHEMA } from '../services/configService.js';
import AppConfig from '../models/AppConfig.js';
import SigningRequest from '../models/SigningRequest.js';
import User from '../models/User.js';
import {
  verifyPassword,
  createToken,
  verifyToken,
  tokenFromReq,
  SESSION_COOKIE,
} from '../services/authService.js';

const router = express.Router();

// Admin access = a named user (from the users collection) with role 'admin'.
async function requireAdmin(req, res, next) {
  try {
    const t = verifyToken(tokenFromReq(req));
    if (!t) return res.status(401).json({ error: 'Unauthorized' });
    const user = await User.findOne({ email: t.email, active: true }).lean();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin-Zugriff erforderlich' });
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

// POST /admin/api/login  { email, password } — only admin-role users may enter.
router.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
    }
    if (user.role !== 'admin') return res.status(403).json({ error: 'Kein Admin-Zugriff für dieses Konto' });

    const token = createToken(email);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
    user.lastLoginAt = new Date();
    await user.save();

    res.json({ token, user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('POST /admin/api/login failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/api/config — all config items with metadata + current values
router.get('/api/config', requireAdmin, async (req, res) => {
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
router.put('/api/config', requireAdmin, async (req, res) => {
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
router.post('/api/config/reset', requireAdmin, async (req, res) => {
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

// ---------------- Online-signing dashboard ----------------

// GET /admin/api/signing?status=&q=
// Lists all signing requests with a status rollup. Lazily flips overdue
// (not-yet-completed) requests to "expired" before returning.
router.get('/api/signing', requireAdmin, async (req, res) => {
  try {
    // lazy-expire overdue, not-yet-completed requests
    await SigningRequest.updateMany(
      {
        status: { $in: ['sent', 'opened', 'partially_signed'] },
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: 'expired' } },
    );

    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ offerNumber: re }, { customerName: re }, { customerEmail: re }];
    }

    const docs = await SigningRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const items = docs.map((sr) => ({
      token: sr.token,
      offerNumber: sr.offerNumber,
      customerType: sr.customerType,
      customerName: sr.customerName,
      customerEmail: sr.customerEmail,
      status: sr.status,
      signedCount: (sr.documents || []).filter((d) => d.status === 'signed').length,
      docCount: (sr.documents || []).length,
      createdAt: sr.createdAt,
      openedAt: sr.openedAt,
      completedAt: sr.completedAt,
      expiresAt: sr.expiresAt,
      bitrixEntityId: sr.bitrixEntityId,
    }));

    const counts = {};
    for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1;

    res.json({ items, counts, total: items.length });
  } catch (err) {
    console.error('GET /admin/api/signing failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
