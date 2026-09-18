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

/* ---------------------------------------------- Arbeit ⇄ Produkt couplings */

const { readSelection, WORK_RULES } = await import(
  "../../src/public/angebotscheck.js"
);

function withTasks(values, extraHtml = "") {
  document.body.innerHTML =
    values
      .map(
        (v) =>
          `<input type="checkbox" name="duschwanne[workTasks][]" value="${v}" checked />`,
      )
      .join("") + extraHtml;
}

const findings = (pricing, sel) =>
  runAngebotscheck(pricing, sel)
    .groups.flatMap((g) => g.findings)
    .map((f) => f.id);

test("a work task that is not ticked produces no rule at all", () => {
  withTasks([]);
  expect(findings(ok, readSelection(ok))).not.toContain(
    "arbeit-replace_thermostat",
  );
});

test("Thermostat-Arbeit without a Thermostat product is red", () => {
  withTasks(["replace_thermostat"]);
  const r = runAngebotscheck(ok, readSelection(ok));
  const f = r.groups
    .find((g) => g.key === "optional")
    .findings.find((x) => x.id === "arbeit-replace_thermostat");
  expect(f.severity).toBe("rot");
  expect(f.text).toContain("Austausch eines Thermostates");
  expect(r.status).toBe("rot");
});

test("picking the product clears it", () => {
  withTasks(
    ["replace_thermostat"],
    '<input type="checkbox" name="optThermo[]" checked />',
  );
  expect(findings(ok, readSelection(ok))).not.toContain(
    "arbeit-replace_thermostat",
  );
});

test("a panel product (WC) counts as selected", () => {
  withTasks(["install_toilet"], '<div id="menu_WC"><input type="checkbox" checked /></div>');
  expect(findings(ok, readSelection(ok))).not.toContain("arbeit-install_toilet");
  withTasks(["install_toilet"], '<div id="menu_WC"><input type="checkbox" /></div>');
  expect(findings(ok, readSelection(ok))).toContain("arbeit-install_toilet");
});

test("a material coupling reads the priced lines", () => {
  withTasks(["install_tray"]);
  // `ok` already has a Duschwanne line
  expect(findings(ok, readSelection(ok))).not.toContain("arbeit-install_tray");
  const empty = { materialsDisplayUI: { sum: 0, lines: [] } };
  expect(findings(empty, readSelection(empty))).toContain("arbeit-install_tray");
});

test("Trockenbau without Wandverkleidung is only yellow", () => {
  withTasks(["trockenbau_wc"]);
  const f = runAngebotscheck(ok, readSelection(ok))
    .groups.find((g) => g.key === "material")
    .findings.find((x) => x.id === "arbeit-trockenbau_wc");
  expect(f.severity).toBe("gelb");
});

test("every rule targets a group the check actually renders", () => {
  const keys = runAngebotscheck({}).groups.map((g) => g.key);
  for (const r of WORK_RULES) expect(keys).toContain(r.group);
});
