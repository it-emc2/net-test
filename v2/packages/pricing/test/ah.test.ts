// AH pricing — TS port vs the REAL legacy browser function (golden master recorded by
// scripts/golden/ah/ah-controlled.build.cjs through the running legacy app).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ahZoneFromNumber,
  computeAhPricing,
  computeAhZoneFromMinutes,
  parseDurationMinutes,
  type AhPricingInput,
} from "../src/index.js";

const file = fileURLToPath(new URL("../../../../tests/golden/fixtures/ah/controlled.json", import.meta.url));
const cases: Array<{ id: string; input: AhPricingInput; expected: Record<string, unknown> }> = JSON.parse(
  readFileSync(file, "utf8"),
);

describe("AH pricing — golden master from the legacy UI", () => {
  it("fixture set is varied enough to mean something", () => {
    const priced = cases.filter((c) => Number(c.expected.gesamt) > 0).length;
    const withAb = cases.filter((c) => c.expected.hasAb).length;
    const sz = cases.filter((c) => c.expected.isSelbstzahler).length;
    const reduced = cases.filter((c) => Number(c.expected.eigenanteil) < Number(c.expected.gesamt)).length;
    expect(cases.length).toBeGreaterThanOrEqual(400);
    expect(priced).toBeGreaterThan(150);
    expect(withAb).toBeGreaterThan(50);
    expect(sz).toBeGreaterThan(50);
    expect(reduced).toBeGreaterThan(50);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(JSON.parse(JSON.stringify(computeAhPricing(structuredClone(c.input))))).toEqual(c.expected);
  });
});

describe("AH helpers (legacy semantics)", () => {
  it.each([["01:30", 90], ["0:45", 45], ["4:30", 270], ["1:5", 0], ["", 0], ["90", 0], [null, 0]] as const)(
    "parseDurationMinutes(%j) = %d", (v, m) => expect(parseDurationMinutes(v)).toBe(m));

  it("zones: 10-minute steps, minimum zone 1", () => {
    expect(computeAhZoneFromMinutes(0)).toEqual({ zone: 1, billMin: 10 });
    expect(computeAhZoneFromMinutes(11)).toEqual({ zone: 2, billMin: 20 });
    expect(computeAhZoneFromMinutes(30)).toEqual({ zone: 3, billMin: 30 });
    expect(computeAhZoneFromMinutes(31)).toEqual({ zone: 4, billMin: 40 });
  });

  it("Hof PLZ is zone 1 up to 15 min, not beyond", () => {
    expect(computeAhZoneFromMinutes(14, "95028")).toEqual({ zone: 1, billMin: 10 });
    expect(computeAhZoneFromMinutes(15, "95030")).toEqual({ zone: 1, billMin: 10 });
    expect(computeAhZoneFromMinutes(16, "95028")).toEqual({ zone: 2, billMin: 20 });
    expect(computeAhZoneFromMinutes(14, "95100")).toEqual({ zone: 2, billMin: 20 });
  });

  it("zone from stored number", () => {
    expect(ahZoneFromNumber(3)).toEqual({ zone: 3, billMin: 30 });
    expect(ahZoneFromNumber(0)).toBeNull();
  });
});
