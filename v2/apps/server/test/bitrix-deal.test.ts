// Differential test: v2 AH deal-field numbers vs the LEGACY buildAhData().AhBitrix (imported
// from the root app) on all 143 anonymised real AH payloads + synthetic edge cases.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ahBitrixFromPayload, buildAhBitrixFields, resolveUmbautageEnumId } from "../src/integrations/bitrix-deal.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const payloads: Array<{ id: string; payload: any }> = JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8"));
let legacyBuildAhData: (b: unknown) => { AhBitrix: unknown };

beforeAll(async () => {
  ({ buildAhData: legacyBuildAhData } = await import(ROOT + "src/routes/docx-template.js"));
}, 60000);

const variants = (p: any): any[] => {
  const svc = p.ah?.services ?? [];
  return [
    p,
    { ...p, Arbeitszeit: { ...p.Arbeitszeit, ahTravelZone: "" } },                     // routing time fallback
    { ...p, Arbeitszeit: { ...p.Arbeitszeit, ahTravelZone: "7", travelTimeHHMM: "" } },  // zone > 5 (enum clamp)
    { ...p, ah: { ...p.ah, services: [...svc].reverse().map((s: any) => ({ ...s, combinedVisit: !s.combinedVisit })) } },
  ];
};

describe("AH deal fields = legacy buildAhData().AhBitrix", () => {
  it("all 143 real payloads × 4 variants", () => {
    let n = 0;
    for (const { id, payload } of payloads) {
      for (const v of variants(payload)) {
        expect(ahBitrixFromPayload(v), id).toEqual(legacyBuildAhData(v).AhBitrix);
        n++;
      }
    }
    expect(n).toBe(572);
  });

  it("degenerate inputs", () => {
    for (const v of [{}, { ah: {} }, { ah: { services: [{ type: "X", schedules: [{ dauer: "abc", regelmaessigkeit: "Wöchentlich" }] }] } },
      { ah: { services: [{ type: "Alltagsbegleitung", schedules: [{ dauer: "1.5", regelmaessigkeit: "Monatlich" }] }] }, Arbeitszeit: { travelTimeHHMM: "0:20" } }]) {
      expect(ahBitrixFromPayload(v)).toEqual(legacyBuildAhData(v).AhBitrix);
    }
  });

  it("Anfahrtszone is only filled when the deal has none; zone clamped to 1–5", () => {
    const p = payloads.find((x) => Number(x.payload.Arbeitszeit?.ahTravelZone) > 0)!.payload;
    expect(buildAhBitrixFields(p, "")).toHaveProperty("UF_CRM_1711019971");
    expect(buildAhBitrixFields(p, "1930")).not.toHaveProperty("UF_CRM_1711019971");
    expect(buildAhBitrixFields({ ...p, Arbeitszeit: { ahTravelZone: "9" } }, "").UF_CRM_1711019971).toBe("1936");
  });

  it("Umbautage enum: BWT/HL fixed 0,5; BU 1/2/3 days; else 'nicht zutreffend'", () => {
    expect([resolveUmbautageEnumId(3, "bwt"), resolveUmbautageEnumId(0, "HL"), resolveUmbautageEnumId(1.4, "bu"), resolveUmbautageEnumId(2, "bu"),
      resolveUmbautageEnumId(2.5, "bu"), resolveUmbautageEnumId(4, "bu"), resolveUmbautageEnumId(undefined, undefined)])
      .toEqual(["8444", "8444", "8438", "8440", "8442", "8436", "8436"]);
  });
});
