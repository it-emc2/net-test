import { Router } from "express";

const router = Router();

const PLANNING_API_BASE_URL = (
  process.env.PLANNING_API_BASE_URL || "https://route-plannung.fly.dev"
).replace(/\/+$/, "");

const PLANNING_API_KEY = process.env.PLANNING_API_KEY || "";

function buildPlanningUrl(pathname) {
  return `${PLANNING_API_BASE_URL}${pathname}`;
}

function apiKeyHeader() {
  return PLANNING_API_KEY ? { "X-Api-Key": PLANNING_API_KEY } : {};
}

async function readUpstreamBody(upstream) {
  const contentType = upstream.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return upstream.json();
  }

  const text = await upstream.text();
  return { ok: upstream.ok, status: upstream.status, raw: text };
}

router.get("/planning/current", async (_req, res) => {
  try {
    const upstream = await fetch(buildPlanningUrl("/api/planning/current"), {
      headers: {
        Accept: "application/json",
        ...apiKeyHeader(),
      },
    });

    const body = await readUpstreamBody(upstream);
    return res.status(upstream.status).json(body);
  } catch (error) {
    console.error("GET /api/planning/current failed:", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

router.get("/planning/stream", async (req, res) => {
  const controller = new AbortController();

  req.on("close", () => {
    controller.abort();
  });

  try {
    const upstream = await fetch(buildPlanningUrl("/api/planning/stream"), {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...apiKeyHeader(),
      },
      signal: controller.signal,
    });

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
    if (controller.signal.aborted) {
      return;
    }

    console.error("GET /api/planning/stream failed:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: error?.message || String(error),
      });
    }

    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: error?.message || String(error),
      })}\n\n`,
    );
    res.end();
  }
});

// Tells the route planner a termin didn't happen, so it marks today's entry
// cancelled and puts the lead back into its Warteschlange. Never throws: the
// Bitrix move already succeeded and must not be reported as failed.
export async function notifyTerminNotHeld({ dealId, reason, by }) {
  try {
    const upstream = await fetch(buildPlanningUrl("/api/planning/termin-not-held"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...apiKeyHeader() },
      body: JSON.stringify({ dealId, reason, by }),
    });
    const body = await upstream.json().catch(() => ({}));
    return upstream.ok ? { ok: true, found: Boolean(body?.found) } : { ok: false, error: body?.message || `HTTP ${upstream.status}` };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export default router;
