// Step status in the step list (U-011 D2): derived from the offer, shown in the sidebar.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { shortReason } from "../src/features/offer/OfferShell.js";
import { useOfferStore } from "../src/features/offer/index.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const patch = (section: string, fields: Record<string, unknown>) => act(() => { (useOfferStore.getState().patch as any)(section, fields); });
const link = (label: RegExp) => within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name: label });
const state = (label: RegExp) => link(label).getAttribute("data-state");
async function open() {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/bu/Optional`);
  await screen.findByRole("navigation", { name: "Schritte" });
}

describe("step status", () => {
  it("done = has content; open = nothing yet; off = switched off (right label, not counted)", async () => {
    await open();
    patch("duschwanne", { trayEnabled: true, chosenTrayProductId: null });
    await waitFor(() => expect(state(/^Duschwanne/)).toBe("open"));
    patch("duschwanne", { chosenTrayProductId: "SLA123" });
    await waitFor(() => expect(state(/^Duschwanne/)).toBe("done"));
    expect(link(/^Duschwanne/)).toHaveAccessibleName("Duschwanne – erledigt");
    patch("duschwanne", { trayEnabled: false });
    await waitFor(() => expect(state(/^Duschwanne/)).toBe("off"));
    expect(link(/^Duschwanne/)).toHaveTextContent("nicht gewählt");
    expect(link(/^Duschwanne/)).toHaveAccessibleName("Duschwanne – nicht gewählt");
  });

  it("a step check that finds a problem → warning with its text under the step and in the name", async () => {
    await open();
    patch("duschwanne", { addFlooring: true });
    await waitFor(() => expect(state(/^Fußboden/)).toBe("warn"));
    const full = link(/^Fußboden/).getAttribute("aria-label")!.replace("Fußboden – ", "");
    expect(full.length).toBeGreaterThan(3);
    expect(link(/^Fußboden/)).toHaveTextContent(shortReason(full));
  });

  it("Optional: done with one pick; Wandverkleidung: off until switched on", async () => {
    await open();
    await waitFor(() => expect(state(/^Optionale Produkte/)).toBe("open"));
    expect(state(/^Wandverkleidung/)).toBe("off");
    patch("optional", { qty_ABC: "1" });
    await waitFor(() => expect(state(/^Optionale Produkte/)).toBe("done"));
  });

  it("Angebotscheck: red with the number of open rows", async () => {
    await open();
    await waitFor(() => expect(state(/^Angebotscheck/)).toBe("check"));
    expect(link(/^Angebotscheck/)).toHaveTextContent(/\d+ offen/);
  });

  it("progress counts done steps of the chosen ones (off and no-rule steps are left out)", async () => {
    await open();
    patch("duschwanne", { trayEnabled: false });
    patch("optional", { qty_ABC: "1" });
    const nav = screen.getByRole("navigation", { name: "Schritte" });
    await waitFor(() => expect(state(/^Optionale Produkte/)).toBe("done"));
    const kinds = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("data-state"));
    const text = within(nav).getByTestId("step-progress").textContent!;
    const [, d, t] = /(\d+) von (\d+) Schritten erledigt/.exec(text)!;
    expect(Number(d)).toBe(kinds.filter((k) => k === "done").length);
    expect(Number(t)).toBe(kinds.filter((k) => !["off", "none"].includes(k!)).length);
    expect(within(nav).getByRole("progressbar")).toHaveAttribute("aria-valuenow", d);
  });

  it("an old offer without switches: statuses come from what is stored", async () => {
    await open();
    patch("duschwanne", { trayEnabled: undefined, chosenTrayProductId: "SLA123" });
    patch("duschabtrennung", { configEnabled: undefined, configurator: { lines: [{ id: "x" }] } });
    await waitFor(() => expect(state(/^Duschwanne/)).toBe("done"));
    expect(state(/^Duschabtrennung/)).toBe("done");
    expect(state(/^Duschvorhang/)).toBe("off");
  });
  it("reason line shows the missing items only, in short form", () => {
    expect(shortReason("Bitte füllen Sie alle Pflichtfelder in „Fußboden\" aus: Fläche")).toBe("Fläche");
    expect(shortReason("Bitte prüfen Sie die rot markierten Pflichtfelder.")).not.toMatch(/^Bitte/);
    expect(shortReason("Bitte in „Kundendaten“ ausfüllen: Anrede, Genehmigung des Vermieters erforderlich?")).toBe("Anrede, Vermieter-Genehmigung");
  });
});
