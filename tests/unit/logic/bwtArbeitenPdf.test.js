import { mapOfferToDocxData } from "../../../src/logic/offerMapping.js";

// The BWT Arbeiten tab's free-text "Weitere Arbeiten" (payload.bwt.extraTasks)
// must show up as ExtraTasks bullets on the Pos-001 row, after the
// Extra-Arbeitszeit tasks from the Arbeitszeit page.
const body = {
  activeOffer: "bwt",
  Kundendaten: {},
  Arbeitszeit: { extraTasks: [{ task: "AZ-Zusatzaufgabe", durationHHMM: "01:00" }] },
  bwt: {
    workTasks: ["deliver_install_bwt_door"],
    extraTasks: ["Demontage der alten Duschabtrennung", "  ", "Silikonfugen erneuern"],
  },
};

const computed = {
  materialsDisplayDocx: {
    lines: [{ productId: "1226", qty: 1, lineTotal: 500, name: "Tür" }],
  },
  services: { sum: 100, distanceKm: 20 },
};

test("bwt Arbeiten extraTasks become PDF bullets after the Arbeitszeit tasks", () => {
  const row = mapOfferToDocxData(body, computed).BwtRows[0];
  expect(row.HasExtraTasks).toBe(true);
  expect(row.ExtraTasks).toEqual([
    { Text: "AZ-Zusatzaufgabe" },
    { Text: "Demontage der alten Duschabtrennung" },
    { Text: "Silikonfugen erneuern" },
  ]);
});

test("no Arbeiten extraTasks → row unchanged (only Arbeitszeit tasks)", () => {
  const row = mapOfferToDocxData(
    { ...body, bwt: { workTasks: [] } },
    computed,
  ).BwtRows[0];
  expect(row.ExtraTasks).toEqual([{ Text: "AZ-Zusatzaufgabe" }]);
});
