import { Router } from "express";

const router = Router();

const PLANNING_API_BASE_URL = (
  process.env.PLANNING_API_BASE_URL || "https://route-plannung.fly.dev"
).replace(/\/+$/, "");

const PLANNING_USERNAME = process.env.PLANNING_USERNAME || "";
const PLANNING_PASSWORD = process.env.PLANNING_PASSWORD || "";

// Cached session cookie — refreshed on login or 401
let _sessionCookie = null;

function buildPlanningUrl(pathname) {
  return `${PLANNING_API_BASE_URL}${pathname}`;
}

async function loginToPlanning() {
  if (!PLANNING_USERNAME || !PLANNING_PASSWORD) {
    throw new Error(
      "PLANNING_USERNAME and PLANNING_PASSWORD must be set in .env to authenticate with the planning service"
    );
  }

  const res = await fetch(buildPlanningUrl("/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      username: PLANNING_USERNAME,
      password: PLANNING_PASSWORD,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    _sessionCookie = null;
    throw new Error(`Planning login failed (${res.status}): ${detail}`);
  }

  // Collect Set-Cookie headers and extract key=value pairs only
  const rawCookies = res.headers.getSetCookie?.() ?? [];
  if (!rawCookies.length) {
    const single = res.headers.get("set-cookie");
    if (single) rawCookies.push(single);
  }
  _sessionCookie = rawCookies.map((c) => c.split(";")[0].trim()).join("; ");

  console.log("[planning] Session refreshed.");
  return _sessionCookie;
}

async function getSessionCookie() {
  if (_sessionCookie) return _sessionCookie;
  return loginToPlanning();
}

async function planningFetch(pathname, opts = {}, retry = true) {
  const cookie = await getSessionCookie();

  const res = await fetch(buildPlanningUrl(pathname), {
    ...opts,
    headers: {
      Accept: "application/json",
      ...opts.headers,
      Cookie: cookie,
    },
  });

  // Session expired — re-login once and retry
  if (res.status === 401 && retry) {
    _sessionCookie = null;
    await loginToPlanning();
    return planningFetch(pathname, opts, false);
  }

  return res;
}

// ── GET /api/planning/current ────────────────────────────────────────────────
router.get("/planning/current", async (_req, res) => {
  try {
    const upstream = await planningFetch("/api/planning/current");
    const body = await upstream.json().catch(async () => {
      const text = await upstream.text().catch(() => "");
      return { ok: false, status: upstream.status, raw: text };
    });
    return res.status(upstream.status).json(body);
  } catch (error) {
    console.error("GET /api/planning/current failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});

// ── GET /api/planning/stream ─────────────────────────────────────────────────
router.get("/planning/stream", async (req, res) => {
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const openUpstream = async (retry = true) => {
    const cookie = await getSessionCookie();
    const upstream = await fetch(buildPlanningUrl("/api/planning/stream"), {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        Cookie: cookie,
      },
      signal: controller.signal,
    });

    if (upstream.status === 401 && retry) {
      _sessionCookie = null;
      await loginToPlanning();
      return openUpstream(false);
    }

    return upstream;
  };

  try {
    const upstream = await openUpstream();

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return res.status(upstream.status).json({
        ok: false,
        error: "Planning stream unavailable",
        detail,
      });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error("GET /api/planning/stream failed:", error);

    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: error?.message || String(error) });
    }

    res.write(
      `event: error\ndata: ${JSON.stringify({ error: error?.message || String(error) })}\n\n`
    );
    res.end();
  }
});

export default router;
