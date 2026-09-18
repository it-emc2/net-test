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
