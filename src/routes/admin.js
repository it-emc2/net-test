import express from 'express';
import configService, { CONFIG_SCHEMA } from '../services/configService.js';
import AppConfig from '../models/AppConfig.js';
import SigningRequest from '../models/SigningRequest.js';
import BitrixLog from '../models/BitrixLog.js';
import UserActionLog from '../models/UserActionLog.js';
import PdfLog, { PDF_LOG_APP } from '../models/PdfLog.js';
import { RecordingSession, RecordingRequest, RECORDING_APP } from '../models/Recording.js';
import { b2Get } from '../services/b2.js';
import { retryBitrixLog } from './bitrix.js';
import { sendSignedDocsToBitrix, buildSignedPdf, buildDocumentPdf } from './signing.js';
import User from '../models/User.js';
import {
  verifyPassword,
  hashPassword,
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
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

// GET /admin/api/config/public — subset of config values needed by the logged-in
// frontend (not admin-only; still requires a session via the app-wide authGate).
const PUBLIC_CONFIG_KEYS = [
  'ENTLASTUNGSBETRAG_MONAT',
  'VERHINDERUNGSPFLEGE_JAHR',
  'PFLEGESACHLEISTUNG_UMWIDMUNG_MAX_PCT',
  'STEUERABSETZ_PCT',
  'STEUERABSETZ_CAP_JAHR',
  'BWT_TRAVEL_TIME_FREE_HOURS',
  'BWT_KM_FREE_THRESHOLD',
  'FAHRZEUGBEREITSTELLUNG',
  'WERKZEUG',
  'BERAEUMUNG',
  'WV_OWN_LAGER',
  'WV_LEFTOVER_USABLE_PERCENT',
  'WV_LEFTOVER_MIN_M2',
  'GRAB_BONUS_IDS',
  'NEUKUNDENBONUS_BRUTTO',
  'NEUKUNDENBONUS_SCHWELLE',
  'BU_SHOW_DA_HASSMANN',
];
router.get('/api/config/public', async (req, res) => {
  try {
    const result = {};
    for (const key of PUBLIC_CONFIG_KEYS) result[key] = configService.get(key);
    // Arbeitszeit minutes per task — one key per task, so read by prefix.
    for (const { key } of CONFIG_SCHEMA) {
      if (key.startsWith('AZ_MIN_')) result[key] = configService.get(key);
    }
    res.json(result);
  } catch (err) {
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
      documents: (sr.documents || []).map((d) => ({ key: d.key, status: d.status })),
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

// POST /admin/api/signing/:token/send-bitrix — push whatever documents are
// already signed to the Bitrix timeline, without waiting for the customer to
// finish the rest (e.g. link expired before completion).
router.post('/api/signing/:token/send-bitrix', requireAdmin, async (req, res) => {
  try {
    const sr = await SigningRequest.findOne({ token: req.params.token });
    if (!sr) return res.status(404).json({ error: 'Nicht gefunden' });
    const result = await sendSignedDocsToBitrix(sr);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /admin/api/signing/:token/send-bitrix failed:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// GET /admin/api/signing/:token/documents/:key/pdf — admin-only document view,
// bypasses the customer-facing expiry gate. Signed docs render with the
// captured signature; unsigned/pending docs render blank for preview.
router.get('/api/signing/:token/documents/:key/pdf', requireAdmin, async (req, res) => {
  try {
    const sr = await SigningRequest.findOne({ token: req.params.token });
    if (!sr) return res.status(404).json({ error: 'Nicht gefunden' });
    const key = String(req.params.key || '');
    const doc = (sr.documents || []).find((d) => d.key === key);
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });

    const pdf = doc.status === 'signed' ? await buildSignedPdf(sr, doc) : await buildDocumentPdf(sr, key);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${key}.pdf"`);
    res.end(pdf);
  } catch (err) {
    console.error('GET /admin/api/signing/:token/documents/:key/pdf failed:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ---------------- Bitrix error logs (admin) ----------------

// GET /admin/api/bitrix-logs — last 500 failed Bitrix calls (auto-expire after 30 days).
router.get('/api/bitrix-logs', requireAdmin, async (req, res) => {
  try {
    const docs = await BitrixLog.find({}).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ items: docs, total: docs.length });
  } catch (err) {
    console.error('GET /admin/api/bitrix-logs failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/api/bitrix-logs/:id/retry — replay a failed Bitrix call as-is.
router.post('/api/bitrix-logs/:id/retry', requireAdmin, async (req, res) => {
  try {
    const result = await retryBitrixLog(req.params.id);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ---------------- PDF engine stats (admin) ----------------

// Local soffice/Puppeteer warm medians from the 2026-11 benchmark; used as the
// "before" baseline until enough local/fallback rows exist in the window.
const PDF_BASELINE_MS = { docx: 5100, html: 2400 };

// GET /admin/api/pdf-stats?days=30 — per kind/engine counts + avg ms, time saved, last 200 failures.
router.get('/api/pdf-stats', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 864e5);
    const [groups, failures] = await Promise.all([
      PdfLog.aggregate([
        { $match: { app: PDF_LOG_APP, createdAt: { $gte: since } } },
        { $group: {
          _id: { kind: '$kind', engine: '$engine' },
          total: { $sum: 1 },
          ok: { $sum: { $cond: ['$ok', 1, 0] } },
          okMs: { $sum: { $cond: ['$ok', '$ms', 0] } },
          maxMs: { $max: '$ms' },
          last: { $max: '$createdAt' },
        } },
      ]),
      PdfLog.find({ app: PDF_LOG_APP, createdAt: { $gte: since }, ok: false }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);
    const rows = groups.map((g) => ({ ...g._id, total: g.total, ok: g.ok, failed: g.total - g.ok, avgMs: g.ok ? Math.round(g.okMs / g.ok) : null, maxMs: g.maxMs, last: g.last }));
    const saved = {};
    for (const kind of ['docx', 'html']) {
      const got = rows.find((r) => r.kind === kind && r.engine === 'gotenberg');
      const loc = rows.filter((r) => r.kind === kind && r.engine !== 'gotenberg' && r.ok);
      const locN = loc.reduce((n, r) => n + r.ok, 0);
      const baselineMs = locN >= 5 ? Math.round(loc.reduce((n, r) => n + r.avgMs * r.ok, 0) / locN) : PDF_BASELINE_MS[kind];
      saved[kind] = { baselineMs, measured: locN >= 5, ms: got?.ok ? Math.max(0, Math.round(got.ok * (baselineMs - got.avgMs))) : 0 };
    }
    res.json({ app: PDF_LOG_APP, days, rows, saved, failures });
  } catch (err) {
    console.error('GET /admin/api/pdf-stats failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- User action logs (admin) ----------------

// GET /admin/api/user-action-logs — last 500 events (auto-expire after 180 days).
// Optional filters: event, dealId, offerNumber (all exact match).
router.get('/api/user-action-logs', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    const event = String(req.query.event || '').trim();
    const dealId = String(req.query.dealId || '').trim();
    const offerNumber = String(req.query.offerNumber || '').trim();
    if (event) filter.event = event;
    if (dealId) filter.dealId = dealId;
    if (offerNumber) filter.offerNumber = offerNumber;

    const docs = await UserActionLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ items: docs, total: docs.length });
  } catch (err) {
    console.error('GET /admin/api/user-action-logs failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- User management (admin) ----------------

// GET /admin/api/users
router.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ firstName: 1, lastName: 1, email: 1 }).lean();
    res.json(
      users.map((u) => ({
        email: u.email,
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        name: u.name || '',
        role: u.role || 'user',
        active: u.active !== false,
        hasSignature: !!u.signatureDataUrl,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/api/users — create or update { email, firstName, lastName, role, active, password? }
router.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'E-Mail erforderlich' });
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const role = req.body?.role === 'admin' ? 'admin' : 'user';
    const active = req.body?.active !== false;
    const name = `${firstName} ${lastName}`.trim();

    const set = { firstName, lastName, name, role, active };
    if (req.body?.password) set.passwordHash = hashPassword(String(req.body.password));

    const existing = await User.findOne({ email });
    if (!existing && !req.body?.password) {
      return res.status(400).json({ error: 'Passwort für neuen Benutzer erforderlich' });
    }
    const doc = await User.findOneAndUpdate(
      { email },
      { $set: set },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ ok: true, email: doc.email });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/api/users/:email/signature — set the signature image (PNG data URL)
router.post('/api/users/:email/signature', requireAdmin, express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    const dataUrl = String(req.body?.dataUrl || '');
    if (dataUrl && !/^data:image\/(png|jpeg);base64,/.test(dataUrl)) {
      return res.status(400).json({ error: 'Ungültiges Bildformat (PNG/JPEG erwartet)' });
    }
    const doc = await User.findOneAndUpdate(
      { email },
      { $set: { signatureDataUrl: dataUrl } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    res.json({ ok: true, hasSignature: !!doc.signatureDataUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/api/users/:email/signature — return the stored signature (for preview)
router.get('/api/users/:email/signature', requireAdmin, async (req, res) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    const u = await User.findOne({ email }).lean();
    if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    res.json({ dataUrl: u.signatureDataUrl || '' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Session recordings (rrweb chunks in B2, index + request log in Mongo) ──
// GET /admin/api/recordings?days=7 — newest first, without the chunk list.
router.get('/api/recordings', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(31, Math.max(1, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 864e5);
    const items = await RecordingSession.find({ app: RECORDING_APP, startedAt: { $gte: since } })
      .sort({ startedAt: -1 }).limit(500)
      .select('sid email day startedAt lastAt ua viewport errorCount bytes chunks.seq').lean();
    res.json({ app: RECORDING_APP, items: items.map(({ chunks, ...s }) => ({ ...s, chunkCount: chunks?.length || 0 })) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/api/recordings/:sid — chunk list + the server requests of that user in the same window.
router.get('/api/recordings/:sid', requireAdmin, async (req, res) => {
  try {
    const s = await RecordingSession.findOne({ app: RECORDING_APP, sid: req.params.sid }).lean();
    if (!s) return res.status(404).json({ error: 'Nicht gefunden' });
    s.chunks.sort((a, b) => a.seq - b.seq);
    const requests = await RecordingRequest.find({
      app: RECORDING_APP, email: s.email,
      at: { $gte: new Date(+s.startedAt - 60e3), $lte: new Date(+s.lastAt + 60e3) },
    }).sort({ at: 1 }).limit(10000).select('-_id at method path status ms').lean();
    res.json({ session: s, requests });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /admin/api/recordings/:sid/chunk/:seq — gzip bytes as stored (the browser decompresses).
router.get('/api/recordings/:sid/chunk/:seq', requireAdmin, async (req, res) => {
  try {
    const s = await RecordingSession.findOne({ app: RECORDING_APP, sid: req.params.sid }, { chunks: 1 }).lean();
    const c = s?.chunks.find((x) => x.seq === Number(req.params.seq));
    if (!c) return res.status(404).json({ error: 'Nicht gefunden' });
    const buf = await b2Get(c.key);
    res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' }).send(buf);
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

export default router;
