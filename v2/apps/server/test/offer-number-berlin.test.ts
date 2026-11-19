// A sent offer that is edited again gets a fresh number in Berlin wall-clock time, not the
// server's UTC (main 495b210b, test/offer-number-tz.test.mjs — same cases).
import { describe, expect, it } from "vitest";
import { berlinOfferNumber } from "../src/modules/offers/write.js";

describe("berlinOfferNumber", () => {
  it("winter time (UTC+1)", () => {
    expect(berlinOfferNumber(new Date("2026-11-16T12:33:15Z"))).toBe("ANG2026-1116-133315");
  });
  it("summer time (UTC+2), across midnight into the next day", () => {
    expect(berlinOfferNumber(new Date("2026-07-31T22:05:09Z"))).toBe("ANG2026-0801-000509");
  });
  it("midnight reads 00, not 24", () => {
    expect(berlinOfferNumber(new Date("2026-01-14T23:00:00Z"))).toBe("ANG2026-0115-000000");
  });
});
