// ChoiceTiles (shared/ui/choice-tiles.tsx): one answer of a few as picture tiles — a radiogroup of
// native radio buttons, the full text as each tile's name. And the two places that use it store the
// same values as the radio pills did before (Umbauart, Wandverkleidung „Ausführung“).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { KIND_TILES as UMBAU_TILES } from "../src/features/steps/arbeiten/KindTiles.js";
import { KINDS as UMBAU_KINDS } from "../src/features/steps/arbeiten/rules.js";
import { KIND_TILES as WALL_TILES } from "../src/features/steps/wandverkleidung/KindSketch.js";
import { KINDS as WALL_KINDS } from "../src/features/steps/wandverkleidung/rules.js";
import { ChoiceTiles } from "../src/shared/ui/choice-tiles.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const OPTIONS = [
  { value: "a", label: "Kurz A", name: "Die lange Antwort A", picture: <svg data-testid="pic-a" /> },
  { value: "b", label: "Kurz B", sublabel: "zweite Zeile" },
  { value: "c", label: "Kurz C" },
];

function Harness({ start, seen }: { start?: string; seen: string[] }) {
  const [v, setV] = useState(start);
  return <ChoiceTiles legend="Welche?" name="t" options={OPTIONS} value={v} onChange={(x) => { seen.push(x); setV(x); }} />;
}

describe("ChoiceTiles", () => {
  it("is a radiogroup named by its legend; each tile a radio named by its full text", () => {
    render(<Harness seen={[]} />);
    const group = screen.getByRole("radiogroup", { name: "Welche?" });
    expect([...group.querySelectorAll("input")].map((i) => i.value)).toEqual(["a", "b", "c"]);
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Die lange Antwort A", "Kurz B", "Kurz C"]);
    expect(screen.getByRole("radio", { name: "Die lange Antwort A" })).not.toBeChecked();
    expect(screen.getByText("Kurz A").closest("label")).toHaveAttribute("title", "Die lange Antwort A");
    expect(screen.getByText("zweite Zeile")).toBeInTheDocument();
    expect(screen.getByTestId("pic-a").closest("[aria-hidden]")).not.toBeNull(); // the picture is decoration
  });

  it("a tap chooses: checked, framed, with the tick badge — only one at a time", async () => {
    const seen: string[] = [];
    const { container } = render(<Harness seen={seen} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Kurz B"));
    expect(seen).toEqual(["b"]);
    expect(screen.getByRole("radio", { name: "Kurz B" })).toBeChecked();
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    expect(container.querySelectorAll('[data-part="check"]')).toHaveLength(1);
    expect(screen.getByText("Kurz B").closest("label")!.className).toContain("border-primary");
    expect(screen.getByText("Kurz C").closest("label")!.className).not.toContain("border-primary");
  });

  it("the keyboard: arrow keys move and choose, space chooses the focused tile", async () => {
    const seen: string[] = [];
    render(<Harness start="a" seen={seen} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Die lange Antwort A" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Kurz B" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Kurz B" })).toBeChecked();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Die lange Antwort A" })).toBeChecked();
    expect(seen).toEqual(["b", "a"]);
  });

  it("space chooses a focused tile that is not chosen yet", async () => {
    const seen: string[] = [];
    render(<Harness seen={seen} />);
    const user = userEvent.setup();
    await user.tab(); // nothing chosen: the first tile takes the focus
    await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "Die lange Antwort A" })).toBeChecked();
    expect(seen).toEqual(["a"]);
  });
});

describe("the tiles keep the values and full texts of the answers", () => {
  it("Umbauart: same values, the full text as the name, a short label on the tile", () => {
    expect(UMBAU_TILES.map((t) => [t.value, t.name])).toEqual(UMBAU_KINDS.map((k) => [k.value, k.label]));
    expect(UMBAU_TILES.map((t) => t.label)).toEqual(["Wanne → Dusche", "Dusche → Dusche", "Wanne → Wanne", "Dusche → Wanne", "Ohne Rückbau"]);
  });
  it("Wandverkleidung: same values, the full text as the name, a short label on the tile", () => {
    expect(WALL_TILES.map((t) => [t.value, t.name])).toEqual(WALL_KINDS.map((k) => [k.value, k.label]));
    expect(WALL_TILES.map((t) => t.label)).toEqual(["Fehlstellen", "Duschbereich deckenhoch", "Fliesenspiegel", "Kabine innen", "Alle Wände"]);
  });

  it.each(UMBAU_KINDS.map((k) => [k.label, k.value] as const))("Arbeiten: „%s“ stores umbauart %s", async (label, value) => {
    fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
    renderApp(`/deal/${KEY}/bu/Arbeiten`);
    await screen.findByRole("heading", { name: "Auszuführende Arbeiten" });
    await userEvent.setup().click(screen.getByRole("radio", { name: label }));
    expect(offer().duschwanne.umbauart).toBe(value);
    expect(screen.getByRole("radio", { name: label })).toBeChecked();
  });

  it.each(WALL_KINDS.map((k) => [k.label, k.value] as const))("Wandverkleidung: „%s“ stores wvKind %s", async (label, value) => {
    fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
    renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
    await screen.findByRole("heading", { name: "Wandverkleidung" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    await user.click(await screen.findByRole("radio", { name: label }));
    expect(offer().wandverkleidung.wvKind).toBe(value);
    expect(screen.getByRole("radiogroup", { name: "Welche Wände werden verkleidet?" }).querySelector("input:checked")).toHaveAttribute("value", value);
  });
});
