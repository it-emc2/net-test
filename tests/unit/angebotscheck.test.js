import {
  readSelection,
  renderAngebotscheck,
  runAngebotscheck,
  WORK_RULES,
} from "../../src/public/angebotscheck.js";

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

const rowsOf = (result) => result.groups.flatMap((g) => g.rows);
const row = (result, id) => rowsOf(result).find((r) => r.id === id);
const group = (result, key) => result.groups.find((g) => g.key === key);

function withTasks(values, extraHtml = "") {
  document.body.innerHTML =
    values
      .map(
        (v) =>
          `<input type="checkbox" name="duschwanne[workTasks][]" value="${v}" checked />`,
      )
      .join("") + extraHtml;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

/* ------------------------------------------------------- standing checks */

test("a complete offer is green", () => {
  expect(runAngebotscheck(ok).status).toBe("gruen");
});

test("empty offer is red in Arbeiten and Material", () => {
  const r = runAngebotscheck({});
  expect(r.status).toBe("rot");
  expect(group(r, "arbeiten").status).toBe("rot");
  expect(group(r, "material").status).toBe("rot");
});

test("a passing rule still shows up, in green", () => {
  const r = runAngebotscheck(ok);
  expect(row(r, "material-leer").status).toBe("gruen");
  expect(row(r, "material-ohne-preis").status).toBe("gruen");
});

test("Duschwanne without Duschabtrennung is yellow", () => {
  const p = {
    ...ok,
    materialsDisplayUI: {
      sum: 500,
      lines: [{ productId: "DW01", category: "Duschwanne", qty: 1, lineTotal: 500 }],
    },
  };
  expect(group(runAngebotscheck(p), "material").status).toBe("gelb");
});

test("material line without Artikel-ID or price is reported", () => {
  const p = {
    ...ok,
    materialsDisplayUI: { sum: 0, lines: [{ name: "Fliesen", qty: 1, lineTotal: 0 }] },
  };
  const r = runAngebotscheck(p);
  expect(row(r, "material-ohne-artikelid").status).toBe("gelb");
  expect(row(r, "material-ohne-preis").details[0]).toContain("Fliesen");
});

test("a throwing rule does not break the check", () => {
  const p = { materialsDisplayUI: { get lines() { throw new Error("boom"); } } };
  expect(() => runAngebotscheck(p)).not.toThrow();
});

/* ---------------------------------------------- Arbeit ⇄ Produkt couplings */

test("an untouched coupling produces no row at all", () => {
  withTasks([]);
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-replace_thermostat"))
    .toBeUndefined();
  expect(row(runAngebotscheck(ok, readSelection(ok)), "produkt-replace_thermostat"))
    .toBeUndefined();
});

test("Thermostat-Arbeit without a Thermostat product is red", () => {
  withTasks(["replace_thermostat"]);
  const r = runAngebotscheck(ok, readSelection(ok));
  const found = row(r, "arbeit-replace_thermostat");
  expect(found.status).toBe("rot");
  expect(found.group).toBe("optional");
  expect(found.details[0]).toContain("Austausch eines Thermostates");
  expect(r.status).toBe("rot");
});

test("picking the product turns that row green instead of removing it", () => {
  withTasks(
    ["replace_thermostat"],
    '<input type="checkbox" name="optThermo[]" checked />',
  );
  const found = row(runAngebotscheck(ok, readSelection(ok)), "arbeit-replace_thermostat");
  expect(found.status).toBe("gruen");
  expect(found.details).toEqual([]);
});

test("reverse: a product without its work task is yellow, pointing at Arbeiten", () => {
  withTasks([], '<input type="checkbox" name="optThermo[]" checked />');
  const found = row(runAngebotscheck(ok, readSelection(ok)), "produkt-replace_thermostat");
  expect(found.status).toBe("gelb");
  expect(found.group).toBe("arbeiten");
  expect(found.target).toBe("Arbeiten");
});

test("reverse stays quiet when a sibling task covers the same product", () => {
  // "Duschsystem inkl. Thermostat" ticked — the no-thermo rule must not claim
  // the same Duschsystem product is orphaned.
  withTasks(
    ["replace_shower_with_thermo"],
    '<input type="checkbox" name="optShower[]" checked />',
  );
  const r = runAngebotscheck(ok, readSelection(ok));
  expect(row(r, "produkt-replace_shower_no_thermo")).toBeUndefined();
  expect(row(r, "arbeit-replace_shower_with_thermo").status).toBe("gruen");
});

test("soft couplings have no reverse (Wandverkleidung without Trockenbau is fine)", () => {
  const p = {
    ...ok,
    materialsDisplayUI: {
      sum: 100,
      lines: [{ productId: "W1", category: "Wandverkleidung", qty: 1, lineTotal: 100 }],
    },
  };
  withTasks([]);
  expect(row(runAngebotscheck(p, readSelection(p)), "produkt-trockenbau_wc"))
    .toBeUndefined();
});

test("an empty product catalog is yellow, not red", () => {
  // menu_WC exists but has no products yet — nothing to pick.
  withTasks(["install_toilet"], '<div id="menu_WC"></div>');
  const found = row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_toilet");
  expect(found.status).toBe("gelb");
  expect(found.details[0]).toContain("kein Produkt hinterlegt");

  // …and it goes green on its own once a product exists and is ticked.
  withTasks(
    ["install_toilet"],
    '<div id="menu_WC"><input type="checkbox" checked /></div>',
  );
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_toilet").status)
    .toBe("gruen");
});

test("Badewanne is read from the picker's hidden field, not from a checkbox", () => {
  // The Wanne picker writes chosenBathtubProductId — an empty menu_WANNE says
  // nothing about whether a tub was chosen.
  withTasks(
    ["install_bathtub"],
    '<div id="menu_WANNE"></div><input type="hidden" id="chosenBathtubProductId" value="" />',
  );
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_bathtub").status)
    .toBe("rot");

  withTasks(
    ["install_bathtub"],
    '<div id="menu_WANNE"></div><input type="hidden" id="chosenBathtubProductId" value="V2PT83LC" />',
  );
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_bathtub").status)
    .toBe("gruen");
});

test("Wannenaufsatz accepts the picker's screen field", () => {
  const noMaterial = { materialsDisplayUI: { sum: 0, lines: [] } };
  withTasks(["install_bathtub_screen"]);
  expect(
    row(runAngebotscheck(noMaterial, readSelection(noMaterial)), "arbeit-install_bathtub_screen")
      .status,
  ).toBe("gelb");

  withTasks(
    ["install_bathtub_screen"],
    '<input type="hidden" id="chosenScreenProductId" value="SCR1" />',
  );
  expect(
    row(runAngebotscheck(noMaterial, readSelection(noMaterial)), "arbeit-install_bathtub_screen")
      .status,
  ).toBe("gruen");
});

test("Duschvorhang is read from its configurator, not from the priced category", () => {
  withTasks(["install_shower_curtain"]);
  delete window.__vorhangConfigurator;
  expect(
    row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_shower_curtain").status,
  ).toBe("rot");

  window.__vorhangConfigurator = { getLines: () => [{ net: 79, label: "Vorhang" }] };
  expect(
    row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_shower_curtain").status,
  ).toBe("gruen");
  delete window.__vorhangConfigurator;
});

test("Duschabtrennung rows point at the new tab", () => {
  withTasks(["install_enclosure"]);
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_enclosure").target)
    .toBe("DuschabtrennungNeu");
});

test("a panel product (WC) counts as selected", () => {
  withTasks(["install_toilet"], '<div id="menu_WC"><input type="checkbox" checked /></div>');
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_toilet").status)
    .toBe("gruen");
  withTasks(["install_toilet"], '<div id="menu_WC"><input type="checkbox" /></div>');
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_toilet").status)
    .toBe("rot");
});

test("a material coupling reads the priced lines", () => {
  withTasks(["install_tray"]);
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-install_tray").status)
    .toBe("gruen");
  const empty = { materialsDisplayUI: { sum: 0, lines: [] } };
  expect(row(runAngebotscheck(empty, readSelection(empty)), "arbeit-install_tray").status)
    .toBe("rot");
});

test("Trockenbau without Wandverkleidung is only yellow", () => {
  withTasks(["trockenbau_wc"]);
  expect(row(runAngebotscheck(ok, readSelection(ok)), "arbeit-trockenbau_wc").status)
    .toBe("gelb");
});

test("every rule targets a group the check renders and a page to jump to", () => {
  const keys = runAngebotscheck({}).groups.map((g) => g.key);
  for (const r of WORK_RULES) {
    expect(keys).toContain(r.group);
    expect(typeof r.target).toBe("string");
  }
});

/* ----------------------------------------------------------- presentation */

test("rows are sorted worst first", () => {
  withTasks(["install_tray", "replace_thermostat"]); // green + red
  const rows = group(runAngebotscheck(ok, readSelection(ok)), "material").rows;
  const ranks = rows.map((r) => ({ gruen: 0, gelb: 1, rot: 2 })[r.status]);
  expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
});

test("each row renders as a button carrying its target page", () => {
  const root = document.createElement("div");
  renderAngebotscheck(root, runAngebotscheck({}));
  const buttons = root.querySelectorAll("button.zf-check-row");
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons[0].dataset.target).toBeTruthy();
  expect(root.querySelector(".zf-check-head").textContent).toContain("🔴");
});

