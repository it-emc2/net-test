import { describe, expect, it } from "vitest";
import { WINWALL_FORMATS } from "@oc/pricing";
import { scalePlates } from "../src/shared/ui/plate-scale.js";

describe("scalePlates: panels to scale", () => {
  it("winwall: the largest dimension (250 cm) maps to maxPx, all on one scale", () => {
    const r = scalePlates(WINWALL_FORMATS.map((f) => ({ width: f.widthCm, height: f.heightCm })), 130);
    expect(r.boxes).toEqual([{ w: 52, h: 107 }, { w: 52, h: 130 }, { w: 65, h: 130 }, { w: 78, h: 130 }]);
    expect(r.height).toBe(130);
    expect(r.perUnit).toBeCloseTo(0.52);
  });
  it("100 × 205 is shorter than 100 × 250, 150 × 250 wider than 100 × 250", () => {
    const [a, b, , d] = scalePlates([{ width: 100, height: 205 }, { width: 100, height: 250 }, { width: 125, height: 250 }, { width: 150, height: 250 }]).boxes;
    expect(a!.h).toBeLessThan(b!.h);
    expect(a!.w).toBe(b!.w);
    expect(d!.w).toBeGreaterThan(b!.w);
    expect(d!.h).toBe(b!.h);
  });
  it("a landscape format: its width is the largest dimension", () => {
    expect(scalePlates([{ width: 300, height: 100 }, { width: 100, height: 100 }], 120).boxes).toEqual([{ w: 120, h: 40 }, { w: 40, h: 40 }]);
  });
  it("VIGOUR panels in mm: 997 / 1497 × 2550", () => {
    expect(scalePlates([{ width: 997, height: 2550 }, { width: 1497, height: 2550 }], 132).boxes).toEqual([{ w: 52, h: 132 }, { w: 77, h: 132 }]);
  });
  it("no or broken sizes draw nothing", () => {
    expect(scalePlates([])).toEqual({ boxes: [], height: 0, perUnit: 0 });
    expect(scalePlates([{ width: Number.NaN, height: -1 }])).toEqual({ boxes: [{ w: 0, h: 0 }], height: 0, perUnit: 0 });
  });
});
