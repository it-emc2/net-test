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

const BU_PAGES = [
  "Kundendaten",
  "Arbeitszeit",
  "Arbeiten",
  "Duschwanne",
  "Fussboden",
  "Wandverkleidung",
  "DuschabtrennungNeu",
  "Duschvorhang",
  "Duschabtrennung",
  "Optional",
  "Rabatt",
  "Kosten",
  "Zusammenfassung",
  "admin",
  "services",
  "crm-emc2",
];

function render(state, pages) {
  const sideMenu = document.createElement("nav");
  loadUpdateSidebarForOffer({ sideMenu, state, pages })();
  return [...sideMenu.children].map((el) =>
    el.classList.contains("accordion-group")
      ? {
          group: el.querySelector(".accordion-header span").textContent,
          open: el.querySelector(".accordion-body").classList.contains("open"),
          steps: [...el.querySelectorAll("a.side-link")].map(
            (a) => a.dataset.step,
          ),
        }
      : { step: el.dataset.step, label: el.textContent.trim() },
  );
}

test("bu sidebar groups Arbeit and Material, keeps every page reachable", () => {
  const out = render({ offerType: "bu", step: "Duschwanne" }, BU_PAGES);

  expect(out.map((e) => e.step ?? e.group)).toEqual([
    "home",
    "Kundendaten",
    "I Arbeit",
    "II Material",
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

  // active step sits in Material → that group starts open, the other closed
  expect(out[3].open).toBe(true);
  expect(out[2].open).toBe(false);

  // "Optional" is only relabelled, its step id is untouched
  expect(out[4]).toEqual({ step: "Optional", label: "III Optional Products" });

  // nothing lost: every bu page still has a link somewhere
  const rendered = new Set(
    out.flatMap((e) => (e.steps ? e.steps : [e.step])),
  );
  for (const page of BU_PAGES) expect(rendered.has(page)).toBe(true);
});

test("non-bu offers keep the flat list", () => {
  const pages = [
    "Kundendaten",
    "Arbeitszeit",
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
    "Arbeitszeit",
    "bwt",
    "Rabatt",
    "Kosten",
    "Zusammenfassung",
    "Developer",
  ]);
});
