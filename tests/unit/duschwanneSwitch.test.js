import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/public/script.js",
);

// script.js is a huge browser script — slice just the switch helpers out.
function loadSwitch() {
  const src = fs.readFileSync(SCRIPT, "utf8");
  const start = src.indexOf("// Saved offers predate the switch.");
  const end = src.indexOf("window.setDwTrayEnabled = setDwTrayEnabled;", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return new Function(
    `${src.slice(start, end)}\nreturn { deriveDwTrayEnabled, applyDwTraySwitch };`,
  )();
}

const { deriveDwTrayEnabled, applyDwTraySwitch } = loadSwitch();

// What "off" must remove / blank — spelled out here so a change to the
// lists in script.js is a deliberate, visible test change.
const DW_TRAY_DROP = ["quickAdd", "abdichtSet", "drainSet", "stelzlager", "traySuggestion"];
const DW_TRAY_EMPTY = {
  chosenTrayProductId: null,
  traySize: "",
  dwCustomName: "",
  dwCustomPrice: "",
  dwCustomQty: "1",
  dwCustomId: "",
};

// What a real payload.duschwanne looks like: Duschwanne form + Fußboden form +
// Wanne picker + work tasks, all merged into one object.
const legacyOffer = () => ({
  chosenTrayProductId: "DW90120",
  traySuggestion: "DW90120",
  traySize: "90 x 120 cm",
  trayColor: "Weiss",
  tray_w_cm: "90",
  tray_l_cm: "120",
  abdichtSet: "Wannenabdichtband-Set TRWDB",
  drainSet: "Ablaufgarnitur TRAGD9060",
  smallMaterial: "Kleinmaterial",
  stelzlager: "PLA5282",
  stelzlagerQty: "8",
  ebenerdigeMontage: true,
  budgetMode: "1",
  addFlooring: "on",
  floorArea: "6,5",
  flooringProduct: ["V5FB02|Eiche"],
  computed: { areaM2: 6.5 },
  chosenBathtubProductId: "TUB1",
  workTasks: ["install_tray"],
});

describe("deriving the switch for saved offers", () => {
  test("an explicit flag always wins", () => {
    expect(deriveDwTrayEnabled({ trayEnabled: false, chosenTrayProductId: "X" })).toBe(false);
    expect(deriveDwTrayEnabled({ trayEnabled: true })).toBe(true);
  });

  test("a legacy offer with a tray comes back on", () => {
    expect(deriveDwTrayEnabled(legacyOffer())).toBe(true);
  });

  test("a legacy offer with only the default accessories comes back on", () => {
    // accessories are ticked by default — practically every old BU offer
    expect(deriveDwTrayEnabled({ abdichtSet: "x", smallMaterial: "Kleinmaterial" })).toBe(true);
  });

  test("a legacy custom tray (Freier Posten) comes back on", () => {
    expect(deriveDwTrayEnabled({ quickAdd: [{ label: "Sonderwanne", price: 799 }] })).toBe(true);
  });

  test("Kleinmaterial alone does not switch the tray on", () => {
    expect(deriveDwTrayEnabled({ smallMaterial: "Kleinmaterial" })).toBe(false);
    expect(deriveDwTrayEnabled({})).toBe(false);
    expect(deriveDwTrayEnabled(undefined)).toBe(false);
  });
});

describe("stripping the payload", () => {
  test("on: the payload is untouched apart from the flag", () => {
    const before = legacyOffer();
    const after = applyDwTraySwitch(legacyOffer(), true);
    expect(after).toEqual({ ...before, trayEnabled: true });
  });

  test("off: nothing that makes a price is left — Kleinmaterial, Fußboden, Wanne, tasks stay", () => {
    const after = applyDwTraySwitch({ ...legacyOffer(), quickAdd: [{ label: "x", price: 1 }] }, false);
    for (const key of DW_TRAY_DROP) expect(after).not.toHaveProperty(key);
    expect(after.chosenTrayProductId).toBeNull();
    expect(after.traySize).toBe("");
    expect(after).toMatchObject({
      trayEnabled: false,
      smallMaterial: "Kleinmaterial",
      ebenerdigeMontage: true,
      budgetMode: "1",
      addFlooring: "on",
      floorArea: "6,5",
      flooringProduct: ["V5FB02|Eiche"],
      computed: { areaM2: 6.5 },
      chosenBathtubProductId: "TUB1",
      workTasks: ["install_tray"],
    });
  });

  test("off produces exactly an untouched Duschwanne page (legacy no-tray offer)", () => {
    // What a saved offer with nothing picked on the Duschwanne page looks like
    // — taken from real offers that were saved before the switch existed.
    const untouched = {
      chosenTrayProductId: null,
      traySize: "",
      trayColor: "Weiss",
      tray_w_cm: "",
      tray_l_cm: "",
      tray_h_cm: "",
      stelzlagerQty: "8",
      dwCustomName: "",
      dwCustomPrice: "",
      dwCustomQty: "1",
      dwCustomId: "",
      smallMaterial: "Kleinmaterial",
      floorArea: "4",
    };
    expect(deriveDwTrayEnabled(untouched)).toBe(false);
    const { trayEnabled, ...rebuilt } = applyDwTraySwitch({ ...untouched }, false);
    expect(rebuilt).toEqual(untouched);
  });

  test("off never invents keys the form did not send", () => {
    const after = applyDwTraySwitch({ abdichtSet: "x", smallMaterial: "y" }, false);
    for (const key of Object.keys(DW_TRAY_EMPTY)) expect(after).not.toHaveProperty(key);
  });

  test("off blanks exactly the expected keys and nothing else", () => {
    const full = { ...legacyOffer(), quickAdd: [{ label: "x" }], dwCustomName: "Sonder", dwCustomPrice: "9", dwCustomQty: "2", dwCustomId: "S1" };
    const after = applyDwTraySwitch({ ...full }, false);
    const changed = Object.keys(full).filter((k) => JSON.stringify(full[k]) !== JSON.stringify(after[k]));
    expect(changed.sort()).toEqual([...DW_TRAY_DROP, ...Object.keys(DW_TRAY_EMPTY)].sort());
  });

  test("a legacy offer round-trips to the identical payload (same price)", () => {
    const saved = legacyOffer();
    const rebuilt = applyDwTraySwitch(legacyOffer(), deriveDwTrayEnabled(saved));
    const { trayEnabled, ...rest } = rebuilt;
    expect(rest).toEqual(saved);
    expect(trayEnabled).toBe(true);
  });
});

test("every markup piece the switch relies on exists", async () => {
  const { JSDOM } = await import("jsdom");
  const doc = new JSDOM(fs.readFileSync("src/public/index.html", "utf8")).window.document;
  const form = doc.getElementById("form-duschwanne");
  expect(doc.getElementById("dwTrayToggle")).not.toBeNull();
  expect(doc.getElementById("dwTrayToggle").hasAttribute("name")).toBe(false);
  expect(form.hasAttribute("data-tray-off")).toBe(true); // off by default
  // Kleinmaterial must stay visible with the switch off.
  expect(doc.getElementById("smallMaterial").closest(".dw-tray-only")).toBeNull();
  // The three tray accessories hide with it.
  for (const pid of ["TRWDB", "AGD9060", "PLA5282"]) {
    expect(form.querySelector(`input[data-product-id="${pid}"]`).closest(".dw-tray-only")).not.toBeNull();
  }
  for (const id of ["traySmartSearch", "dw-custom", "slateTrayColorSection"]) {
    expect(doc.getElementById(id).classList.contains("dw-tray-only")).toBe(true);
  }
});

describe("pricing fingerprint", () => {
  test("the switch flag alone never changes a saved offer's fingerprint", async () => {
    const { computeFingerprint } = await import("../../src/logic/pricing-core.js");
    const saved = { activeOffer: "bu", duschwanne: legacyOffer() };
    const reopened = {
      activeOffer: "bu",
      duschwanne: applyDwTraySwitch(legacyOffer(), deriveDwTrayEnabled(saved.duschwanne)),
    };
    expect(reopened.duschwanne.trayEnabled).toBe(true);
    expect(computeFingerprint(reopened)).toBe(computeFingerprint(saved));
  });

  test("switching the tray off does change it — the price really changes", async () => {
    const { computeFingerprint } = await import("../../src/logic/pricing-core.js");
    const on = { duschwanne: applyDwTraySwitch(legacyOffer(), true) };
    const off = { duschwanne: applyDwTraySwitch(legacyOffer(), false) };
    expect(computeFingerprint(off)).not.toBe(computeFingerprint(on));
  });

  test("the caller's payload is not mutated", async () => {
    const { computeFingerprint } = await import("../../src/logic/pricing-core.js");
    const p = { duschwanne: { trayEnabled: true, smallMaterial: "x" } };
    computeFingerprint(p);
    expect(p.duschwanne.trayEnabled).toBe(true);
  });
});

test("Versand/Checkliste state never changes the pricing fingerprint", async () => {
  const { computeFingerprint } = await import("../../src/logic/pricing-core.js");
  const base = { activeOffer: "bu", duschwanne: legacyOffer() };
  const withWorkflow = {
    ...base,
    zusammenfassung: {
      versand: { art: "mail", versendetAm: "2026-10-13T10:00:00.000Z" },
      checkliste: { skizzeErstellt: true, fotosErstellt: false },
    },
  };
  expect(computeFingerprint(withWorkflow)).toBe(computeFingerprint(base));
});
