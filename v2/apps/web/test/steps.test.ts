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
  it.each(NEW_OFFER_TYPES.map((t) => [t] as const))("%s: same steps in the same order as today's UI", (type) => {
    expect([...STEPS[type]]).toEqual(snapshot(type));
  });
  it("helpers", () => {
    expect(firstStep("bu")).toBe("Kundendaten");
    expect([isStepOf("bl", "bl"), isStepOf("bl", "Rabatt"), isStepOf("bl", undefined)]).toEqual([true, false, false]);
    expect([stepLabel("Zusammenfassung"), stepLabel("Kundendaten"), stepLabel("hlk")]).toEqual(["Angebotsversand", "Kundendaten", "Handläufe"]);
  });
});
