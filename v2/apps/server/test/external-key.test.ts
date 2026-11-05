// v2-only (intentional difference): without EXTERNAL_API_KEY the external lookup is closed (legacy: open).
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerMisc } from "../src/routes/misc.js";

const app = async (externalApiKey?: string) => {
  const a = Fastify();
  await registerMisc(a, { vigorUri: "mongodb://127.0.0.1:9/none", computePrices: async () => ({}), externalApiKey });
  return a;
};

describe("external API key", () => {
  it("unset key → 503, nothing is read", async () => {
    const r = await (await app()).inject({ url: "/api/offers/external/search?q=x", headers: { "x-api-key": "" } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.message).toBe("EXTERNAL_API_KEY not configured");
  });
  it("wrong length / wrong key → 401", async () => {
    const a = await app("secret-key");
    expect((await a.inject({ url: "/api/offers/external/offers/X", headers: { "x-api-key": "s" } })).statusCode).toBe(401);
    expect((await a.inject({ url: "/api/offers/external/offers/X", headers: { "x-api-key": "secret-kez" } })).statusCode).toBe(401);
  });
});
