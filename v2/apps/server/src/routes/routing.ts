// /api/routing (distance suggestion) + /api/planning proxy — ports of legacy
// src/routes/routing.js and src/routes/planning.js. Contract test: same responses, same
// outgoing requests (geocoders/routers/planning service replaced by a recording stub).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildCustomerAddress } from "../routing/address.js";
import type { RoutingService } from "../routing/providers.js";
import type { PlanningClient } from "../integrations/planning.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export async function registerRouting(app: FastifyInstance, d: { routing: RoutingService; planning: PlanningClient }) {
  const { routing, planning } = d;

  app.post("/api/routing/suggest-distance", async (req, reply) => {
    try {
      const body = (req.body ?? {}) as any;
      const k = body.Kundendaten || body.bereich || body || {};
      const street = k.street || "", postalCode = k.postalCode || k.PLZ || "", city = k.city || k.Stadt || "";
      const state = k.state || k.Bundesland || "", country = k.country || k.Land || "Deutschland";
      if (!street && !city && !postalCode) return fail(req, reply, 400, "BAD_REQUEST", "Missing address fields in Kundendaten.");
      const customerAddress = buildCustomerAddress({ street, postalCode, city, state, country });
      if (!customerAddress.trim()) return fail(req, reply, 400, "BAD_REQUEST", "Customer address could not be built.");
      if (!routing.c.companyAddress) return fail(req, reply, 500, "CONFIG", "COMPANY_ADDRESS missing on server.");
      const start = await routing.companyCoords();
      const dest = await routing.geocodeWithVariants({ street, postalCode, city, state, country });
      const { km, seconds, provider: routeProvider } = await routing.roadDistance(start, dest);
      const oneWayKm = Math.round(km * 2) / 2;
      const roundTripKm = Math.round(oneWayKm * 2 * 10) / 10;
      const oneWaySeconds = Math.round(seconds);
      req.log.info({ geocodeProvider: dest.provider, routeProvider, oneWayKm }, "distance suggested");
      return {
        ok: true, oneWayKm, roundTripKm, oneWaySeconds, roundTripSeconds: oneWaySeconds * 2,
        from: { address: routing.c.companyAddress, geocoded: start.displayName, lat: start.lat, lng: start.lng },
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
}

// ---- today's customers (legacy src/routes/todayscustomers.js, mounted under /api) ----
import type { todaysCustomers } from "../integrations/todays-customers.js";
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
