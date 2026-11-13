// Arbeitszeit must store and show what today's UI stores and shows for the same inputs.
// Reference: fixtures/arbeitszeit.json, recorded from today's UI by v2/scripts/capture-arbeitszeit.cjs.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { addMinutes, derived, leaveDuration, typeDuration, zoneOf } from "../src/features/steps/arbeitszeit/rules.js";
import reference from "./fixtures/arbeitszeit.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const FIELD: Record<string, string> = {
  distanceKm: "Wie viele Kilometer ist der Kunde von uns entfernt?", uebernachten: "Übernachten (Tage ohne Rückfahrt)",
  laborHours: "Dauer vor Ort (HH:MM)", travelTime: "Reisezeit, nur Hin-Fahrt (HH:MM)", travelSecondWorkerRate: "2. Mitarbeiter bei Reisezeit",
};
/** today's selector of a button → the name of the same button on the React page */
function buttonName(selector: string): string | RegExp {
  const helper = /^#(laborHours|travelTime)Helper \[data-delta="(-?\d+)"\]$/.exec(selector);
  if (helper) return `${FIELD[helper[1]!]} ${Number(helper[2]) > 0 ? "plus" : "minus"} ${Math.abs(Number(helper[2]))} Minuten`;
  const zone = /data-zone-min="(\d+)"/.exec(selector);
  if (zone) return new RegExp(`^Zone ${Number(zone[1]) / 10} ·`);
  const remove = /nth-child\((\d+)\) \.bwt-az-remove/.exec(selector);
  if (remove) return `Extra-Arbeitszeit ${remove[1]} entfernen`;
  if (selector === ".bwt-az-add") return "Extra-Arbeitszeit hinzufügen";
  if (selector === "#btnRoutingSuggest") return "Strecke aus Adresse vorschlagen";
  throw new Error(`button not handled: ${selector}`);
}
const input = (label: string) => screen.getByLabelText(label, { exact: true }) as HTMLInputElement;

async function open(type: string, payer?: string) {
  const server = fakeServer({ ...BASE, "POST /api/routing/suggest-distance": { body: reference.route } });
  const router = renderApp(`/deal/${KEY}/${type}/Arbeitszeit`);
  await screen.findByRole("heading", { name: "Anfahrt" });
  if (payer) useOfferStore.getState().patch("Kundendaten" as never, { payer } as never);
  return { router, server };
}
async function play(steps: string[][]) {
  const user = userEvent.setup();
  for (const [kind, target, value = ""] of steps as [string, string, string?][]) {
    if (kind === "set") useOfferStore.getState().patch("Kundendaten" as never, { [target]: value } as never);
    else if (kind === "click") await user.click(screen.getByRole("button", { name: buttonName(target) }));
    else if (kind === "select") await user.selectOptions(input(FIELD[target]!), value);
    else {
      const row = /nth-child\((\d+)\)/.exec(target)?.[1];
      const el = kind === "css" ? input(`${target.includes("duration") ? "Dauer" : "Aufgabe"} ${row}`) : input(FIELD[target]!);
      if (el.type === "number") { fireEvent.change(el, { target: { value } }); fireEvent.blur(el); }
      else { await user.clear(el); if (value) await user.type(el, value); await user.tab(); }
    }
  }
  if (steps.some(([, t]) => t === "#btnRoutingSuggest")) await waitFor(() => expect(screen.getByTestId("az-routing").textContent).not.toMatch(/^Berechne/));
}
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
// the React page writes the umlauts and signs today's page spells out
const asOnPage = (s: string) => s.replace("Rueckfahrt x", "Rückfahrt ×").replace("- Uebernachten", "− Übernachten");
const valueOf = (label: string) => (screen.queryByLabelText(label, { exact: true }) as HTMLInputElement | null)?.value ?? null;

