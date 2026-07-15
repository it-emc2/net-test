// Proxy to the external route-planning service (PLANNING_API_BASE_URL) for the
// "Heutige Termine" panel: a JSON snapshot + a live SSE stream. Body shape is
// defined upstream and passed through verbatim.
import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { requireAuth } from "../middleware/authGate.js";

const router = Router();
router.use(requireAuth);

const BASE = (process.env.PLANNING_API_BASE_URL || "https://route-plannung.fly.dev").replace(/\/+$/, "");
const KEY = process.env.PLANNING_API_KEY || "";
const keyHeader = (): Record<string, string> => (KEY ? { "X-Api-Key": KEY } : {});

// GET /api/planning/current — snapshot (JSON verbatim).
router.get("/current", async (_req: Request, res: Response) => {
  try {
    const up = await fetch(`${BASE}/api/planning/current`, { headers: { Accept: "application/json", ...keyHeader() } });
    const ct = up.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.status(up.status).json(await up.json());
    return res.status(up.status).json({ ok: up.ok, status: up.status, raw: await up.text() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[planning] current error:", err);
    return res.status(502).json({ error: "Planung nicht erreichbar" });
  }
});

// GET /api/planning/stream — SSE passthrough (live updates).
router.get("/stream", async (req: Request, res: Response) => {
  const controller = new AbortController();
  req.on("close", () => controller.abort());
  try {
    const up = await fetch(`${BASE}/api/planning/stream`, {
      headers: { Accept: "text/event-stream", "Cache-Control": "no-cache", ...keyHeader() },
      signal: controller.signal,
    });
    if (!up.ok || !up.body) {
      return res.status(up.status || 502).json({ error: "Planung-Stream nicht verfügbar" });
    }
    // no-transform stops the compression middleware from buffering the stream.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
    Readable.fromWeb(up.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return; // client closed
    // eslint-disable-next-line no-console
    console.error("[planning] stream error:", err);
    if (!res.headersSent) res.status(502).json({ error: "Stream-Fehler" });
  }
});

export default router;
