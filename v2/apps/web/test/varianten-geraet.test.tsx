// Variants (ADR 027 A, step 2): „Auf diesem Gerät gespeichert“ names the variant when a deal has
// more than one. The device copies are written by today's UI (IndexedDB) — stubbed here.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BASE, fakeServer, renderApp } from "./helpers.js";

vi.mock("../src/features/home/device.js", () => ({
  deviceDrafts: async () => [{ key: "4711", offerType: "bu", title: "Muster", localAt: 1, dirty: false }, { key: "4712", offerType: "bu", title: "Beispiel", localAt: 2, dirty: false }],
  removeDeviceDraft: async () => undefined,
}));

const row = (variantId: string, name: string, isDefault = false) => ({ variantId, name, offerType: "bu", offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null, revision: 1, updatedAt: "2026-11-19T10:00:00Z", notChosenAt: null, isDefault });

describe("device list", () => {
  it("names the variant (the one today's UI edits: opened last) only for a deal with several", async () => {
    fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } },
      "GET /api/deals/4711/variants": { body: { dealId: "4711", defaultVariantId: "v-0123456789ab", variants: [row("v1", "Variante 1"), row("v-0123456789ab", "Günstig", true)] } },
      "GET /api/deals/4712/variants": { body: { dealId: "4712", defaultVariantId: "v1", variants: [row("v1", "Variante 1", true)] } } });
    renderApp("/");
    await waitFor(() => expect(screen.getAllByTestId("device-draft")[0]).toHaveTextContent("Deal 4711 · Variante „Günstig“"));
    expect(screen.getAllByTestId("device-draft")[1]).not.toHaveTextContent("Variante");
  });
});