test("two tasks wanting the same product group give one reverse row", () => {
  // Duschsystem mit/ohne Thermostat both want a Duschsystem product.
  withTasks([], '<input type="checkbox" name="optShower[]" checked />');
  const shower = rowsOf(runAngebotscheck(ok, readSelection(ok))).filter((r) =>
    r.id.startsWith("produkt-replace_shower"),
  );
  expect(shower).toHaveLength(1);
});

/* --------------------------------------------------------- Arbeitszeit tab */

function withArbeitszeit(distance, travel) {
  document.body.innerHTML =
    `<input id="distanceKm" value="${distance}" />` +
    `<input id="travelTime" value="${travel}" />`;
}

test("empty Anfahrt and Reisezeit are red, not green", () => {
  withArbeitszeit("", "");
  const r = runAngebotscheck(ok, readSelection(ok));
  expect(row(r, "anfahrt-fehlt").status).toBe("rot");
  expect(row(r, "reisezeit-fehlt").status).toBe("rot");
  expect(row(r, "anfahrt-fehlt").target).toBe("Arbeitszeit");
  expect(r.status).toBe("rot");
});

test("a zero distance or 00:00 travel time counts as missing", () => {
  withArbeitszeit("0", "00:00");
  const r = runAngebotscheck(ok, readSelection(ok));
  expect(row(r, "anfahrt-fehlt").status).toBe("rot");
  expect(row(r, "reisezeit-fehlt").status).toBe("rot");
});

test("filled Anfahrt and Reisezeit are green", () => {
  withArbeitszeit("42", "00:45");
  const r = runAngebotscheck(ok, readSelection(ok));
  expect(row(r, "anfahrt-fehlt").status).toBe("gruen");
  expect(row(r, "reisezeit-fehlt").status).toBe("gruen");
});

test("a decimal distance with a comma still counts", () => {
  withArbeitszeit("12,5", "01:00");
  expect(row(runAngebotscheck(ok, readSelection(ok)), "anfahrt-fehlt").status)
    .toBe("gruen");
});

test("without a selection the form rules stay silent", () => {
  const r = runAngebotscheck(ok);
  expect(row(r, "anfahrt-fehlt")).toBeUndefined();
  expect(row(r, "reisezeit-fehlt")).toBeUndefined();
});
