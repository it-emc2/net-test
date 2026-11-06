// Drift guard: every legacy endpoint (incl. ones main adds later) is either in v2 or listed
// here with the phase that ports it. A new legacy route fails this test until it is ported
// or assigned.
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script
import { missingInV2 } from "../../../scripts/route-parity.mjs";

const ASSIGNED: Record<string, string> = {};

describe("route parity with legacy", () => {
  it("every legacy route is ported or assigned to a phase", () => {
    const missing: string[] = missingInV2();
    expect(missing.filter((r) => !(r in ASSIGNED)), "new legacy routes — port or assign them").toEqual([]);
  });
  it("no stale assignments (ported routes leave the list)", () => {
    const missing = new Set<string>(missingInV2());
    expect(Object.keys(ASSIGNED).filter((r) => !missing.has(r))).toEqual([]);
  });
});
