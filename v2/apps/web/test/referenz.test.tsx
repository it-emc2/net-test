// Referenzbilder (Vorher / Nachher): display only — rules of today's referenzbilder.js, the
// two pages, the way back, and that nothing is stored in the offer (Light level, no recording).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { flowSteps, STEPS } from "../src/features/offer/index.js";
import { useOfferStore } from "../src/features/offer/index.js";
import { MANIFEST } from "../src/features/steps/referenz/manifest.js";
import { categories, emptyText, photoLabel, photoUrl, projectsOf, shownProjects, splitLabel, subline, validFilter, hasKind, type Project } from "../src/features/steps/referenz/rules.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const P = (projekt: string, kategorie: string, n: number): Project => ({ projekt, kategorie, kategorieLabel: kategorie.toUpperCase(), bilder: Array.from({ length: n }, (_, i) => ({ file: `${projekt} ä_${i}.jpg`, label: `${i + 1}. Schritt ${i + 1}` })) });

describe("rules", () => {
  const ps = [P("01", "a", 2), P("02", "b", 1), P("03", "a", 3)];
  it("categories count projects; a filter keeps its projects; an unknown filter means all", () => {
    expect(categories(ps).map((c) => [c.key, c.n])).toEqual([["a", 2], ["b", 1]]);
    expect(shownProjects(ps, "a").map((p) => p.projekt)).toEqual(["01", "03"]);
    expect(validFilter(ps, "zzz")).toBeNull();
    expect(validFilter(ps, "b")).toBe("b");
  });
  it("texts: sub line, numbered Vorher labels, alt text, empty text", () => {
    expect(subline("vorher", ps)).toBe("3 Projekte · 6 Fotos · Ablauf in Schritten");
    expect(subline("nachher", [ps[0]!])).toBe("1 Projekt · 2 Fotos");
    expect(splitLabel("vorher", "3. Unterbau")).toEqual({ num: "3", caption: "Unterbau" });
    expect(splitLabel("nachher", "Ansicht A")).toEqual({ num: null, caption: "Ansicht A" });
    expect(photoLabel(ps[0]!, ps[0]!.bilder[0]!)).toBe("Projekt 01 · A · 1. Schritt 1");
    expect(emptyText("Badumbau", "vorher")).toBe("Für Badumbau sind noch keine Vorher-Bilder hinterlegt.");
  });
  it("photo addresses: thumbnail or full, file name encoded", () => {
    expect(photoUrl("bu", "vorher", "01 ä.jpg", true)).toBe("/assets/referenz/bu/vorher/thumbs/01%20%C3%A4.jpg");
    expect(photoUrl("bwt", "nachher", "x.jpg", false)).toBe("/assets/referenz/bwt/nachher/x.jpg");
  });
  it("by offer type: Badumbau both pages, Badewannentür Nachher only, Handlauf none; steps outside the flow", () => {
    expect([hasKind(MANIFEST, "bu", "vorher"), hasKind(MANIFEST, "bu", "nachher"), hasKind(MANIFEST, "bwt", "vorher"), hasKind(MANIFEST, "bwt", "nachher"), hasKind(MANIFEST, "hl", "nachher")]).toEqual([true, true, false, true, false]);
    expect(STEPS.bu.slice(-2)).toEqual(["referenzVorher", "referenzNachher"]);
    expect(STEPS.bwt.at(-1)).toBe("referenzNachher");
    expect(flowSteps("bu").at(-1)).toBe("Checkliste");
    expect(flowSteps("bwt").at(-1)).toBe("Zusammenfassung");
    // every photo the index names exists as a file in today's folders (thumbnail and full)
    const dir = resolve(import.meta.dirname, "../../../../src/public");
    const missing = Object.keys(MANIFEST).flatMap((t) => (["vorher", "nachher"] as const).flatMap((k) => projectsOf(MANIFEST, t, k).flatMap((p) => p.bilder.flatMap((b) => [true, false].map((th) => photoUrl(t, k, b.file, th)).filter((u) => !existsSync(join(dir, decodeURIComponent(u))))))));
    expect(missing).toEqual([]);
  });
});

async function open(type: string, step: string) {
  fakeServer(BASE);
  const router = renderApp(`/deal/${KEY}/${type}/${step}`);
  await screen.findByTestId(`ref-${step === "referenzVorher" ? "vorher" : "nachher"}`);
  return router;
}

