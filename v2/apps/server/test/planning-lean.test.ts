// The lean planning routes: the key goes upstream, never to the browser; no key → 503.
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { PlanningClient } from "../src/integrations/planning.js";
import { registerRouting } from "../src/modules/planning/routes.js";

const KEY = "secret-key-123";
async function app(apiKey: string | undefined) {
  const seen: { url: string; key: string | null }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, key: new Headers(init.headers).get("x-api-key") });
    if (String(url).includes("/today/stream")) return new Response("event: today\ndata: {\"v\":1}\n\n", { headers: { "content-type": "text/event-stream" } });
    return new Response(JSON.stringify({ ok: true, plan: { termine: [] } }), { status: apiKey === "wrong" ? 401 : 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const a = Fastify();
  await registerRouting(a, { routing: {} as never, planning: new PlanningClient({ baseUrl: "http://planning.test", apiKey, fetchImpl }) });
  return { a, seen };
}

describe("planning v2 proxy", () => {
  it("asks upstream with the key and does not show it", async () => {
    const { a, seen } = await app(KEY);
    const r = await a.inject({ url: "/api/planning/v2/today?date=2026-11-17" });
    expect(r.statusCode).toBe(200);
    expect(seen[0]).toEqual({ url: "http://planning.test/api/planning/today?date=2026-11-17", key: KEY });
    expect(r.body).not.toContain(KEY);
    expect(JSON.stringify(r.headers)).not.toContain(KEY);
    const w = await a.inject({ url: "/api/planning/v2/week?from=2026-11-16" });
    expect(w.statusCode).toBe(200);
    expect(seen[1]!.url).toBe("http://planning.test/api/planning/week?from=2026-11-16");
    const s = await a.inject({ url: "/api/planning/v2/today/stream" });
    expect(s.headers["content-type"]).toContain("text/event-stream");
    expect(s.body).toBe("event: today\ndata: {\"v\":1}\n\n");
    expect(seen[2]!.key).toBe(KEY);
  });
  it("no key → 503 with a clear message, nothing is asked", async () => {
    const { a, seen } = await app(undefined);
    for (const url of ["/api/planning/v2/today", "/api/planning/v2/week?from=2026-11-16", "/api/planning/v2/today/stream"]) {
      const r = await a.inject({ url });
      expect(r.statusCode).toBe(503);
      expect(r.json().error.code).toBe("PLANNING_KEY_MISSING");
    }
    expect(seen).toEqual([]);
  });
  it("bad dates → 400; a rejected key → 502 (not 401: the user is not at fault)", async () => {
    const { a } = await app(KEY);
    expect((await a.inject({ url: "/api/planning/v2/today?date=17.11." })).statusCode).toBe(400);
    expect((await a.inject({ url: "/api/planning/v2/week" })).statusCode).toBe(400);
    const bad = await app("wrong");
    const r = await bad.a.inject({ url: "/api/planning/v2/today" });
    expect(r.statusCode).toBe(502);
    expect(r.json().error.code).toBe("PLANNING_KEY_REJECTED");
  });
});
