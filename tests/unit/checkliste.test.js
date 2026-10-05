import {
  BOXES,
  emptyCheckliste,
  formatCheckStatus,
  formatVersendet,
  readCheckliste,
  setCheckliste,
} from "../../src/public/checkliste.js";

beforeEach(() => {
  document.body.innerHTML = Object.values(BOXES)
    .map((id) => `<input type="checkbox" id="${id}" />`)
    .join("");
});

test("Angebotscheck status falls back to 'not checked yet'", () => {
  expect(formatCheckStatus(undefined)).toContain("Noch nicht geprüft");
  expect(formatCheckStatus({ status: "gelb" })).toBe("🟡 Bitte prüfen");
  expect(formatCheckStatus({ status: "rot" })).toBe("🔴 Fehlt");
});

test("'Angebot versendet?' is derived from the Versand state", () => {
  expect(formatVersendet(null)).toBe("Nein");
  expect(formatVersendet({ art: "post" })).toBe("Nein");
  expect(
    formatVersendet({ art: "mail", versendetAm: "2026-09-18T12:30:00.000Z" }),
  ).toMatch(/^Ja — Versendet per E-Mail/);
});

test("ticked boxes are read out of the DOM", () => {
  expect(readCheckliste()).toEqual(emptyCheckliste());
  document.getElementById(BOXES.fotosErstellt).checked = true;
  expect(readCheckliste()).toEqual({
    skizzeErstellt: false,
    fotosErstellt: true,
  });
});

test("restore ticks the saved boxes and ignores unknown keys", () => {
  setCheckliste({ skizzeErstellt: true, quatsch: true });
  expect(document.getElementById(BOXES.skizzeErstellt).checked).toBe(true);
  expect(window.__zfCheckliste).toEqual({
    skizzeErstellt: true,
    fotosErstellt: false,
  });
});

test("restoring nothing clears the boxes", () => {
  document.getElementById(BOXES.skizzeErstellt).checked = true;
  setCheckliste(undefined);
  expect(window.__zfCheckliste).toEqual(emptyCheckliste());
});

/* ------------------------------------------- required items & auto rows */

import { paintCheckliste, REQUIRED, checkDone } from "../../src/public/checkliste.js";

function mountCheckliste() {
  document.body.innerHTML = `
    <div id="zfChkSummary"></div>
    ${REQUIRED.map(
      (id) =>
        `<label class="zf-chk-item"><input type="checkbox" id="${id}" /></label>`,
    ).join("")}
    <small id="zfChkCheckStatus"></small><small id="zfChkVersendet"></small>`;
}

afterEach(() => {
  delete window.__angebotscheck;
  delete window.__zfVersand;
  document.documentElement.removeAttribute("data-zf-checkliste-open");
});

test("nothing done: every required row is red and the sidebar marker is set", () => {
  mountCheckliste();
  const r = paintCheckliste();
  expect(r).toEqual({ done: 0, total: 4, complete: false });
  expect(document.querySelectorAll(".zf-chk-item.is-missing")).toHaveLength(4);
  expect(document.documentElement.hasAttribute("data-zf-checkliste-open")).toBe(true);
  expect(document.getElementById("zfChkSummary").textContent).toContain("0 von 4");
});

test("auto rows tick themselves from the check and the Versand", () => {
  mountCheckliste();
  window.__angebotscheck = { status: "gelb" }; // hints only → counts as done
  window.__zfVersand = { art: "mail", versendetAm: "2026-10-05T10:00:00.000Z" };
  paintCheckliste();
  expect(document.getElementById("zfChk_check").checked).toBe(true);
  expect(document.getElementById("zfChk_versendet").checked).toBe(true);
});

test("a red Angebotscheck keeps its row open", () => {
  expect(checkDone({ status: "rot" })).toBe(false);
  expect(checkDone({ status: "gruen" })).toBe(true);
  expect(checkDone(undefined)).toBe(false);
});

test("all four done: green summary and the sidebar marker is cleared", () => {
  mountCheckliste();
  window.__angebotscheck = { status: "gruen" };
  window.__zfVersand = { art: "post", versendetAm: "2026-10-05T10:00:00.000Z" };
  document.getElementById(BOXES.skizzeErstellt).checked = true;
  document.getElementById(BOXES.fotosErstellt).checked = true;
  const r = paintCheckliste();
  expect(r.complete).toBe(true);
  expect(document.querySelectorAll(".is-missing")).toHaveLength(0);
  expect(document.documentElement.hasAttribute("data-zf-checkliste-open")).toBe(false);
});

test("every required id exists in the real page markup", async () => {
  const fs = await import("node:fs");
  const { JSDOM } = await import("jsdom");
  const doc = new JSDOM(fs.readFileSync("src/public/index.html", "utf8")).window.document;
  const page = doc.getElementById("page-Checkliste");
  for (const id of [...REQUIRED, "zfChkSummary", "zfChkCheckStatus", "zfChkVersendet"]) {
    expect(page.querySelector(`#${id}`)).not.toBeNull();
  }
});
