import {
  aufschlagMin, isBelowAufschlagMin, aufschlagZone, aufschlagReasonMissing, AUFSCHLAG_ZONE_COLOR,
} from "../../src/logic/aufschlag-rules.js";

test("Mindestwert je Kundenart", () => {
  expect(aufschlagMin("Kassenkunde")).toBe(50);
  expect(aufschlagMin("Selbstzahler")).toBe(35);
  expect(aufschlagMin(undefined)).toBe(35);
});
test("darunter / genau / darüber", () => {
  expect([44.5, 50, 50.5].map((p) => isBelowAufschlagMin(p, "Kassenkunde"))).toEqual([true, false, false]);
  expect([34.9, 35, 40].map((p) => isBelowAufschlagMin(p, "Selbstzahler"))).toEqual([true, false, false]);
  expect(isBelowAufschlagMin(NaN, "Kassenkunde")).toBe(false);
});
test("Farbzonen: rot < Min, orange bis 60, gelb 60–70, grün darüber (bis 200)", () => {
  const z = (p, payer = "Kassenkunde") => aufschlagZone(p, payer);
  expect([z(45), z(50), z(55), z(60), z(65), z(70), z(80), z(200)]).toEqual(["low", "mid", "mid", "warm", "warm", "warm", "high", "high"]);
  expect([z(30, "Selbstzahler"), z(35, "Selbstzahler"), z(45, "Selbstzahler")]).toEqual(["low", "mid", "mid"]);
  expect(AUFSCHLAG_ZONE_COLOR.low).toBe("#ef4444");
});
test("Begründung nur unter Mindestwert Pflicht, Leerzeichen zählen nicht", () => {
  expect(aufschlagReasonMissing(45, "Kassenkunde", "  ")).toBe(true);
  expect(aufschlagReasonMissing(45, "Kassenkunde", "abgestimmt")).toBe(false);
  expect(aufschlagReasonMissing(55, "Kassenkunde", "")).toBe(false);
  expect(aufschlagReasonMissing(30, "Selbstzahler", undefined)).toBe(true);
});
