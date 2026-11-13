import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema, DealDraftResponseSchema, LoginRequestSchema, LoginResponseSchema, PriceInputsResponseSchema,
  PriceResponseSchema, SaveDealDraftRequestSchema, endpoints, isApiError, pathOf,
} from "../src/index.js";

describe("api contract", () => {
  it("error answers: the v2 envelope, extra keys allowed (e.g. revision on a missing draft)", () => {
    const e = { error: { code: "NO_DRAFT", message: "Für diesen Auftrag gibt es noch keinen Entwurf", requestId: "r1" }, revision: 0 };
    expect(ApiErrorSchema.parse(e)).toEqual(e);
    expect([isApiError(e), isApiError({ error: "text" }), isApiError({ ok: true }), isApiError(null)]).toEqual([true, false, false, false]);
  });

  it("login: request needs both fields; the answer carries token and user", () => {
    expect(LoginRequestSchema.safeParse({ email: "a@b.test", password: "x" }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ email: "a@b.test", password: "" }).success).toBe(false);
    expect(LoginResponseSchema.safeParse({ token: "t", user: { email: "a@b.test", role: "admin" } }).success).toBe(true);
    expect(LoginResponseSchema.safeParse({ user: { email: "a@b.test" } }).success).toBe(false);
  });

  it("price answers keep every legacy field; price inputs carry settings and the price list", () => {
    const price = { total: 1234.5, selfPayAmount: 0, materials: { lines: [] }, anythingElse: true };
    expect(PriceResponseSchema.parse(price)).toEqual(price);
    const inputs = { buildId: "dev", config: { LABOR_RATE: 69.5 }, products: [{ productId: "P1", price: 10, name: "x", widthCm: 90 }] };
    expect(PriceInputsResponseSchema.parse(inputs)).toEqual(inputs);
    expect(PriceInputsResponseSchema.safeParse({ buildId: "dev", config: {}, products: [{ price: 1 }] }).success).toBe(false);
  });

  it("deal draft: answer and save request; baseRevision must be a whole number ≥ 0", () => {
    expect(DealDraftResponseSchema.safeParse({ dealId: "4711", offerType: "bu", payload: {}, revision: 3, updatedAt: "2026-11-12T10:00:00.000Z", updatedBy: "a@b.test" }).success).toBe(true);
    expect(SaveDealDraftRequestSchema.safeParse({ offerType: "bu", payload: { activeOffer: "bu" }, baseRevision: 0 }).success).toBe(true);
    expect(SaveDealDraftRequestSchema.safeParse({ offerType: "bu", payload: {}, baseRevision: -1 }).success).toBe(false);
    expect(SaveDealDraftRequestSchema.safeParse({ offerType: "bu", payload: {}, baseRevision: 1.5 }).success).toBe(false);
  });

  it("pathOf fills path parameters, encodes them and refuses a missing one", () => {
    expect(pathOf("version")).toBe("/api/version");
    expect(pathOf("dealDraft", { dealId: 4711 })).toBe("/api/deals/4711/draft");
    expect(pathOf("saveDealDraft", { dealId: "t-ab/cd" })).toBe("/api/deals/t-ab%2Fcd/draft");
    expect(() => pathOf("dealDraft")).toThrow(/missing parameter "dealId"/);
    // today's routes: /api/…, and the public business settings under /admin/api/…
    expect(Object.values(endpoints).every((e) => /^\/(admin\/)?api\//.test(e.path))).toBe(true);
  });
});
