// Stored Handlauf offers (anonymised, fixtures/hl-old-offers.json from the golden fixtures): both
// kinds — configurator offers and offers that hold data of the retired Handlauf page (owner decision
// U-011 C1, UX-CHANGES U-054) — open, show their values, send the stored offer as the price request
// and are stored unchanged while nothing is edited. An edit on "Handläufe" keeps the old-page rows.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { hasLegacyData, legacyRows } from "../src/features/steps/hl/rules.js";
import old from "./fixtures/hl-old-offers.json" with { type: "json" };
import konf from "./fixtures/hl-konfigurator.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type Payload = Record<string, any>;
const OFFERS = old.offers as Record<string, { payload: Payload }>;
function open(id: string, step: string) {
  const payload = structuredClone(OFFERS[id]!.payload);
  const server = fakeServer({ ...BASE, "GET /api/products?source=flexofit&limit=500": { body: konf.products },
    "GET /api/deals/*/draft": { body: { dealId: "4711", revision: 3, offerType: "hl", payload, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "ap@example.test" } } });
  renderApp(`/deal/4711/hl/${step}`);
  return { server, payload };
}
const offer = () => useOfferStore.getState().offer as Payload;
const saves = (server: ReturnType<typeof fakeServer>) => server.calls.filter((c) => c.key.startsWith("PUT ") || (c.key.startsWith("POST ") && c.key.includes("/draft")));

describe("stored Handlauf offers open as they are", () => {
  it.each(Object.keys(OFFERS))("%s: opened on Handläufe — unchanged, priced with the stored offer, nothing saved", async (id) => {
    const { server, payload } = open(id, "hlk");
    await screen.findByRole("heading", { name: "Handläufe", level: 2 });
    await waitFor(() => expect(server.count("POST /api/price")).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 400));
    expect(offer().hl).toEqual(payload.hl);
    const req = server.calls.filter((c) => c.key === "POST /api/price").at(-1)!.body as Payload;
    expect(req.hl).toEqual(payload.hl);
    expect(saves(server)).toEqual([]);
    // C1: the old page's entries are shown read-only exactly when the offer holds some
    expect(!!screen.queryByTestId("hl-legacy")).toBe(hasLegacyData(payload.hl));
    if (hasLegacyData(payload.hl)) expect(within(screen.getByTestId("hl-legacy")).queryAllByTestId("hl-legacy-row")).toHaveLength(legacyRows(payload.hl).length);
    const legacy = screen.queryByTestId("hl-legacy");
    if (legacy) expect([...within(legacy).queryAllByRole("textbox"), ...within(legacy).queryAllByRole("button")]).toEqual([]); // read-only
    // the configurations of a configurator offer come back with their names
    const state = (payload.hl.hlConfigurator?.state ?? []) as { name: string }[];
    for (const c of state) expect(within(screen.getByTestId("hl-rail")).getByText(c.name)).toBeTruthy();
  });

  it("an offer without workTasks shows the handrail task ticked (today's page default) and stores nothing by opening", async () => {
    const { payload } = open("offers-hl-KK-367e1d", "hlArbeiten");
    expect(payload.hl.workTasks).toBeUndefined();
    const box = (await screen.findByRole("checkbox", { name: "Liefern und Montieren der nachfolgend aufgeführten Handläufe" })) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect("workTasks" in offer().hl).toBe(false);
  });

  it("a configurator offer with old-page rows: an added fitting keeps the old rows first, unchanged, then the configurator rows", async () => {
    const { payload } = open("offers-hl-KK-e04d66", "hlk");
    await screen.findByRole("heading", { name: "Handläufe", level: 2 });
    await waitFor(() => expect(screen.queryByText("Produkte werden geladen …")).toBeNull());
    const user = userEvent.setup();
    const head = within(screen.getByTestId("hl-step-beschlaege")).getAllByRole("button")[0]!;
    if (head.getAttribute("aria-expanded") !== "true") await user.click(head);
    const free = screen.getAllByTestId("hl-fitting").find((b) => b.getAttribute("aria-pressed") === "false")!;
    await user.click(free);
    await waitFor(() => expect(offer().hl.hlConfigurator.lines.length).toBe(payload.hl.hlConfigurator.lines.length + 1));
    const kept = (payload.hl.quickAdd as Payload[]).filter((r) => r.kind !== "hl-config");
    expect((offer().hl.quickAdd as Payload[]).slice(0, kept.length)).toEqual(kept);
    expect((offer().hl.quickAdd as Payload[]).slice(kept.length).every((r) => r.kind === "hl-config")).toBe(true);
    // hl_area / area are not rebuilt by a fitting (only an area pick does that, as today)
    expect([offer().hl.hl_area, offer().hl.area]).toEqual([payload.hl.hl_area, payload.hl.area]);
  });
});
