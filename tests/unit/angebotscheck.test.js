import { runAngebotscheck } from "../../src/public/angebotscheck.js";

const ok = {
  servicesDisplayUI: { sum: 1200, lines: [{ label: "Montage", lineTotal: 1200 }] },
  materialsDisplayUI: {
    sum: 900,
    lines: [
      { productId: "DW01", category: "Duschwanne", qty: 1, lineTotal: 500 },
      { productId: "DA01", category: "Duschabtrennung", qty: 1, lineTotal: 400 },
    ],
  },
  optionalDisplayUI: { sum: 0, lines: [] },
};

const status = (pricing, key) =>
  runAngebotscheck(pricing).groups.find((g) => g.key === key).status;

test("a complete offer is green", () => {
  expect(runAngebotscheck(ok).status).toBe("gruen");
});

test("empty offer is red in Arbeiten and Material", () => {
  const r = runAngebotscheck({});
  expect(r.status).toBe("rot");
  expect(status({}, "arbeiten")).toBe("rot");
  expect(status({}, "material")).toBe("rot");
});

test("Duschwanne without Duschabtrennung is yellow", () => {
  const p = {
    ...ok,
    materialsDisplayUI: {
      sum: 500,
      lines: [{ productId: "DW01", category: "Duschwanne", qty: 1, lineTotal: 500 }],
    },
  };
  expect(status(p, "material")).toBe("gelb");
  expect(runAngebotscheck(p).status).toBe("gelb");
});

test("material line without Artikel-ID or price is reported", () => {
  const p = {
    ...ok,
    materialsDisplayUI: { sum: 0, lines: [{ name: "Fliesen", qty: 1, lineTotal: 0 }] },
  };
  const ids = runAngebotscheck(p)
    .groups.find((g) => g.key === "material")
    .findings.map((f) => f.id);
  expect(ids).toEqual(
    expect.arrayContaining(["material-ohne-artikelid", "material-ohne-preis"]),
  );
});

test("a throwing rule does not break the check", () => {
  const p = { materialsDisplayUI: { get lines() { throw new Error("boom"); } } };
  expect(() => runAngebotscheck(p)).not.toThrow();
});

// DOM comes from tests/setup.js (JSDOM globals), not from a jest environment.
test("renderAngebotscheck paints one row per group plus its findings", async () => {
  const { renderAngebotscheck } = await import("../../src/public/angebotscheck.js");
  const root = document.createElement("div");
  renderAngebotscheck(root, runAngebotscheck({}));
  expect(root.querySelectorAll(".zf-check-group")).toHaveLength(3);
  expect(root.querySelector(".zf-check-head").textContent).toContain("🔴");
  expect(root.textContent).toContain("Keine Arbeitsposition erfasst.");
});
