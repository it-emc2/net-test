/**
 * @jest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/public/script.js",
);

// updateSidebarForOffer lives inside a huge browser script; slice just that
// function out and run it against stubs instead of loading the whole file.
function loadUpdateSidebarForOffer(deps) {
  const src = fs.readFileSync(SCRIPT_PATH, "utf8");
  const start = src.indexOf("function updateSidebarForOffer() {");
  const end = src.indexOf("\n// Start a flow for a given offer", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  const body = src.slice(start, end);
  const make = new Function(
    "sideMenu",
    "nav",
    "loadWizardState",
    "getPagesForOfferType",
    "updateOfferSpecificSections",
    `${body}\nreturn updateSidebarForOffer;`,
  );
  return make(
    deps.sideMenu,
    null,
    () => deps.state,
    () => deps.pages,
    undefined,
  );
}

// Read the real flow order out of OFFERS.bu — a hardcoded copy here would go
// stale and hide exactly the ordering bug the last test in this file guards.
function buPagesFromSource() {
  const src = fs.readFileSync(SCRIPT_PATH, "utf8");
  const start = src.indexOf("  bu: {");
  const open = src.indexOf("pages: [", start);
  const close = src.indexOf("]", open);
  expect(open).toBeGreaterThan(-1);
  const lines = src
    .slice(open, close)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//")); // e.g. the disabled DaConfigDev
  return [...lines.join("\n").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const BU_PAGES = buPagesFromSource();

function render(state, pages) {
  const sideMenu = document.createElement("nav");
  loadUpdateSidebarForOffer({ sideMenu, state, pages })();
  return [...sideMenu.children].map((el) => {
    if (el.classList.contains("side-group")) {
      const header = el.querySelector(".side-group-header");
      return {
        group: header.querySelector(".side-group-title").textContent,
        num: header.querySelector(".side-num")?.textContent,
        // dot first, chevron last — order matters for the layout
        parts: [...header.children].map((c) => c.className),
        clickable: header.tagName,
        steps: [...el.querySelectorAll("a.side-link")].map((a) => a.dataset.step),
      };
    }
    if (el.classList.contains("accordion-group")) {
      return {
        group: el.querySelector(".accordion-header span").textContent,
        steps: [...el.querySelectorAll("a.side-link")].map((a) => a.dataset.step),
      };
    }
    return {
      step: el.dataset.step,
      num: el.querySelector(".side-num")?.textContent,
      label: el.querySelector("span:last-child").textContent,
    };
  });
}

test("bu sidebar groups Arbeit and Material, keeps every page reachable", () => {
  const out = render({ offerType: "bu", step: "Duschwanne" }, BU_PAGES);

  expect(out.map((e) => e.step ?? e.group)).toEqual([
    "home",
    "Kundendaten",
    "Auszuführende Arbeiten",
    "Material für Badumbau",
    "Optional",
    "Rabatt",
    "Kosten",
    "Zusammenfassung",
    "Developer",
    "CRM",
  ]);

  expect(out[2].steps).toEqual(["Arbeitszeit", "Arbeiten"]);
  expect(out[3].steps).toEqual([
    "Duschwanne",
    "Fussboden",
    "Wandverkleidung",
    "Duschabtrennung",
    "DuschabtrennungNeu",
    "Duschvorhang",
  ]);

  // Groups never collapse and the header is not interactive.
  expect(out[2].clickable).toBe("DIV");
  expect(out[3].clickable).toBe("DIV");

  // dot left, numeral, title, chevron right
  expect(out[3].parts).toEqual([
    "dot",
    "side-num",
    "side-group-title",
    "side-group-chevron",
  ]);

  // roman numerals live in their own badge, not baked into the label text
  expect(out[2].num).toBe("I");
  expect(out[3].num).toBe("II");

  // "Optional" is only relabelled, its step id is untouched
  expect(out[4]).toEqual({
    step: "Optional",
    num: "III",
    label: "Optionale Produkte",
  });

  // nothing lost: every bu page still has a link somewhere
  const rendered = new Set(
    out.flatMap((e) => (e.steps ? e.steps : [e.step])),
  );
  for (const page of BU_PAGES) expect(rendered.has(page)).toBe(true);
});

// The done-circles and Weiter/Zurück are driven by the index in OFFERS.bu.pages
// (isDoneInFlow), NOT by what the sidebar shows. If the two disagree, circles
// light up out of sequence: clicking Duschabtrennung also filled in
// Duschabtrennung (neu) and Duschvorhang, which sit below it.
test("sidebar order matches the flow order", () => {
  const out = render({ offerType: "bu", step: "Kundendaten" }, BU_PAGES);

  const DEV_AND_CRM = ["admin", "services", "crm-emc2"];
  const shown = out
    .flatMap((e) => (e.steps ? e.steps : [e.step]))
    .filter((s) => s !== "home" && !DEV_AND_CRM.includes(s));

  expect(shown).toEqual(BU_PAGES.filter((p) => !DEV_AND_CRM.includes(p)));
});

test("bwt sidebar groups Arbeitszeit + Arbeiten under I, numbers the konfigurator II", () => {
  const pages = [
    "Kundendaten",
    "Arbeitszeit",
    "bwtArbeiten",
    "bwt",
    "Rabatt",
    "Kosten",
    "Zusammenfassung",
    "admin",
  ];
  const out = render({ offerType: "bwt", step: "bwt" }, pages);

  expect(out.map((e) => e.step ?? e.group)).toEqual([
    "home",
    "Kundendaten",
    "Auszuführende Arbeiten",
    "bwt",
    "Rabatt",
    "Kosten",
    "Zusammenfassung",
    "Developer",
  ]);

  expect(out[2].steps).toEqual(["Arbeitszeit", "bwtArbeiten"]);
  expect(out[2].num).toBe("I");

  // Single konfigurator page carries its numeral on the link itself.
  expect(out[3]).toEqual({ step: "bwt", num: "II", label: "Badewannentür" });
});

test("non-bu/bwt offers keep the flat list", () => {
  const pages = [
    "Kundendaten",
    "Arbeitszeit",
    "hl",
    "Rabatt",
    "Kosten",
    "Zusammenfassung",
    "admin",
  ];
  const out = render({ offerType: "hl", step: "hl" }, pages);

  expect(out.map((e) => e.step ?? e.group)).toEqual([
    "home",
    "Kundendaten",
    "Arbeitszeit",
    "hl",
    "Rabatt",
    "Kosten",
    "Zusammenfassung",
    "Developer",
  ]);
});
