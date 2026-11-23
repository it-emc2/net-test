// Alltagshilfe · Kosten (UX-CHANGES U-051). The page is rebuilt, but for the same offer every per-service
// row (hours, visits, unit prices, sums) must be today's, and for a Kassenkunde the totals too.
// Reference: fixtures/ah-kosten.json, recorded from today's UI by v2/scripts/capture-ah-kosten.cjs.
// DELIBERATE DIFFERENCES (ADR 028, owner 2026-11-20): for a Selbstzahler today's page adds the
// Servicepauschale (1,20 €) as a table row and into the HnD subtotal and the total and shows no VAT; the
// new page shows net + 7 % MwSt = gross and the Servicepauschale only as a note.
import { cleanup, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { statuses } from "../src/features/steps/status.js";
import { hoursText, visitsText } from "../src/features/steps/ah/kosten-rules.js";
import { PAUSCHALE_NOTE } from "../src/features/steps/ah/rules.js";
import { euro } from "../src/shared/lib/format.js";
import reference from "./fixtures/ah-kosten.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type F = Record<string, any>;
const KEY = "t-0123456789abcdef01234569";
const CONFIG = { ENTLASTUNGSBETRAG_MONAT: 131, STEUERABSETZ_PCT: 20, STEUERABSETZ_CAP_JAHR: 4000, VERHINDERUNGSPFLEGE_JAHR: 2418 };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const nb = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => nb(el.querySelector(`[data-part="${name}"]`)?.textContent);

const handlers = (draft: F, type = "ah") => ({
  ...BASE, "GET /admin/api/config/public": { body: CONFIG },
  "GET /api/deals/*/draft": { body: { dealId: "4712", revision: 3, offerType: type, payload: draft, updatedAt: "2026-11-23T10:00:00.000Z", updatedBy: "ap@example.test" } },
});
async function open(draft: F, step = "Kosten") {
  const server = fakeServer(handlers(draft));
  renderApp(`/deal/4712/ah/${step}`);
  await screen.findByTestId(step === "Kosten" ? "ah-kosten" : "ah-leistungen");
  return server;
}
const cards = () => screen.queryAllByTestId("ah-kosten-service");
const rowsOf = (card: HTMLElement) => Array.from(card.querySelectorAll('[data-testid="ah-kosten-line"]')).map((r) => [part(r, "label"), part(r, "qty"), part(r, "unit"), part(r, "total")]);
const summaryText = () => nb(screen.getByTestId("ah-summary").textContent);
const draftOf = (s: F) => ({ activeOffer: "ah", ah: { ahServicesJson: s.ah.ahServicesJson, services: s.ah.services, ahNote: "" }, Arbeitszeit: s.Arbeitszeit, Kundendaten: s.Kundendaten, Finanzierung: s.Finanzierung });

describe("Kosten shows today's rows for the same offer; Kassenkunde: today's totals", () => {
  it("the recording is there and varied", () => {
    expect(reference.scenarios.length).toBeGreaterThanOrEqual(8);
    const payers = new Set(reference.scenarios.map((s) => s.Kundendaten.payer));
    expect(payers).toEqual(new Set(["Kassenkunde", "Selbstzahler"]));
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const sc = s as unknown as F;
    const sz = sc.Kundendaten.payer === "Selbstzahler";
    const server = await open(draftOf(sc));
    const k = sc.kosten;
    expect(k.empty).toBe(false);
    const shown = cards();
    expect(shown.map((c) => part(c, "title"))).toEqual(k.sections.map((x: F) => x.title));
    k.sections.forEach((rec: F, i: number) => {
      const card = shown[i]!;
      // rows: today's table; a Selbstzahler's „Servicepauschale“ row is gone on purpose (ADR 028: a note only)
      const today = rec.rows.filter((r: string[]) => !(sz && /^Servicepauschale/.test(r[0]!)));
      expect(rowsOf(card)).toEqual(today);
      expect(rec.rows.length - today.length).toBe(sz && i === 0 ? 1 : 0);
      // subtotal
      const sub = card.querySelector('[data-part="subtotal"]')!;
      const spans = Array.from(sub.querySelectorAll("span")).map((x) => nb(x.textContent));
      expect(spans[0]).toBe(rec.total[0]);
      if (sz && rec.title === "Haushaltsnahe Dienstleistungen") {
        expect(rec.total[1]).toBe(nb(euro(r2(sc.price.gesamtBase + 1.2)))); // today: with the Servicepauschale …
        expect(spans[1]).toBe(nb(euro(sc.price.gesamtBase))); // … new: without
      } else expect(spans[1]).toBe(rec.total[1]);
      // details without a click: today's zone text, today's per-visit minutes of every time row
      const zone = part(card, "zone");
      if (zone) expect(rec.details.startsWith(zone)).toBe(true);
      for (const line of Array.from(card.querySelectorAll('[data-part="rhythm"]')).map((x) => nb(x.textContent))) {
        const m = /^(.*) · (\d+) min \+ (\d+) min Hinfahrt = (\d+) min pro Einsatz$/.exec(line)!;
        expect(rec.details).toContain(`${m[1]}${m[2]} min+ ${m[3]} min= ${m[4]} min`);
      }
      expect(card.querySelectorAll('[data-part="rhythm"]').length).toBeGreaterThan(0);
      // the AB km note is today's footnote
      if (rec.title === "Alltagsbegleitung") expect(nb(rec.footnote)).toBe(`* ${part(card, "footnote")}`);
      else expect(part(card, "footnote")).toBe("");
    });
    // the total block: the same Summary component as Leistungen/Finanzierung
    const sum = screen.getByTestId("ah-summary");
    const lines = Array.from(sum.querySelectorAll('[data-part="line"]')).map((l) => nb(l.textContent));
    const total = nb(sum.querySelector('[data-part="total"]')?.textContent);
    if (sz) {
      // today: gesamt = net + Servicepauschale, no VAT. New: net + 7 % MwSt = gross
      expect(sc.price.gesamt).toBe(r2(sc.price.allBase + 1.2));
      const vat = r2(sc.price.allBase * 0.07);
      expect(lines).toEqual([`Leistungen und Anfahrt pro Monat${nb(euro(sc.price.allBase))}`, `zzgl. 7 % MwSt.${nb(euro(vat))}`]);
      expect(total).toBe(`Gesamt pro Monat${nb(euro(r2(sc.price.allBase + vat)))}`);
      expect(part(sum, "note-pauschale")).toBe(nb(PAUSCHALE_NOTE(euro(1.2))));
    } else {
      // the Kassenkunde's totals are today's: the net line is today's „Gesamt / Monat“, the Eigenanteil today's
      expect(lines[0]).toBe(`Leistungen und Anfahrt pro Monat${nb(euro(sc.price.gesamt))}`);
      if (k.grand) expect(k.grand[1]).toBe(nb(euro(sc.price.gesamt)));
      expect(total).toBe(`Eigenanteil pro Monat${nb(euro(sc.price.eigenanteil))}`);
      // today's footnote of the HnD card is the note of the total block, word for word
      const hnd = k.sections.find((x: F) => x.title === "Haushaltsnahe Dienstleistungen");
      if (hnd) expect(`* ${part(sum, "note-pauschale")}`).toBe(nb(hnd.footnote));
    }
    expect(server.count("POST /api/price")).toBe(0);
  });

  it("an old offer (time rows inside the task objects) shows the same rows as the recorded one with two rows", async () => {
    const sc = reference.scenarios.find((s) => s.name === "HnD with two time rows") as unknown as F;
    const rows = sc.ah.services[0].schedules;
    expect(rows).toHaveLength(2);
    const old = [{ type: "Haushaltsnahedienstleistungen", tasks: [{ id: "kochen", schedules: rows }], combinedVisit: false }];
    await open({ ...draftOf(sc), ah: { ahServicesJson: JSON.stringify(old) } });
    expect(rowsOf(cards()[0]!)).toEqual(sc.kosten.sections[0].rows);
    expect(cards()[0]!.querySelectorAll('[data-part="rhythm"]')).toHaveLength(2);
  });
});

describe("the page", () => {
  const SC = () => reference.scenarios.find((s) => s.name === "both services, separate visits, Kassenkunde") as unknown as F;

  it("one card per service in today's order, the total block below, no inputs, no price request", async () => {
    const server = await open(draftOf(SC()));
    const page = screen.getByTestId("ah-kosten");
    expect(cards().map((c) => c.dataset.kind)).toEqual(["hnd", "ab"]);
    expect(page.querySelector("input, button, select, textarea")).toBeNull();
    expect(cards()[1]!.nextElementSibling).toBe(screen.getByTestId("ah-summary"));
    expect(Array.from(cards()[0]!.querySelectorAll('[role="columnheader"]')).map((h) => nb(h.textContent))).toEqual(["Position", "Menge", "Einzelpreis", "Gesamt"]);
    expect(nb(cards()[0]!.querySelector('[data-part="zone"]')?.textContent)).toBe("Zone 3 · Hinfahrt 30 min pro Einsatz (im Stundensatz enthalten · Rückfahrt wird nicht berechnet)");
    expect(nb(cards()[0]!.querySelector('[data-part="rhythm"]')?.textContent)).toBe("Wöchentlich · 120 min + 30 min Hinfahrt = 150 min pro Einsatz");
    expect(server.count("POST /api/price")).toBe(0);
  });

  it("the total block is the one on Leistungen, character for character", async () => {
    await open(draftOf(SC()));
    const onKosten = summaryText();
    expect(onKosten).toContain("Eigenanteil pro Monat");
    cleanup();
    await open(draftOf(SC()), "ah");
    expect(summaryText()).toBe(onKosten);
  });

  it("the total block of a Selbstzahler is the one on Leistungen too (net, 7 % MwSt., gross)", async () => {
    const sc = reference.scenarios.find((s) => s.name === "Selbstzahler, both services") as unknown as F;
    await open(draftOf(sc));
    const onKosten = summaryText();
    expect(onKosten).toContain("zzgl. 7 % MwSt.");
    cleanup();
    await open(draftOf(sc), "ah");
    expect(summaryText()).toBe(onKosten);
  });

  it("one service: one card; the AB card has the km note, the HnD card has none", async () => {
    const sc = reference.scenarios.find((s) => s.name === "AB only") as unknown as F;
    await open(draftOf(sc));
    expect(cards()).toHaveLength(1);
    expect(part(cards()[0]!, "title")).toBe("Alltagsbegleitung");
    expect(part(cards()[0]!, "footnote")).toBe("Separate Direktrechnung — nicht im Gesamtbetrag. Fahrten im Rahmen der Alltagsbegleitung: 0,35 € / km · inkl. MwSt. Wird bei Bedarf direkt abgerechnet.");
  });

  it("without a travel time the card says so (today's „Keine Zone bestimmt.“)", async () => {
    const sc = reference.scenarios.find((s) => s.name === "no travel time, HnD") as unknown as F;
    await open(draftOf(sc));
    expect(part(cards()[0]!, "no-zone")).toBe("Keine Zone bestimmt.");
  });

  it("no service booked: a short line and a link to Leistungen; no cards, no total block", async () => {
    await open({ activeOffer: "ah", ah: {}, Kundendaten: { payer: "Kassenkunde" } });
    expect(cards()).toHaveLength(0);
    expect(screen.queryByTestId("ah-summary")).toBeNull();
    expect(nb(screen.getByTestId("ah-kosten").textContent)).toContain("Noch keine Leistung konfiguriert.");
    const link = within(screen.getByTestId("ah-kosten")).getByRole("link", { name: "Zu den Leistungen" });
    expect(link.getAttribute("href")).toMatch(/\/deal\/4712\/ah\/ah$/);
  });

  it("narrow screens: the rows stack (label on its own line), nothing scrolls sideways", async () => {
    await open(draftOf(SC()));
    const page = screen.getByTestId("ah-kosten");
    const row = page.querySelector('[data-testid="ah-kosten-line"]')!;
    expect(row.className).toContain("grid-cols-[auto_auto_1fr]");
    expect(row.className).toContain("sm:grid-cols-[1fr_5.5rem_6rem_6.5rem]");
    expect(row.querySelector('[data-part="label"]')!.className).toContain("col-span-3");
    const head = page.querySelector('[role="columnheader"]')!.parentElement!;
    expect(head.className).toMatch(/\bhidden\b/);
    expect(head.className).toContain("sm:grid");
    // no fixed minimum width, no inner scroll container
    expect(page.innerHTML).not.toMatch(/min-w-\[|overflow-x-/);
    // numbers: tabular figures, right-aligned from the tablet width on
    for (const p of ["qty", "unit", "total"]) expect(row.querySelector(`[data-part="${p}"]`)!.className).toContain("tabular-nums");
    expect(row.querySelector('[data-part="total"]')!.className).toContain("text-right");
  });

  it("number texts: today's decimals", () => {
    expect(hoursText(13 / 1.2)).toBe("10,83 h");
    expect(hoursText(0)).toBe("0,00 h");
    expect(visitsText(52 / 12)).toBe("4,33×");
    expect(visitsText(0)).toBe("0×");
    expect(visitsText(2)).toBe("2×");
  });
});

describe("step status and the other offer types", () => {
  const SC = reference.scenarios[0] as unknown as F;
  it("Kosten is done once a service is booked, open before; Badumbau has no Kosten status", () => {
    expect(statuses("ah", draftOf(SC), null).Kosten).toEqual({ kind: "done" });
    expect(statuses("ah", { activeOffer: "ah", ah: {} }, null).Kosten).toEqual({ kind: "open" });
    expect(statuses("bu", {}, null).Kosten).toBeUndefined();
  });

  it("Badumbau Kosten is untouched, Handlauf keeps the link to today's view", async () => {
    fakeServer({ ...BASE, "POST /api/price": { body: { total: 10 } } });
    renderApp("/deal/t-0123456789abcdef01234569/hl/Kosten");
    expect(await screen.findByRole("link", { name: "In der bisherigen Ansicht öffnen" })).toBeTruthy();
    expect(screen.queryByTestId("ah-kosten")).toBeNull();
    cleanup();
    fakeServer({ ...BASE, "POST /api/price": { body: { total: 10 } } });
    renderApp("/deal/t-0123456789abcdef01234569/bu/Kosten");
    expect(await screen.findByText("Kosten-Details")).toBeTruthy();
    expect(screen.queryByTestId("ah-kosten")).toBeNull();
    void useOfferStore;
  });
});
