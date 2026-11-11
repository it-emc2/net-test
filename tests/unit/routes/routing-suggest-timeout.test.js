/**
 * /api/routing/suggest-distance must give up after ~5 s with a clean 504
 * when the geocoding/routing providers hang (Audit S13/S-07). No network:
 * the global fetch is replaced by one that never answers.
 */
import express from "express";
import request from "supertest";

process.env.COMPANY_LAT = "50.3";
process.env.COMPANY_LNG = "11.9";
const { default: routingRouter, SUGGEST_TIMEOUT_MS } = await import("../../../src/routes/routing.js");

const app = express();
app.use(express.json());
app.use("/api/routing", routingRouter);

test("hanging providers end in a 504 after the deadline", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, opts = {}) => {
    calls.push(String(url));
    return new Promise((_resolve, reject) => {
      const sig = opts.signal;
      if (!sig) return; // would hang forever — the test then times out
      if (sig.aborted) return reject(sig.reason);
      sig.addEventListener("abort", () => reject(sig.reason), { once: true });
    });
  };
  try {
    const t0 = Date.now();
    const res = await request(app)
      .post("/api/routing/suggest-distance")
      .send({ Kundendaten: { street: "Teststraße 1", postalCode: "95028", city: "Hof" } });
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ ok: false, timeout: true });
    expect(elapsed).toBeGreaterThanOrEqual(SUGGEST_TIMEOUT_MS - 100);
    expect(elapsed).toBeLessThan(SUGGEST_TIMEOUT_MS + 3000);
    expect(calls.length).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = original;
  }
}, 15000);
