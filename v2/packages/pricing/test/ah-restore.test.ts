// Stored AH payload → TS adapter → TS pricing must equal what the LEGACY UI computes after
// restoring the same payload (recorded by scripts/golden/ah/ah-restore.build.cjs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ahInputFromPayload, computeAhPricing } from "../src/index.js";

const dir = fileURLToPath(new URL("../../../../tests/golden/fixtures/ah/", import.meta.url));
const payloads = Object.fromEntries(
  (JSON.parse(readFileSync(dir + "payloads.json", "utf8")) as Array<{ id: string; payload: any }>).map((c) => [c.id, c.payload]),
);
const restored: Array<{ id: string; dom: any; expected: any }> = JSON.parse(readFileSync(dir + "restore.json", "utf8"));

describe("AH: real stored offers, TS adapter + pricing vs legacy restore", () => {
  it("has the real cases", () => expect(restored.length).toBeGreaterThanOrEqual(140));

  it.each(restored.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    const input = ahInputFromPayload(payloads[r.id], r.dom.config);
    // inputs as the legacy page saw them
    expect(input.payer).toBe(r.dom.payer);
    expect(input.entlastungsbetragNutzen).toBe(r.dom.entlastungsbetragNutzen);
    expect(input.zweiPersonen).toBe(r.dom.zweiPersonen);
    expect(input.verhinderungspflegeMonat).toBe(Number(r.dom.verhinderungspflegeMonat) || 0);
    // the price
    expect(JSON.parse(JSON.stringify(computeAhPricing(input)))).toEqual(r.expected);
  });
});
