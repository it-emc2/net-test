// The step lists must stay those of today's UI: compared with the Playwright snapshots of the
// current app (tests/e2e/parity/__snapshots__/<type>-steps.txt).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NEW_OFFER_TYPES } from "@oc/domain";
import { describe, expect, it } from "vitest";
import { STEPS, firstStep, isStepOf, stepLabel } from "../src/features/offer/index.js";

const NOT_STEPS = new Set(["home", "admin", "services", "crm-emc2"]); // menu entries that are no offer steps
const snapshot = (type: string) =>
  readFileSync(resolve(import.meta.dirname, `../../../../tests/e2e/parity/__snapshots__/${type}-steps.txt`), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !NOT_STEPS.has(l));

describe("steps per offer type", () => {
  it.each(NEW_OFFER_TYPES.map((t) => [t] as const))("%s: the steps of today's UI, in its order (Badumbau: Arbeitszeit after the material)", (type) => {
    const today = snapshot(type);
    // Badumbau: Arbeitszeit after the work and the material (U-011 B4) — everything else as today
    const want = type === "bu" ? [...today.filter((s) => s !== "Arbeitszeit").slice(0, today.indexOf("Rabatt") - 1), "Arbeitszeit", ...today.slice(today.indexOf("Rabatt"))] : today;
    expect([...STEPS[type]]).toEqual(want);
  });
  it("helpers", () => {
    expect(firstStep("bu")).toBe("Kundendaten");
    expect([isStepOf("bl", "bl"), isStepOf("bl", "Rabatt"), isStepOf("bl", undefined)]).toEqual([true, false, false]);
    expect([stepLabel("Zusammenfassung"), stepLabel("Kundendaten"), stepLabel("hlk")]).toEqual(["Angebotsversand", "Kundendaten", "Handläufe"]);
  });
});
