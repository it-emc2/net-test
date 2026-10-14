/**
 * Badolux model for "Duschabtrennung (neu)", run through the real engine.
 * Flow and product sets follow cleverbad.de/konfigurator (docs/research-cleverbad-badolux.md §10).
 */
import { readFileSync } from "node:fs";
import * as w from "../../src/public/configurator/engine.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../../src/public/configurator/${f}`, import.meta.url), "utf8"));
const model = load("badolux-model.json");
const v1 = load("badolux-model-v1.json");

// Click through like the UI: apply + settle (auto-applies single-option steps).
const pick = (state, id, value) => w.settle(model, w.applySelection(model, state, id, value));
const start = () => w.settle(model, w.initialState());

describe("Badolux Duschabtrennung model", () => {
  test("Ecke → two Lissabon folding doors (door type and identity auto-applied)", () => {
    let s = pick(start(), "Einbausituation", "ecke");
    expect(s.selections.Tuer).toBe("falt_eck");
    expect(w.currentStep(model, s).phase).toBe("component");
    s = w.setComponentSize(s, "TuerVorn", "90 cm", "");
    s = w.setComponentSize(s, "TuerSeite", "80 cm", "");
    const r = w.resolveConfiguration(model, s);
    expect(r.lines.map((l) => [l.article.articleNumber, l.article.net])).toEqual([
      ["PRI80DK19", 242.06],
      ["PRI80DK18", 229.32],
    ]);
    expect(r.lines[0].article.displayName).toBe("Falttür Lissabon (vorn) 90 cm");
  });

  test("Nische Falttür: 140 cm is Rom, 171 cm is Stockholm; side + default finish on the line", () => {
    let s = pick(pick(pick(start(), "Einbausituation", "nische"), "Tuer", "falt"), "Anschlag", "falt_links");
    const rom = w.resolveConfiguration(model, w.setComponentSize(s, "Tuer", "140 cm · Rom mit Festteil", ""));
    expect(rom.lines[0].article).toMatchObject({ articleNumber: "PRI80DK22", net: 338.52 });
    expect(rom.lines[0].article.finishText).toBe("Anschlag links · ESG Klarglas 8 mm, EasyClean · Höhe 195 cm · Profil Chrom");
    const sto = w.resolveConfiguration(model, w.setComponentSize(s, "Tuer", "171 cm · Stockholm mit Festteil", ""));
    expect(sto.lines[0].article).toMatchObject({ articleNumber: "PRI80DK09", displayName: "Falttür mit Festteil Stockholm 171 cm" });
    expect(sto.lines[0].article.finishText).toMatch(/6 mm/);
  });

  test("Pendeltür → Festglas + Pendeltür 40 (the 40 is the only size)", () => {
    const s = pick(pick(pick(start(), "Einbausituation", "nische"), "Tuer", "pendel"), "Anschlag", "pendel_rechts");
    const leaf = w.resolvedLeaf(model, s);
    expect(leaf.components.map((c) => c.key)).toEqual(["Festglas", "Pendeltuer"]);
    let t = w.setComponentSize(s, "Festglas", "80 cm (Front 120 cm)", "");
    t = w.setComponentSize(t, "Pendeltuer", "40 cm", "");
    const r = w.resolveConfiguration(model, t);
    expect(r.lines.map((l) => l.article.articleNumber)).toEqual(["PRI80DK15", "PRI80DK12"]);
    expect(r.net).toBeCloseTo(192.92 + 101.92, 2);
  });

  test("Walk-In skips the door step", () => {
    let s = pick(start(), "Einbausituation", "walkin");
    expect(w.currentStep(model, s)).toMatchObject({ phase: "structure", paramId: "Anschlag" });
    s = w.setComponentSize(pick(s, "Anschlag", "walkin_links"), "Festglas", "120 cm", "");
    expect(w.resolveConfiguration(model, s).lines[0].article.articleNumber).toBe("PRI80DK17");
  });

  test("every article has a local photo and a shop product with gallery + description", () => {
    for (const l of model.leaves)
      for (const c of l.components)
        for (const a of c.articles) {
          expect(a.image).toMatch(/^\/assets\/badolux\/da\/.+\.webp$/);
          expect(model.products[a.product].gallery.length).toBeGreaterThan(0);
          expect(model.products[a.product].description.length).toBeGreaterThan(0);
        }
  });

  test("the old one-step model still resolves a saved state (reopen fallback)", () => {
    const old = { selections: { Produkt: "003_Falttur_Lissabon" }, sizes: { Glas: { width: "90 cm", height: "" } } };
    expect(w.resolveConfiguration(v1, old).net).toBe(242.06);
  });
});
