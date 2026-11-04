// Stored AH payload → TS adapter → TS pricing must equal what the LEGACY UI computes after
// restoring the same payload (recorded by scripts/golden/ah/ah-restore.build.cjs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ahInputFromPayload, ahInputFromPayloadLegacy, computeAhPricing } from "../src/index.js";

const dir = fileURLToPath(new URL("../../../../tests/golden/fixtures/ah/", import.meta.url));
const payloads = Object.fromEntries(
  (JSON.parse(readFileSync(dir + "payloads.json", "utf8")) as Array<{ id: string; payload: any }>).map((c) => [c.id, c.payload]),
);
const restored: Array<{ id: string; dom: any; expected: any }> = JSON.parse(readFileSync(dir + "restore.json", "utf8"));

describe("AH: real stored offers, TS adapter + pricing vs legacy restore", () => {
  it("has the real cases", () => expect(restored.length).toBeGreaterThanOrEqual(140));

  it.each(restored.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    const input = ahInputFromPayloadLegacy(payloads[r.id], r.dom.config);
    // inputs as the legacy page saw them
    expect(input.payer).toBe(r.dom.payer);
    expect(input.entlastungsbetragNutzen).toBe(r.dom.entlastungsbetragNutzen);
    expect(input.zweiPersonen).toBe(r.dom.zweiPersonen);
    expect(input.verhinderungspflegeMonat).toBe(Number(r.dom.verhinderungspflegeMonat) || 0);
    // the price
    expect(JSON.parse(JSON.stringify(computeAhPricing(input)))).toEqual(r.expected);
  });
});

// ADR 014: v2 fixes both legacy restore bugs. Everything else must stay identical.
const price = (input: any) => JSON.parse(JSON.stringify(computeAhPricing(input)));
const hasSavedZoneButNoTravel = (p: any) => !p?.Arbeitszeit?.travelTimeHHMM && Number(p?.Arbeitszeit?.ahTravelZone) > 0;
const hasNestedFormat = (p: any) => {
  try {
    return (JSON.parse(p?.ah?.ahServicesJson || "[]") as any[]).some((s) => !s.schedules && !s.schedule &&
      Array.isArray(s.tasks) && s.tasks.some((t: any) => t && typeof t === "object" && Array.isArray(t.schedules)));
  } catch { return false; }
};

describe("AH: v2 fixes (ADR 014)", () => {
  const affected = restored.filter((r) => hasSavedZoneButNoTravel(payloads[r.id]) || hasNestedFormat(payloads[r.id]));
  const unaffected = restored.filter((r) => !affected.includes(r));

  it("the bug cases exist in the real sample (3 zone, 1 format)", () => {
    expect(restored.filter((r) => hasSavedZoneButNoTravel(payloads[r.id]))).toHaveLength(3);
    expect(restored.filter((r) => hasNestedFormat(payloads[r.id]))).toHaveLength(1);
  });

  it.each(unaffected.map((r) => [r.id, r] as const))("unchanged: %s", (_id, r) => {
    expect(price(ahInputFromPayload(payloads[r.id], r.dom.config))).toEqual(r.expected);
  });

  it("fix #1: saved zone is used when no travel time is stored → travel is billed", () => {
    for (const r of restored.filter((x) => hasSavedZoneButNoTravel(payloads[x.id]))) {
      const fixed = price(ahInputFromPayload(payloads[r.id], r.dom.config));
      const z = Number(payloads[r.id].Arbeitszeit.ahTravelZone);
      expect(fixed.zoneData, r.id).toEqual({ zone: z, billMin: (z - 1) * 10 + 10 });
      if (r.expected.totalMonatlichH > 0) expect(fixed.gesamt, r.id).toBeGreaterThan(r.expected.gesamt);
    }
  });

  it("fix #2: older nested format is read → service is priced instead of 0 €", () => {
    for (const r of restored.filter((x) => hasNestedFormat(payloads[x.id]))) {
      expect(r.expected.gesamt, `${r.id} legacy`).toBe(0);
      const fixed = price(ahInputFromPayload(payloads[r.id], r.dom.config));
      expect(fixed.gesamt, r.id).toBeGreaterThan(0);
      expect(fixed.tasks, r.id).toEqual(["wohnungsreinigung"]);
    }
  });
});
