// Badewannentür (slice 1) must store and show what today's UI does for the same inputs.
// Reference: fixtures/bwt-tuer.json, recorded from today's UI by v2/scripts/capture-bwt-tuer.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { readFileSync } from "node:fs";
import { DOORS, GRIPS, dimField, doorFill, doorInfo } from "../src/features/steps/bwt/rules.js";
import reference from "./fixtures/bwt-tuer.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const door = (key: string) => DOORS.find((d) => d.key === key)!;
const cardOf = (key: string) => screen.getAllByTestId("bwt-door").find((c) => c.dataset.key === key)!;
/** the panel of the chosen door (nothing for a door that is off) */
const panelOf = (key: string) => screen.queryAllByTestId("bwt-door-panel").find((c) => c.dataset.key === key) ?? null;
const DIM_NAME: Record<string, string> = { Height: "Höhe", Width: "Breite", StdWidth: "Standardbreite", DepthTop: "Tiefe O", DepthBottom: "Tiefe U" };
const COLOR_LABEL: Record<string, string> = { weiß: "Weiß", silber: "Silber", Beige: "Bahama Beige", Manhattan: "Manhattan" };
const MATERIAL_LABEL: Record<string, string> = { "Weiß ich nicht": "Nicht bekannt" };
const UMBAU_LABEL: Record<string, string> = { flat_surface: "Fläche ist gerade und eben im Bereich der BWT", fixture_free: "Fläche ist frei von Armaturen", not_whirlpool: "Ist kein Whirlpool" };

