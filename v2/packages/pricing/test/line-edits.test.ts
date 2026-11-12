// Prices set for single positions on the Kosten page (payload.offerOverrides.lineEdits, U-014):
// on the real anonymised offers, for the TS engine AND the legacy engine the browser uses offline.
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import legacyCore from "../../../../src/logic/pricing-core.js";
import { createPricingEngine } from "../src/index.js";
import { cases, deps, ProductModel, roundTrip } from "./fixtures.js";

const ts = createPricingEngine(ProductModel, deps);
const legacy = legacyCore(ProductModel, deps);
const clone = <T>(v: T): T => structuredClone(v);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe("line edits", () => {
  const usable = cases.filter((c: any) => ["bu", "bwt", "hl", "bl", ""].includes(String(c.payload?.activeOffer ?? "").toLowerCase()));

  it("moves the net by (new − catalogue) × quantity; lines, Aufschlag and Rabatt base stay", async () => {
    let checked = 0;
    for (const c of usable) {
      const a: any = await ts.computePrices(clone(c.payload));
      const mat = (a.materials?.lines ?? []).find((l: any) => Number(l.unitPrice) > 0 && Number(l.qty) > 0 && (l.productId || l.id));
      const svc = (a.services?.lines ?? []).find((l: any) => l.key && Number(l.unitPrice) > 0 && Number(l.qty) > 0);
      if (!mat || !svc || a._locked) continue;
      const matId = String(mat.productId ?? mat.id).trim();
      // skip offers that list the same product twice (the first line carries the change)
      const edits = [
        { block: "material", id: matId, source: mat.source ?? "", unitPriceNet: r2(mat.unitPrice + 7), label: "Neuer Text", origLabel: mat.label, reason: "Test" },
        { block: "services", id: svc.key, unitPriceNet: r2(svc.unitPrice * 0.5), reason: "Test" },
      ];
      const payload = clone(c.payload);
      payload.offerOverrides = { ...(payload.offerOverrides ?? {}), lineEdits: edits };
      const b: any = await ts.computePrices(clone(payload));
      const dMat = r2(7 * mat.qty), dSvc = r2((r2(svc.unitPrice * 0.5) - svc.unitPrice) * svc.qty);
      expect(b.lineEdits.material, c.id).toBe(dMat);
      expect(b.lineEdits.services, c.id).toBe(dSvc);
      expect(r2(b.services.sum - a.services.sum), c.id).toBe(dSvc);
      expect(b.markup, c.id).toBe(a.markup);
      expect(b.rabattAmount, c.id).toBe(a.rabattAmount);
      expect(b.materials.sum, c.id).toBe(a.materials.sum);
      expect(roundTrip(b.materials.lines), c.id).toEqual(roundTrip(a.materials.lines));
      expect(roundTrip(b.services.lines), c.id).toEqual(roundTrip(a.services.lines));
      expect(Math.abs(r2(b.Nettobetrag - a.Nettobetrag) - r2(dMat + dSvc)), c.id).toBeLessThanOrEqual(0.011);
      expect(b.priceAdjustments, c.id).toEqual(a.priceAdjustments);
      // the engine the browser runs offline gives the same answer
      const l: any = await legacy.computePrices(clone(payload));
      expect(roundTrip(l), c.id).toEqual(roundTrip(b));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("changes nothing without edits, with wording-only edits or with unknown positions", async () => {
    for (const c of usable.slice(0, 25)) {
      const a: any = await ts.computePrices(clone(c.payload));
      const payload = clone(c.payload);
      payload.offerOverrides = { ...(payload.offerOverrides ?? {}), lineEdits: [
        { block: "material", id: "GIBT-ES-NICHT", unitPriceNet: 5 },
        { block: "material", id: String(a.materials?.lines?.[0]?.productId ?? "X"), source: a.materials?.lines?.[0]?.source ?? "", unitPriceNet: null, label: "Nur Text" },
      ] };
      const b: any = await ts.computePrices(clone(payload));
      expect(b.lineEdits, c.id).toBeUndefined();
      expect(b.total, c.id).toBe(a.total);
    }
  });
});
