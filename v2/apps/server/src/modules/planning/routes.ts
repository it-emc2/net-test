// /api/routing (distance suggestion) + /api/planning proxy — ports of legacy
// src/routes/routing.js and src/routes/planning.js. Contract test: same responses, same
// outgoing requests (geocoders/routers/planning service replaced by a recording stub).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildCustomerAddress } from "./address.js";
import type { RoutingService } from "./providers.js";
import type { PlanningClient } from "../../integrations/planning.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export const SUGGEST_TIMEOUT_MS = 5000;

export async function registerRouting(app: FastifyInstance, d: { routing: RoutingService; planning: PlanningClient }) {
  const { routing, planning } = d;

  app.post("/api/routing/suggest-distance", async (req, reply) => {
    try {
      const body = (req.body ?? {}) as any;
      const k = body.Kundendaten || body.bereich || body || {};
      const street = k.street || "", postalCode = k.postalCode || k.PLZ || "", city = k.city || k.Stadt || "";
      const offerType = typeof body.offerType === "string" ? body.offerType : undefined;
      const origin = routing.originFor(offerType); // "ah" starts at its own address; anything else as before
      const state = k.state || k.Bundesland || "", country = k.country || k.Land || "Deutschland";
      if (!street && !city && !postalCode) return fail(req, reply, 400, "BAD_REQUEST", "Missing address fields in Kundendaten.");
      const customerAddress = buildCustomerAddress({ street, postalCode, city, state, country });
      if (!customerAddress.trim()) return fail(req, reply, 400, "BAD_REQUEST", "Customer address could not be built.");
      if (!origin.address) return fail(req, reply, 500, "CONFIG", "COMPANY_ADDRESS missing on server.");
      // One deadline for the whole lookup (main PR #332, audit S-07): a slow or hanging provider
      // ends the request with a clear 504 after ~5 s instead of holding it open. The fallback
      // chains keep going after the deadline and unwind on their own.
      const lookup = (async () => {
        const start = await routing.companyCoords(offerType);
        const dest = await routing.geocodeWithVariants({ street, postalCode, city, state, country });
        const { km, seconds, provider } = await routing.roadDistance(start, dest);
        return { start, dest, km, seconds, routeProvider: provider };
      })();
      lookup.catch(() => {});
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), SUGGEST_TIMEOUT_MS); });
      const won = await Promise.race([lookup, timedOut]).finally(() => clearTimeout(timer));
      if (won === "timeout") {
        req.log.warn({ ms: SUGGEST_TIMEOUT_MS }, "suggest-distance timed out");
        return reply.status(504).send({
          ok: false, timeout: true,
          error: { code: "ROUTING_TIMEOUT", message: "Routenvorschlag gerade nicht verfügbar (Zeitüberschreitung). Bitte tragen Sie die Strecke von Hand ein.", requestId: req.id },
        });
      }
      const { start, dest, km, seconds, routeProvider } = won;
      const oneWayKm = Math.round(km * 2) / 2;
      const roundTripKm = Math.round(oneWayKm * 2 * 10) / 10;
      const oneWaySeconds = Math.round(seconds);
      req.log.info({ geocodeProvider: dest.provider, routeProvider, oneWayKm }, "distance suggested");
      return {
        ok: true, oneWayKm, roundTripKm, oneWaySeconds, roundTripSeconds: oneWaySeconds * 2,
        from: { address: origin.address, geocoded: start.displayName, lat: start.lat, lng: start.lng },
        to: { address: customerAddress, geocoded: dest.displayName, usedVariant: dest.usedAddress, lat: dest.lat, lng: dest.lng },
        geocodeProvider: dest.provider, routeProvider,
      };
    } catch (err) {
      req.log.error({ err }, "suggest-distance failed");
      return fail(req, reply, 500, "ROUTING_FAILED", (err as Error)?.message || "Routing lookup failed");
    }
  });

  app.get("/api/routing/health", async () => ({
    ok: true,
    companyAddress: routing.c.companyAddress,
    companyCoords: routing.c.companyLat && routing.c.companyLng ? { lat: routing.c.companyLat, lng: routing.c.companyLng } : null,
    providers: { ors: !!routing.c.orsApiKey, osrm: true, photon: true, nominatim: true },
  }));

  // ---- planning service proxy (status + body passed through like legacy) ----
  app.get("/api/planning/current", async (req, reply) => {
    try {
      const up = await planning.current();
      return reply.status(up.status).send(up.body);
    } catch (error) {
      req.log.error({ err: error }, "planning current failed");
      return reply.status(500).send({ ok: false, error: { code: "PLANNING_FAILED", message: (error as Error)?.message || String(error), requestId: req.id } });
    }
  });

  app.get("/api/planning/stream", async (req, reply) => {
    const controller = new AbortController();
    req.raw.on("close", () => controller.abort());
    try {
      const upstream = await planning.stream(controller.signal);
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        return reply.status(upstream.status).send({ ok: false, error: { code: "PLANNING_STREAM", message: "Planning stream unavailable", requestId: req.id }, detail });
      }
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      try {
        for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
      } catch (error) {
        if (!controller.signal.aborted) res.write(`event: error\ndata: ${JSON.stringify({ error: (error as Error)?.message || String(error) })}\n\n`);
      }
      res.end();
    } catch (error) {
      if (controller.signal.aborted) return;
      req.log.error({ err: error }, "planning stream failed");
      if (!reply.sent) return reply.status(500).send({ ok: false, error: { code: "PLANNING_FAILED", message: (error as Error)?.message || String(error), requestId: req.id } });
    }
  });

  // ---- lean planning API for the React app (route-plannung #35). The key stays on the server:
  //      the browser only ever sees these routes. ----
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const noKey = (req: FastifyRequest, reply: FastifyReply) => fail(req, reply, 503, "PLANNING_KEY_MISSING", "Der Planungsdienst ist auf diesem Server nicht eingerichtet (PLANNING_API_KEY fehlt).");
  const lean = async (req: FastifyRequest, reply: FastifyReply, path: string) => {
    if (!planning.hasKey) return noKey(req, reply);
    try {
      const up = await planning.lean(path);
      if (up.status === 401 || up.status === 403) return fail(req, reply, 502, "PLANNING_KEY_REJECTED", "Der Planungsdienst hat den Zugangsschlüssel dieses Servers abgelehnt.");
      if (up.status >= 400) return fail(req, reply, up.status, "PLANNING_FAILED", (up.body as { error?: string })?.error || "Der Planungsdienst hat einen Fehler gemeldet.");
      return reply.send(up.body);
    } catch (error) {
      req.log.error({ err: error }, "planning lean failed");
      return fail(req, reply, 502, "PLANNING_FAILED", "Der Planungsdienst ist nicht erreichbar.");
    }
  };
  app.get("/api/planning/v2/today", async (req, reply) => {
    const date = (req.query as Record<string, string | undefined>).date;
    if (date !== undefined && !DAY.test(date)) return fail(req, reply, 400, "BAD_REQUEST", "date must be YYYY-MM-DD");
    return lean(req, reply, `/api/planning/today${date ? `?date=${date}` : ""}`);
  });
  app.get("/api/planning/v2/week", async (req, reply) => {
    const from = (req.query as Record<string, string | undefined>).from;
    if (!from || !DAY.test(from)) return fail(req, reply, 400, "BAD_REQUEST", "from must be YYYY-MM-DD");
    return lean(req, reply, `/api/planning/week?from=${from}`);
  });
  app.get("/api/planning/v2/today/stream", async (req, reply) => {
    if (!planning.hasKey) return noKey(req, reply);
    const controller = new AbortController();
    req.raw.on("close", () => controller.abort());
    try {
      const upstream = await planning.leanStream(controller.signal);
      if (!upstream.ok || !upstream.body) return fail(req, reply, 502, "PLANNING_STREAM", "Der Planungsdienst liefert keinen Stream.");
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      try { for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk); }
      catch (error) { if (!controller.signal.aborted) res.write(`event: error\ndata: ${JSON.stringify({ error: "Verbindung zum Planungsdienst unterbrochen" })}\n\n`); }
      res.end();
    } catch (error) {
      if (controller.signal.aborted) return;
      req.log.error({ err: error }, "planning lean stream failed");
      if (!reply.sent) return fail(req, reply, 502, "PLANNING_FAILED", "Der Planungsdienst ist nicht erreichbar.");
    }
  });
}

// ---- today's customers (legacy src/routes/todayscustomers.js, mounted under /api) ----
import type { todaysCustomers } from "../../integrations/todays-customers.js";
export async function registerTodaysCustomers(app: FastifyInstance, tc: ReturnType<typeof todaysCustomers>) {
  app.get("/api/bitrix/kundendaten", async (req, reply) => {
    try {
      const stageId = String((req.query as Record<string, string | undefined>).stageId || tc.DEFAULT_STAGE_ID).trim();
      return await tc.getKundendatenForStage(stageId);
    } catch (err) {
      req.log.error({ err }, "kundendaten failed");
      return reply.status(500).send({ ok: false, error: { code: "BITRIX_ERROR", message: (err as Error)?.message || String(err), requestId: req.id } });
    }
  });
  app.post("/api/calendar/today", async (req, reply) => {
    try { return await tc.calendarToday(); }
    catch (err) {
      req.log.error({ err }, "calendar today failed");
      return reply.status(500).send({ ok: false, error: { code: "BITRIX_ERROR", message: (err as Error)?.message || String(err), requestId: req.id } });
    }
  });
}
