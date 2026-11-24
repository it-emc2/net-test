// Hauptmenü (Light slice): rules of „Öffnen“, today's appointments, device list.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { classifyOpen, draftState, shownDrafts, timeLabel, todaysAppointments } from "../src/features/home/rules.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const NOW = new Date(2026, 10, 16, 9, 0); // 16 Nov 2026
const planning = { futurePlanned: [
  { id: "b", name: "Spät", plannedDate: "2026-11-16", manualStartMinutes: 780, duration: 90 },
  { id: "a", name: "Früh", plannedDate: "2026-11-16", manualStartMinutes: 540, importDealId: 65462 },
  { id: "x", name: "Morgen", plannedDate: "2026-11-17", manualStartMinutes: 480 },
] };

describe("rules", () => {
  it("Öffnen: deal / offer / text", () => {
    expect(classifyOpen(" 65462 ").kind).toBe("deal");
    expect(classifyOpen("ang-2026").kind).toBe("offer");
    expect(classifyOpen("Müller Ulm").kind).toBe("text");
    expect(classifyOpen("  ").kind).toBe("");
  });
  it("appointments: today only, by start time; time label", () => {
    expect(todaysAppointments(planning, NOW).map((a) => a.id)).toEqual(["a", "b"]);
    expect(timeLabel({ manualStartMinutes: 540, duration: 90 })).toBe("09:00 · 90 Min");
    expect(timeLabel({})).toBe("Dauer offen");
  });
  it("device list: pending first, 3 transferred, max 8", () => {
    const rows = [...Array(5).keys()].map((i) => ({ key: String(i + 1) })).concat([{ key: "9", dirty: true } as never]);
    expect(shownDrafts(rows).map((r) => r.key)).toEqual(["9", "1", "2", "3"]);
    expect(draftState({ key: "1", conflict: true })).toBe("⚠ an anderer Stelle geändert");
  });
});

describe("Hauptmenü", () => {
  it("shows today's appointments first; „Öffnen“ with a deal opens its draft's offer type", async () => {
    const day = new Date().toLocaleDateString("sv-SE");
    const srv = fakeServer({
      ...BASE,
      "GET /api/planning/v2/today": { body: { ok: true, plan: { date: day, termine: [{ order: 1, id: "a", status: "planned", name: "Früh", start: "09:00", end: "10:00", durationMinutes: 60, dealId: "65462" }] } } },
      "GET /api/deals/65462/draft": { body: { dealId: "65462", offerType: "bwt", payload: { activeOffer: "bwt" }, revision: 1, updatedAt: "2026-11-16T08:00:00Z" } },
    });
    const router = renderApp("/");
    const card = await screen.findByTestId("home-appointments");
    await waitFor(() => expect(card).toHaveTextContent("Früh"));
    expect(card).toHaveTextContent("09:00");
    await userEvent.type(screen.getByLabelText("Öffnen"), "65462");
    expect(screen.getByText("Eingabetaste öffnet Deal 65462")).toBeInTheDocument();
    expect(srv.count("POST /api/price")).toBe(0); // the Hauptmenü itself asks for no price
    await userEvent.click(screen.getByRole("button", { name: "Deal 65462 öffnen" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/deal/65462/bwt"));
  });
  it("deal without a draft: message, tiles start its offer; text searches the stored drafts and offers (home-entwurf.test)", async () => {
    const srv = fakeServer({ ...BASE, "GET /api/planning/v2/today": { body: { ok: true, plan: null } }, "GET /api/offers/v2/search*": { body: { rows: [] } }, "GET /api/offers/v2/by-deal/777": { body: { rows: [] } } });
    renderApp("/");
    await screen.findByText("Keine Planungstermine für heute gefunden");
    await userEvent.type(screen.getByLabelText("Öffnen"), "777{Enter}");
    await screen.findByText(/Für Auftrag 777 gibt es noch kein Angebot/);
    expect(screen.getByRole("link", { name: /Badumbau/ })).toHaveAttribute("href", "/deal/777/bu");
    await userEvent.clear(screen.getByLabelText("Öffnen"));
    await userEvent.type(screen.getByLabelText("Öffnen"), "Müller");
    await screen.findByText("Keine Treffer in Entwürfen oder Angeboten.");
    expect(srv.calls.filter((c) => c.key.startsWith("GET /api/offers/v2/search")).at(-1)!.key).toBe("GET /api/offers/v2/search?q=M%C3%BCller&limit=20");
  });
});
