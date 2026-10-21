import {
  emptyVersand,
  formatVersand,
  markVersendet,
  setVersand,
  VERSAND_LABEL,
} from "../../src/public/angebotsversand.js";

beforeEach(() => {
  window.__zfVersand = emptyVersand();
  document.body.innerHTML = '<div id="zfVersandStatus"></div>';
});

test("nothing sent yet", () => {
  expect(formatVersand(emptyVersand())).toBe("Noch nicht versendet.");
  expect(formatVersand(undefined)).toBe("Noch nicht versendet.");
});

test("marking a send records art + timestamp and paints the line", () => {
  markVersendet("mail", "2026-09-18T12:30:00Z");
  expect(window.__zfVersand.art).toBe("mail");
  expect(window.__zfVersand.versendetAm).toBe("2026-09-18T12:30:00.000Z");
  expect(document.getElementById("zfVersandStatus").textContent).toContain(
    "Versendet per E-Mail",
  );
});

test("an unknown Versandart is ignored", () => {
  markVersendet("fax");
  expect(window.__zfVersand).toEqual(emptyVersand());
});

test("restore keeps a valid state and drops a broken one", () => {
  setVersand({ art: "post", versendetAm: "2026-09-18T12:30:00.000Z" });
  expect(window.__zfVersand.art).toBe("post");
  setVersand({ art: "brieftaube" });
  expect(window.__zfVersand).toEqual(emptyVersand());
});

test("both send paths of showSentDialog are covered", () => {
  expect(Object.keys(VERSAND_LABEL).sort()).toEqual(["mail", "post"]);
});

test("the page heading follows the sidebar label: Angebotsversand for bu only", async () => {
  document.body.innerHTML =
    '<section id="zfVersand"><div class="bitrix-card"><div id="zfVersandStatus"></div></div></section>' +
    '<h2 id="zfPageTitle">Zusammenfassung</h2>';
  window.getCurrentOfferType = () => "bu";
  window.dispatchEvent(new Event("hashchange"));
  expect(document.getElementById("zfPageTitle").textContent).toBe("Angebotsversand");

  window.getCurrentOfferType = () => "bwt";
  window.dispatchEvent(new Event("hashchange"));
  expect(document.getElementById("zfPageTitle").textContent).toBe("Zusammenfassung");
  delete window.getCurrentOfferType;
});
