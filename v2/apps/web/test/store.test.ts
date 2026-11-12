import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";

const ctx = { date: "2026-11-12" };
const S = () => useOfferStore.getState();

describe("offer store — one typed object, no field-by-field reset", () => {
  it("start gives a complete new offer of that type; close empties the store in one step", () => {
    S().start("bu", ctx, "4711");
    expect(S().offer?.activeOffer).toBe("bu");
    expect([S().dealId, S().version]).toEqual(["4711", 0]);
    expect((S().offer as any).Kundendaten.date).toBe("2026-11-12");
    S().close();
    expect([S().offer, S().dealId, S().version]).toEqual([null, null, 0]);
  });

  it("a new offer never carries values of the one before", () => {
    S().start("bu", ctx);
    S().patch("Kundendaten", { firstName: "Erika", payer: "Selbstzahler" });
    S().patch("optional", { qty_X1: "3" });
    S().start("bwt", ctx);
    const o = S().offer as any;
    expect([o.activeOffer, o.Kundendaten.firstName, o.Kundendaten.payer, o.optional.qty_X1]).toEqual(["bwt", "", "Kassenkunde", undefined]);
  });

  it("patch changes only its section: other sections keep their identity (no needless re-render)", () => {
    S().start("bu", ctx);
    const before = S().offer as any;
    S().patch("Kundendaten", { city: "Hof" });
    const after = S().offer as any;
    expect(after.Kundendaten.city).toBe("Hof");
    expect(after.Kundendaten).not.toBe(before.Kundendaten);
    expect(after.duschwanne).toBe(before.duschwanne);
    expect(after.optional).toBe(before.optional);
    expect(before.Kundendaten.city).toBe(""); // the old object is untouched
    expect(S().version).toBe(1);
  });

  it("subscribers of one field are not called when another field changes", () => {
    S().start("bu", ctx);
    let calls = 0;
    const pick = (s: ReturnType<typeof S>) => (s.offer as any)?.Kundendaten.firstName;
    let last = pick(S());
    const off = useOfferStore.subscribe((s) => { const v = pick(s); if (v !== last) { last = v; calls++; } });
    S().patch("Kundendaten", { city: "Hof" });
    S().patch("rabatt", { rabattEnabled: true });
    expect(calls).toBe(0);
    S().patch("Kundendaten", { firstName: "Erika" });
    expect(calls).toBe(1);
    off();
  });

  it("patch without an offer does nothing", () => {
    S().patch("Kundendaten" as never, { city: "Hof" } as never);
    expect([S().offer, S().version]).toEqual([null, 0]);
  });
});
