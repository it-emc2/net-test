import { describe, expect, it } from "vitest";
import { ApiFailure, call } from "../src/shared/api/index.js";
import { fakeServer } from "./helpers.js";

describe("api client", () => {
  it("builds the path from the contract, sends JSON with the session cookie, returns the parsed answer", async () => {
    const s = fakeServer({ "GET /api/deals/4711/draft": { body: { dealId: "4711", offerType: "bu", payload: { a: 1 }, revision: 2, updatedAt: "2026-11-12T10:00:00Z", updatedBy: "x" } } });
    const d = await call("dealDraft", { params: { dealId: 4711 } });
    expect([d.dealId, d.revision]).toEqual(["4711", 2]);
    expect(s.calls).toHaveLength(1);
  });

  it("a server error carries the server's German message, status and code", async () => {
    fakeServer({ "POST /api/auth/login": { status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "E-Mail oder Passwort falsch", requestId: "r" } } } });
    const err = await call("login", { body: { email: "a@b.test", password: "x" } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect([err.message, err.status, err.code]).toEqual(["E-Mail oder Passwort falsch", 401, "INVALID_CREDENTIALS"]);
  });

  it("an answer in the wrong shape is refused instead of passed on", async () => {
    fakeServer({ "GET /api/version": { body: { build: 1 } } });
    await expect(call("version")).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
