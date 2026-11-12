// Session recording for selected users (RECORD_USERS, comma-separated emails).
// Empty RECORD_USERS or missing B2 keys = off everywhere (kill switch).
//   GET  /api/recording/config  -> { record: bool }
//   POST /api/recording/chunk   -> one gzip'd batch of rrweb events, stored in B2
// Plus logRecordedRequests: server-side request log for the same users.
import express from "express";
import { b2Configured, b2Put } from "../services/b2.js";
import { RecordingSession, RecordingRequest, RECORDING_APP } from "../models/Recording.js";

const router = express.Router();

const recordedUsers = () =>
  new Set(String(process.env.RECORD_USERS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));
export const isRecorded = (email) => !!email && b2Configured() && recordedUsers().has(String(email).toLowerCase());

const berlinDay = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d); // YYYY-MM-DD

router.get("/config", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ record: isRecorded(req.user?.email) });
});

router.post("/chunk", express.raw({ type: "application/gzip", limit: "15mb" }), async (req, res) => {
  const email = String(req.user?.email || "").toLowerCase();
  if (!isRecorded(email)) return res.status(403).json({ error: "not recorded" });
  const q = req.query;
  const sid = String(q.sid || "");
  const seq = Number(q.seq);
  const from = new Date(Number(q.from));
  const to = new Date(Number(q.to));
  if (!/^[0-9a-f-]{36}$/.test(sid) || !Number.isInteger(seq) || seq < 0 || seq > 1e6 || isNaN(from) || isNaN(to)) {
    return res.status(400).json({ error: "bad chunk params" });
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "empty body" });

  try {
    // Retries resend the same seq: answer ok without storing it twice.
    if (await RecordingSession.exists({ sid, "chunks.seq": seq })) return res.json({ ok: true, dup: true });

    const day = berlinDay(from);
    const key = `${RECORDING_APP}/${day}/${email}/${sid}/${String(seq).padStart(5, "0")}.json.gz`;
    await b2Put(key, req.body);

    const errorCount = Math.max(0, Number(q.errors) || 0);
    await RecordingSession.updateOne(
      { sid },
      {
        $setOnInsert: {
          app: RECORDING_APP, sid, email, day, // startedAt/lastAt come from $min/$max (also on insert)
          ua: String(req.headers["user-agent"] || "").slice(0, 300),
          viewport: String(q.vp || "").slice(0, 20),
        },
        $min: { startedAt: from },
        $max: { lastAt: to },
        $inc: { errorCount, bytes: req.body.length },
        $push: { chunks: { seq, key, bytes: req.body.length, from, to, errorCount } },
      },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[recording] chunk failed:", err?.message || err);
    res.status(502).json({ error: "store failed" }); // client keeps the chunk and retries
  }
});

// Polling/streaming and the recorder's own uploads would only add noise.
const SKIP = /^\/api\/(version|planning\/stream|recording\/)/;

export function logRecordedRequests(req, res, next) {
  if (!isRecorded(req.user?.email) || SKIP.test(req.path)) return next();
  const t0 = process.hrtime.bigint();
  res.on("finish", () => {
    RecordingRequest.create({
      app: RECORDING_APP,
      email: req.user.email.toLowerCase(),
      at: new Date(),
      method: req.method,
      path: req.originalUrl.slice(0, 300),
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - t0) / 1000000n),
    }).catch((e) => console.warn("[recording] request log failed:", e?.message || e)); // never blocks
  });
  next();
}

export default router;