describe("the pages", () => {
  it("Badumbau Vorher: title, projects with numbered photos, lazy thumbnails with alt text, twin link", async () => {
    await open("bu", "referenzVorher");
    expect(screen.getByRole("heading", { name: /Vorher & Arbeitsschritte/ })).toBeInTheDocument();
    const want = projectsOf(MANIFEST, "bu", "vorher");
    expect(screen.getByTestId("ref-sub")).toHaveTextContent(subline("vorher", want));
    const imgs = within(screen.getByTestId("ref-vorher")).getAllByRole("img");
    expect(imgs.length).toBe(want.reduce((s, p) => s + p.bilder.length, 0));
    for (const i of imgs) { expect(i).toHaveAttribute("loading", "lazy"); expect(i.getAttribute("alt")).toMatch(/^Projekt \d+ · /); expect(i.getAttribute("src")).toMatch(/^\/assets\/referenz\/bu\/vorher\/thumbs\//); }
    expect(screen.getAllByTestId("ref-twin")[0]).toHaveTextContent("Ergebnis ansehen");
  });

  it("category chips filter, the chosen one is kept when the page is left and come back", async () => {
    const router = await open("bu", "referenzVorher");
    const user = userEvent.setup();
    const chip = (await screen.findAllByRole("button", { pressed: false })).find((b) => b.dataset.chip === "Badumbau")!;
    await user.click(chip);
    const shown = projectsOf(MANIFEST, "bu", "vorher").filter((p) => p.kategorie === "Badumbau");
    expect(screen.getByTestId("ref-sub")).toHaveTextContent(subline("vorher", shown));
    await router.navigate(`/deal/${KEY}/bu/Kundendaten`);
    await router.navigate(`/deal/${KEY}/bu/referenzVorher`);
    await screen.findByTestId("ref-vorher");
    expect(screen.getByTestId("ref-sub")).toHaveTextContent(subline("vorher", shown));
  });

  it("a photo opens in the shared large view (arrows, Esc), only the visible photos", async () => {
    await open("bu", "referenzVorher");
    const user = userEvent.setup();
    await user.click(document.querySelector<HTMLElement>('[data-photo="0"]')!);
    const box = await screen.findByTestId("ref-lightbox");
    expect(within(box).getByRole("img").getAttribute("src")).toMatch(/^\/assets\/referenz\/bu\/vorher\/[^/]+\.jpg$/); // full photo, not thumbs
    const first = within(box).getByRole("img").getAttribute("alt");
    await user.click(within(box).getByRole("button", { name: "Nächstes Bild" }));
    expect(within(box).getByRole("img").getAttribute("alt")).not.toBe(first);
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("ref-lightbox")).toBeNull());
  });

  it("the twin link jumps to the other page and its project; the switch goes back; Zurück zum Angebot leads to the first step after a reload", async () => {
    const router = await open("bu", "referenzVorher");
    const user = userEvent.setup();
    const proj = screen.getAllByTestId("ref-twin")[0]!.closest("article")!.getAttribute("data-projekt");
    await user.click(screen.getAllByTestId("ref-twin")[0]!);
    await screen.findByTestId("ref-nachher");
    expect(router.state.location.pathname).toBe(`/deal/${KEY}/bu/referenzNachher`);
    expect(document.querySelector(`[data-projekt="${proj}"]`)).not.toBeNull();
    await user.click(screen.getByRole("tab", { name: "Vorher" }));
    await screen.findByTestId("ref-vorher");
    await user.click(screen.getByTestId("ref-back"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${KEY}/bu/Kundendaten`));
  });

  it("Badewannentür: Nachher only — no switch to Vorher, photos of the offer type", async () => {
    await open("bwt", "referenzNachher");
    expect(screen.queryByRole("tablist", { name: "Bildart" })).toBeNull();
    expect(screen.getByTestId("ref-sub")).toHaveTextContent("2 Projekte · 4 Fotos");
    expect(screen.getAllByRole("img")[0]!.getAttribute("src")).toMatch(/^\/assets\/referenz\/bwt\/nachher\/thumbs\//);
  });

  it("outside Weiter / Zurück: the pages have neither, the bar counts only the flow, Checkliste is the last step to go on to", async () => {
    await open("bu", "referenzNachher");
    expect(screen.queryByRole("link", { name: /^(Weiter|Zurück) zu/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Schrittleiste" })).not.toHaveTextContent("Schritt ");
    expect(screen.getByRole("group", { name: "Schrittleiste" })).toHaveTextContent("Nachher");
  });

  it("nothing is stored: the offer is the same after looking at the photos", async () => {
    await open("bu", "referenzNachher");
    const offer = JSON.stringify(useOfferStore.getState().offer);
    await userEvent.setup().click(document.querySelector<HTMLElement>('[data-photo="0"]')!);
    expect(JSON.stringify(useOfferStore.getState().offer)).toBe(offer);
  });
});