async function open() {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/bwt/bwt`);
  await screen.findByRole("heading", { name: "Badewanne — Bestandsaufnahme" });
  return structuredClone(offer());
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c] of steps) {
    if (kind === "shape") await user.click(screen.getByRole("radio", { name: a as string }));
    else if (kind === "umbau") await user.click(screen.getByRole("checkbox", { name: UMBAU_LABEL[a as string]! }));
    else if (kind === "material") await user.click(screen.getByRole("radio", { name: MATERIAL_LABEL[a as string] ?? (a as string) }));
    else if (kind === "door") await user.click(within(cardOf(a as string)).getByRole("checkbox"));
    else if (kind === "qty") fireEvent.change(within(panelOf(a as string)!).getByLabelText("Menge"), { target: { value: b } });
    else if (kind === "color") {
      const panel = within(panelOf(a as string)!);
      if (a === "glas") fireEvent.change(panel.getByLabelText("Rahmen-Farbe"), { target: { value: b } });
      else await user.click(panel.getByRole("radio", { name: COLOR_LABEL[b as string]! }));
    }
    else if (kind === "dim") {
      // the sizes are only on the page while their door is picked: for a door that is off, the stored field is set as the page would have
      const panel = panelOf(a as string), chip = b === "StdWidth";
      const input = panel && !chip ? within(panel).queryByLabelText(`${DIM_NAME[b as string]} ${door(a as string).value}`) : null;
      if (input) fireEvent.change(input, { target: { value: c } });
      else if (panel && chip && c) await user.click(within(panel).getByRole("button", { name: c as string }));
      else useOfferStore.getState().patch("bwt" as never, { [dimField(door(a as string), b as string)]: c } as never);
    }
    else if (kind === "anschlag") await user.click(screen.getByRole("radio", { name: a === "Links" ? "← Links" : "Rechts →" }));
    else if (kind === "grip") await user.click(screen.getByRole("checkbox", { name: `Haltegriff ${a} cm` }));
    else if (kind === "gripqty") fireEvent.change(screen.getByLabelText(`Menge Haltegriff ${a} cm`), { target: { value: b } });
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
const checked = (name: string) => (document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? "";

describe("Badewannentür (slice 1) stores and shows what today's UI does", () => {
  it("a new offer starts with today's fields", async () => {
    const base = await open();
    expect(base.bwt).toEqual(reference.base);
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as (string | number)[][]);
    await waitFor(() => expect(changed(base.bwt, offer().bwt)).toEqual(scenario.bwt));
    const el = (scenario as { elsewhere?: Record<string, unknown> }).elsewhere ?? {};
    expect(Object.fromEntries(Object.keys(base).filter((k) => k !== "bwt" && !same(base[k], offer()[k])).map((k) => [k, changed(base[k] as never, offer()[k])]))).toEqual(el); // and nothing else changes

    const v = scenario.view as { shape: string; umbau: string[]; material: string; anschlag: string; steelNote: boolean;
      doors: { key: string; on: boolean; qty: string | null; color: string | null; dims: Record<string, string> }[]; grips: { n: number; on: boolean; qty: string | null }[] };
    expect(checked("bwtShape")).toBe(v.shape);
    expect(Object.keys(UMBAU_LABEL).filter((k) => (screen.getByRole("checkbox", { name: UMBAU_LABEL[k]! }) as HTMLInputElement).checked)).toEqual(v.umbau);
    expect(checked("bwtMaterial")).toBe(v.material);
    expect(checked("bwtAnschlag")).toBe(v.anschlag);
    expect(offer().bwt.bwtSteelNoteEnabled === "on").toBe(v.steelNote);
    expect(v.doors.map((x) => door(x.key)).map((d) => {
      const on = (within(cardOf(d.key)).getByRole("checkbox") as HTMLInputElement).checked, panel = panelOf(d.key), card = panel ? within(panel) : null;
      const qty = card?.queryByLabelText("Menge") as HTMLInputElement | null;
      const color = !card ? undefined : d.colorKind === "text" ? (card.getByLabelText("Rahmen-Farbe") as HTMLInputElement).value
        : card.queryAllByRole("radio").find((r) => r.getAttribute("aria-checked") === "true")?.textContent;
      const dims = !card ? {} : Object.fromEntries(Object.keys(DIM_NAME).flatMap((f) => {
        if (f === "StdWidth") return d.dims ? [[f, card.queryAllByRole("button", { pressed: true }).map((x) => x.textContent)[0] ?? ""]] : [];
        const i = card.queryByLabelText(`${DIM_NAME[f]} ${d.value}`) as HTMLInputElement | null; return i ? [[f, i.value]] : [];
      }));
      const key = Object.entries(COLOR_LABEL).find(([, l]) => l === color)?.[0] ?? color;
      return { key: d.key, on, qty: on ? qty!.value : null, color: on ? key! : null, dims };
    })).toEqual(v.doors.map((x) => (x.on ? x : { ...x, dims: {} }))); // sizes of a door that is off are not on the page (UX-CHANGES U-028)
    expect(GRIPS.map((g) => { const cb = screen.getByRole("checkbox", { name: g.label }) as HTMLInputElement; return { n: g.n, on: cb.checked, qty: cb.checked ? (screen.getByLabelText(`Menge ${g.label}`) as HTMLInputElement).value : null }; })).toEqual(v.grips);
  });

  it("the document lines of the picked door follow the stored fields", () => {
    for (const s of reference.scenarios) expect(doorInfo({ ...reference.base, ...(s.bwt as Record<string, unknown>) })).toEqual({ ...reference.base, ...(s.bwt as Record<string, any>) }.doorInfoById);
  });

  it("Weiter needs the tub shape; the page says what is missing and marks the fields (UX-CHANGES U-031)", async () => {
    await open();
    expect(screen.queryByTestId("bwt-missing")).toBeNull();
    await userEvent.setup().click(screen.getAllByRole("link", { name: /^Weiter zu/ })[0]!);
    expect((await screen.findByTestId("bwt-missing")).textContent).toBe("Bitte wählen Sie noch: Wannenform");
    expect(screen.getByRole("radio", { name: "Normal, rechteckig" }).getAttribute("aria-invalid")).toBe("true");
    await userEvent.setup().click(screen.getByRole("radio", { name: "Normal, rechteckig" }));
    await waitFor(() => expect(screen.queryByTestId("bwt-missing")).toBeNull());
    const door = (await within(cardOf("std")).findByRole("checkbox")) as HTMLInputElement;
    await userEvent.setup().click(door); // the door is picked by default: off → missing
    await userEvent.setup().click(screen.getAllByRole("link", { name: /^Weiter zu/ })[0]!);
    expect((await screen.findByTestId("bwt-missing")).textContent).toBe("Bitte wählen Sie noch: Tür");
    expect(door.getAttribute("aria-invalid")).toBe("true");
  });

  it("the door panel: one panel for the chosen door, quantity stepper (min 1), Standardbreite as chips (UX-CHANGES U-034)", async () => {
    await open();
    const user = userEvent.setup();
    expect(screen.getAllByTestId("bwt-door")).toHaveLength(5);
    expect(screen.getAllByTestId("bwt-door-panel")).toHaveLength(1);
    const panel = within(screen.getByTestId("bwt-door-panel"));
    await user.click(panel.getByRole("button", { name: "Menge erhöhen" }));
    expect(offer().bwt.bwtDoorStdQty).toBe("2");
    await user.click(panel.getByRole("button", { name: "Menge verringern" }));
    await user.click(panel.getByRole("button", { name: "Menge verringern" }));
    expect(offer().bwt.bwtDoorStdQty).toBe("1"); // never below 1
    await user.click(within(cardOf("wien")).getByRole("checkbox"));
    const wien = within(screen.getByTestId("bwt-door-panel"));
    expect(screen.getAllByTestId("bwt-door-panel")).toHaveLength(1);
    await user.click(wien.getByRole("button", { name: "45,5 cm" }));
    expect(offer().bwt.bwtDoorIndWienStdWidth).toBe("45,5 cm");
    await user.click(wien.getByRole("button", { name: "45,5 cm" }));
    expect(offer().bwt.bwtDoorIndWienStdWidth).toBe("");
    expect(wien.getByRole("radiogroup", { name: "Farbe" })).toBeTruthy();
  });

  it("Türanschlag drawing: hinge and outward swing on the chosen side, in the door's colour (UX-CHANGES U-035)", async () => {
    await open();
    const user = userEvent.setup(), svg = () => screen.getByTestId("anschlag-drawing");
    expect(svg().getAttribute("role")).toBe("img");
    expect(svg().querySelector("title")!.textContent).toBe("Türanschlag");
    expect(svg().querySelector('[data-part="hinge"]')).toBeNull(); // nothing chosen: no hinge, no swing
    expect(svg().querySelector('[data-part="arc"]')).toBeNull();
    await user.click(screen.getByRole("radio", { name: "← Links" }));
    expect(svg().getAttribute("data-side")).toBe("Links");
    expect(svg().querySelector('[data-part="hinge"]')!.getAttribute("cx")).toBe("80");
    expect(svg().querySelector('[data-part="arc"]')!.getAttribute("d")).toBe("M80 90 A60 60 0 0 0 140 30"); // inside the tub, starting at the hinge
    expect((svg().querySelector('[data-part="door"]') as SVGGElement).style.getPropertyValue("--bwt-open")).toBe("90deg");
    await user.click(screen.getByRole("radio", { name: "Rechts →" }));
    expect(svg().querySelector('[data-part="hinge"]')!.getAttribute("cx")).toBe("160");
    expect(svg().querySelector('[data-part="arc"]')!.getAttribute("d")).toBe("M160 90 A60 60 0 0 1 100 30");
    expect((svg().querySelector('[data-part="door"]') as SVGGElement).style.getPropertyValue("--bwt-open")).toBe("-90deg");
    for (const side of ["Links", "Rechts"]) { // the arc starts at the hinge, inside the tub (above the front side)
      await user.click(screen.getByRole("radio", { name: side === "Links" ? "← Links" : "Rechts →" }));
      const start = svg().querySelector('[data-part="arc"]')!.getAttribute("d")!.match(/^M(\d+) (\d+)/)!;
      expect([start[1], Number(start[2]) <= 90]).toEqual([svg().querySelector('[data-part="hinge"]')!.getAttribute("cx"), true]);
    }
    expect(offer().bwt.bwtAnschlag).toBe("Rechts");
    expect(svg().getAttribute("data-fill")).toBe("#fffdfa"); // Standard door, Weiß
    await user.click(within(screen.getByTestId("bwt-door-panel")).getByRole("radio", { name: "Manhattan" }));
    expect(svg().getAttribute("data-fill")).toBe("#D1D0CC");
  });

  it("door colour names: known names get their colour, free text and no door a neutral grey", () => {
    const wien = { bwtDoorType: "Individual Tür - Wien", bwtDoorIndWienColor: "silber" }, glas = { bwtDoorType: "Individual Tür - Wien Glas" };
    expect([doorFill(wien), doorFill({ ...glas, bwtDoorIndWienGlasFrameColor: "RAL 9005 Schwarz" }), doorFill({ ...glas, bwtDoorIndWienGlasFrameColor: "Anthrazit" }), doorFill({ ...glas, bwtDoorIndWienGlasFrameColor: "RAL 1234" }), doorFill({})])
      .toEqual(["#c0c4c8", "#1f2937", "#374151", "#9ca3af", "#9ca3af"]);
  });

  it("the swing only runs when motion is allowed; with reduced motion the door is drawn open", () => {
    const css = readFileSync(`${process.cwd().replace(/\/apps\/web$/, "")}/apps/web/src/styles.css`, "utf8");
    expect(css).toMatch(/\.bwt-door-swing \{[^}]*transform: rotate\(var\(--bwt-open\)\)/); // the default (reduced motion): open, still
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{ \.bwt-door-swing \{[^}]*animation: bwt-door-swing 3\.2s/);
  });

  it("each grab bar option has its picture", async () => {
    await open();
    const imgs = screen.getAllByTestId("bwt-grip").map((g) => g.querySelector('img[data-part="grip-image"]') as HTMLImageElement);
    expect(imgs).toHaveLength(4);
    expect(imgs.every((i) => i.getAttribute("src") === "/assets/5b817c33100c0121ede70f11e341601c.jpg")).toBe(true);
  });
});