describe("Arbeitszeit stores and shows what today's UI does, every offer type", () => {
  it.each(reference.scenarios.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, scenario) => {
    const { router } = await open(scenario.type, (scenario as { payer?: string }).payer);
    await play(scenario.steps);
    expect(offer().Arbeitszeit).toEqual(scenario.arbeitszeit);

    const v = scenario.view;
    expect(Object.fromEntries(Object.keys(v.fields).map((id) => [id, valueOf(FIELD[id]!)]))).toEqual(v.fields);
    expect(screen.queryByTestId("az-total")?.textContent ?? null).toBe(v.total);
    expect(screen.getByTestId("az-roundtrip").textContent).toBe(asOnPage(v.roundTrip));
    expect(screen.getByTestId("az-traveldays").textContent).toBe(asOnPage(v.travelDays));
    expect(squeeze(screen.queryByTestId("az-routing")?.textContent)).toBe(squeeze(v.routing));
    expect(screen.queryByTestId("az-zone")?.textContent ?? null).toBe(v.zone);
    expect(!!screen.queryByRole("group", { name: "Reisezone manuell wählen" })).toBe(v.zoneButtons);
    expect(screen.queryAllByRole("button", { pressed: true }).map((b) => String(Number(/^Zone (\d)/.exec(b.textContent ?? "")?.[1]) * 10))).toEqual(v.zonePressed);
    const rows = screen.queryAllByLabelText(/^Dauer \d+$/).map((d, i) => [(d as HTMLInputElement).value, input(`Aufgabe ${i + 1}`).value]);
    expect(screen.queryByRole("heading", { name: "Extra Arbeitszeit" }) ? rows : null).toEqual(v.extraRows);

    // "Weiter": goes on only with distance, time on site and travel time
    await userEvent.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    await waitFor(() => expect(router.state.location.pathname.split("/")[4]).toBe(scenario.next));
    if (scenario.next === "Arbeitszeit") expect(await screen.findByText(/^Bitte in „Arbeitszeit“ ausfüllen: /)).toBeInTheDocument();
  });
});

describe("Arbeitszeit — rules", () => {
  it("durations: digits become H:MM while typing, and are completed when the field is left", () => {
    expect(["7", "73", "730", "0730", "1200", "199", ""].map(typeDuration)).toEqual(["7:", "73:", "7:30", "7:30", "12:00", "1:59", ""]);
    expect(["7", "7:", "7:5", "07:30", "x"].map(leaveDuration)).toEqual(["7:00", "7:00", "7:05", "7:30", "x"]);
    expect([addMinutes("07:00", 15), addMinutes("", -5), addMinutes("0:10", -15)]).toEqual(["7:15", "0:00", "0:00"]);
  });

  it("a duration can be deleted character by character", async () => {
    await open("bu");
    const field = input(FIELD.travelTime!);
    await userEvent.type(field, "130");
    expect(field.value).toBe("1:30");
    await userEvent.type(field, "{Backspace}{Backspace}{Backspace}{Backspace}");
    expect(field.value).toBe("");
  });

  it("Alltagshilfe: zone from the travel time; the nearby postcodes count as zone 1 up to 15 minutes", () => {
    expect([zoneOf(5, ""), zoneOf(10, ""), zoneOf(11, ""), zoneOf(25, ""), zoneOf(15, "95028"), zoneOf(16, "95028")].map((z) => z.zone)).toEqual([1, 1, 2, 3, 1, 2]);
  });

  it("an offer without a stored rate for the second worker stays at 25 €/h", () => {
    expect(derived({ laborHoursHHMM: "7:00", travelTimeHHMM: "1:00", travelSecondWorkerRate: 25 }, { type: "bu", payer: "Kassenkunde", postalCode: "" }).travelSecondWorkerRate).toBe(25);
  });

  it("a change of the times is ONE change of the offer", async () => {
    await open("bu");
    const before = useOfferStore.getState().version;
    await userEvent.click(screen.getByRole("button", { name: `${FIELD.travelTime} plus 15 Minuten` }));
    expect(useOfferStore.getState().version).toBe(before + 1);
  });

  it("a failed route suggestion says so and changes nothing", async () => {
    fakeServer({ ...BASE, "POST /api/routing/suggest-distance": { status: 504, body: { ok: false, error: { code: "ROUTING_TIMEOUT", message: "Routenvorschlag gerade nicht verfügbar (Zeitüberschreitung). Bitte tragen Sie die Strecke von Hand ein.", requestId: "t" } } } });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await screen.findByRole("heading", { name: "Anfahrt" });
    useOfferStore.getState().patch("Kundendaten" as never, { city: "Hof" } as never);
    await userEvent.click(screen.getByRole("button", { name: "Strecke aus Adresse vorschlagen" }));
    expect(await screen.findByText(/Zeitüberschreitung/)).toBeInTheDocument();
    expect(offer().Arbeitszeit.distanceKm).toBe("");
  });
});
