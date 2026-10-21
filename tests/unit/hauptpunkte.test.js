import {
  HAUPTPUNKTE,
  missingHauptpunkte,
  sendEnv,
  confirmHauptpunkte,
} from "../../src/public/angebotscheck.js";

const noEnv = { daLines: 0, daOldPicks: 0, curtainLines: 0, optionalLines: 0 };
const keys = (list) => list.map((h) => h.key);

const fullOffer = {
  duschwanne: { trayEnabled: true, addFlooring: "on" },
  wandverkleidung: { wvEnabled: true },
};
const fullEnv = { daLines: 2, daOldPicks: 0, curtainLines: 1, optionalLines: 3 };

describe("which main items are missing", () => {
  test("a new, empty BU offer misses every main item", () => {
    expect(keys(missingHauptpunkte({}, noEnv))).toEqual(HAUPTPUNKTE.map((h) => h.key));
  });

  test("a complete offer misses nothing", () => {
    expect(missingHauptpunkte(fullOffer, fullEnv)).toEqual([]);
  });

  test("only the unselected ones are asked", () => {
    const p = { duschwanne: { trayEnabled: true }, wandverkleidung: { wvEnabled: false } };
    expect(keys(missingHauptpunkte(p, { ...noEnv, daLines: 1 }))).toEqual([
      "fussboden",
      "wandverkleidung",
      "duschvorhang",
      "optional",
    ]);
  });

  test("Wandverkleidung als Fußboden counts as Fußboden", () => {
    const p = { ...fullOffer, duschwanne: { trayEnabled: true, addWallCladding: "on" } };
    expect(keys(missingHauptpunkte(p, fullEnv))).not.toContain("fussboden");
  });

  test("a bathtub picked on the Optional tab counts as optional products", () => {
    const p = { ...fullOffer, duschwanne: { ...fullOffer.duschwanne, chosenBathtubProductId: "TUB1" } };
    expect(keys(missingHauptpunkte(p, { ...fullEnv, optionalLines: 0 }))).not.toContain("optional");
  });

  test("other offer types are not checked", () => {
    expect(missingHauptpunkte({}, noEnv, "bwt")).toEqual([]);
    expect(missingHauptpunkte({}, noEnv, "hl")).toEqual([]);
  });

  test("every question ends up asking 'Ist das korrekt?' and names a page", () => {
    for (const h of HAUPTPUNKTE) {
      expect(h.question).toMatch(/^Es wurde/);
      expect(typeof h.page).toBe("string");
    }
  });
});

describe("reading the configurators at send time", () => {
  test("curtain lines in duschabtrennung.quickAdd do not count as a Duschabtrennung", () => {
    const win = {
      __vorhangConfigurator: { getLines: () => [{ articleNumber: "VH1" }] },
      __daConfigurator: { getLines: () => [] },
      __pricing: {},
    };
    const env = sendEnv({ duschabtrennung: { quickAdd: [{ productId: "VH1" }] } }, win);
    expect(env).toMatchObject({ daLines: 0, daOldPicks: 0, curtainLines: 1 });
  });

  test("an old Duschabtrennung page pick counts", () => {
    const win = { __pricing: {} };
    const env = sendEnv({ duschabtrennung: { quickAdd: [{ productId: "HASS123" }] } }, win);
    expect(env.daOldPicks).toBe(1);
  });

  test("a broken configurator does not throw", () => {
    const win = { __daConfigurator: { getLines: () => { throw new Error("x"); } } };
    expect(() => sendEnv({}, win)).not.toThrow();
  });
});

describe("the popup", () => {
  afterEach(() => {
    document.getElementById("hpConfirmOverlay")?.remove();
    window.__pricing = undefined;
  });

  test("nothing missing: no popup, resolves true", async () => {
    window.__pricing = { optionalDisplayUI: { lines: [{ productId: "X" }] } };
    window.__daConfigurator = { getLines: () => [{ articleNumber: "DA" }] };
    window.__vorhangConfigurator = { getLines: () => [{ articleNumber: "VH" }] };
    await expect(confirmHauptpunkte(fullOffer, "bu")).resolves.toBe(true);
    expect(document.getElementById("hpConfirmOverlay")).toBeNull();
    delete window.__daConfigurator;
    delete window.__vorhangConfigurator;
  });

  test("send stays disabled until every item is confirmed", async () => {
    const result = confirmHauptpunkte({}, "bu");
    const overlay = document.getElementById("hpConfirmOverlay");
    const boxes = [...overlay.querySelectorAll("input[data-hp]")];
    const send = overlay.querySelector(".ang-stage-btn--primary");
    expect(boxes).toHaveLength(HAUPTPUNKTE.length);
    expect(overlay.textContent).toContain("Ist das korrekt?");
    expect(send.disabled).toBe(true);

    boxes.slice(0, -1).forEach((b) => { b.checked = true; });
    boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
    expect(send.disabled).toBe(true); // one still open

    boxes.at(-1).checked = true;
    boxes.at(-1).dispatchEvent(new Event("change", { bubbles: true }));
    expect(send.disabled).toBe(false);
    send.click();
    await expect(result).resolves.toBe(true);
    expect(document.getElementById("hpConfirmOverlay")).toBeNull();
  });

  test("Zurück cancels the send", async () => {
    const result = confirmHauptpunkte({}, "bu");
    const back = [...document.querySelectorAll("#hpConfirmOverlay .ang-stage-btn")].find((b) => b.textContent === "Zurück");
    back.click();
    await expect(result).resolves.toBe(false);
  });

  test("'Zur Seite' cancels and opens that page", async () => {
    const result = confirmHauptpunkte({}, "bu");
    document.querySelector('#hpConfirmOverlay [data-page="Wandverkleidung"]').click();
    await expect(result).resolves.toBe(false);
    expect(location.hash).toBe("#Wandverkleidung");
  });
});
