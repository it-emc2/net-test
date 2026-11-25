// „Versionen“ (UX-CHANGES U-062): the saved versions of the open offer and „Wiederherstellen“ —
// replayed against the recording of today's add-on (fixtures/versionen.json,
// v2/scripts/capture-versionen.cjs; made-up test customer). Deliberate differences are asserted
// as such: a question before restoring, unsaved input saved first, no device history rows.
process.env.TZ = "Europe/Berlin";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT, canRestore, heading, initials, rowLabel, sentNumberOf } from "../src/features/offer/model/versions.js";
import { closeVersionsPanel } from "../src/features/offer/model/versions-panel.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { toast } from "../src/shared/ui/toaster.js";
import recorded from "./fixtures/versionen.json" with { type: "json" };
import sendBases from "./fixtures/versand-senden.json" with { type: "json" };
import { BASE, NO_DRAFT, fakeServer, renderApp, type Reply } from "./helpers.js";

const capture = await import("../../../scripts/capture-versionen.cjs" as string) as { default: { statesOf: (b: unknown) => { by: string; payload: Record<string, any> }[]; TEMP: string } };
const { statesOf, TEMP } = capture.default;
const STATES = statesOf((sendBases as any).bases);
type Obj = Record<string, any>;
const S = (recorded as { scenarios: Obj[] }).scenarios;
const scen = (name: string) => S.find((s) => s.name === name)!;
const AT = "2026-11-24T15:40:00Z";
/** the recording's masking of moving dates */
const mask = (t: string) => t.replace(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/g, "<datum>");
/** the server's list as recorded (the time is masked in the recording: any time will do) */
const revisionsOf = (s: Obj) => (s.before.server.revisions as Obj[]).map((r) => ({ ...r, at: AT, offerType: "bu" }));
/** the rows today's dialog listed from the server (not today's device history) */
const serverRows = (s: Obj) => (s.dialog.items as Obj[]).filter((i) => i.text?.startsWith("Version "));

const draft = (deal: string, i: number, revision: number, more: Obj = {}): Reply =>
  ({ body: { dealId: deal, offerType: "bu", payload: { ...STATES[i]!.payload, ...more }, revision, updatedAt: AT } });
const listReply = (deal: string, revisions: Obj[]): Reply => ({ body: { dealId: deal, revisions } });
const FAIL = (status = 500, code = "INTERNAL"): Reply => ({ status, body: { error: { code, message: "x", requestId: "t" } } });

const panel = () => screen.getByTestId("versions-panel");
const rows = () => within(panel()).getAllByTestId("version-row");
const openPanel = async () => { await userEvent.click(await screen.findByTestId("versions-button")); return screen.findByTestId("versions-panel"); };
const shownRows = () => rows().map((r) => ({ text: mask(within(r).getByText(/^Version /).textContent ?? ""), buttons: within(r).queryAllByRole("button").map((b) => b.textContent) }));

beforeEach(() => {
  localStorage.clear(); usePrefs.getState().setAutosave(true);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  for (const k of ["error", "success", "info", "warning"] as const) vi.spyOn(toast, k);
});
afterEach(() => { closeVersionsPanel(); useOfferStore.getState().close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("rules", () => {
  it("row texts as today: number, date, initials, note or changed parts, „(aktuell)“", () => {
    for (const name of ["list: several versions", "unsaved input, then restore at once", "temporary draft (no deal number)"]) {
      const s = scen(name), current = s.before.server.revision;
      expect(revisionsOf(s).map((r) => mask(rowLabel(r as never, current))), name).toEqual(serverRows(s).map((i) => i.text));
      expect(revisionsOf(s).map((r) => canRestore(r as never, current)), name).toEqual(serverRows(s).map((i) => i.buttons.length > 0));
    }
  });
  it("initials only (org rule), headings as today", () => {
    expect(initials("capture@local.test")).toBe("CA");
    expect(initials("x.y@local.test")).toBe("XY");
    expect(initials("")).toBe("");
    expect(heading("70031")).toBe(scen("list: several versions").dialog.heading);
    expect(heading(TEMP)).toBe(scen("temporary draft (no deal number)").dialog.heading);
    expect(TEXT.label).toBe(scen("list: several versions").dialog.label);
    expect(TEXT.lead).toBe(scen("list: several versions").dialog.lead);
    expect(TEXT.none).toBe(scen("no version yet").dialog.items[0].text);
    expect(TEXT.offline).toBe(scen("versions cannot be loaded").dialog.items[0].text);
    expect(TEXT.failed).toBe(scen("restore refused by the server").badge.title);
    const c = scen("changed elsewhere (conflict)").dialog.items;
    expect(TEXT.keepMine).toBe(c[0].button);
    expect(mask(TEXT.loadNewest(4, AT))).toBe(c[1].button);
  });
  it("a sent offer is named in the question only when the offer itself is marked as sent", () => {
    expect(sentNumberOf({ offerNumber: "ANG2026-1124-100000", zusammenfassung: { versand: { art: "email", versendetAm: "24.11.2026" } } })).toBe("ANG2026-1124-100000");
    expect(sentNumberOf({ offerNumber: "ANG2026-1124-100000", zusammenfassung: { versand: {} } })).toBe("");
    expect(sentNumberOf(null)).toBe("");
  });
});

describe("the panel, replayed", () => {
  it("list: several versions — today's heading, rows and buttons; asks …/draft/revisions and …/draft", async () => {
    const s = scen("list: several versions");
    const srv = fakeServer({ ...BASE, "GET /api/deals/70031/draft": draft("70031", 0, 4), "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(s)) });
    renderApp("/deal/70031/bu/Kundendaten");
    expect(await screen.findByLabelText(/^Stadt/)).toHaveValue("Hof");
    const before = srv.count("GET /api/deals/70031/draft");
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(within(panel()).getByRole("heading").textContent).toBe(s.dialog.heading);
    expect(within(panel()).getByText(s.dialog.lead)).toBeInTheDocument();
    expect(shownRows()).toEqual(serverRows(s).map((i) => ({ text: i.text, buttons: i.buttons })));
    expect(srv.count("GET /api/deals/70031/draft/revisions")).toBe(1);
    expect(srv.count("GET /api/deals/70031/draft")).toBe(before + 1);
    expect(within(panel()).getAllByRole("button", { name: "Schließen" })).toHaveLength(2); // the X and today's button
    await userEvent.click(within(panel()).getAllByRole("button", { name: "Schließen" }).at(-1)!);
    expect(screen.queryByTestId("versions-panel")).toBeNull();
  });

  it("restore an older version: a question first (U-062), then today's request; the form shows the restored state", async () => {
    const s = scen("restore an older version");
    let at = 4;
    const srv = fakeServer({
      ...BASE,
      "GET /api/deals/70031/draft": () => (at === 4 ? draft("70031", 0, 4) : draft("70031", 1, 5)),
      "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(s)),
      "POST /api/deals/70031/draft/restore": () => { at = 5; return { body: { dealId: "70031", revision: 5, changed: true } }; },
    });
    renderApp("/deal/70031/bu/Kundendaten");
    expect(await screen.findByLabelText(/^Stadt/)).toHaveValue(s.before.form.city);
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(4));
    await userEvent.click(within(panel()).getByRole("button", { name: "Wiederherstellen: Version 2" }));
    // the question (today: none)
    expect(within(panel()).getByRole("heading").textContent).toBe("Version 2 wiederherstellen?");
    expect(within(panel()).queryByText(TEXT.askUnsaved)).toBeNull();
    expect(srv.count("POST /api/deals/70031/draft/restore")).toBe(0);
    await userEvent.click(within(panel()).getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() => expect(screen.queryByTestId("versions-panel")).toBeNull());
    const req = s.requests.find((r: Obj) => r.method === "POST");
    expect(srv.calls.filter((c) => c.key === "POST /api/deals/70031/draft/restore").map((c) => c.body)).toEqual([req.body]);
    expect(srv.count("PUT /api/deals/70031/draft")).toBe(0); // nothing unsaved: nothing saved first
    await waitFor(() => expect(screen.getByLabelText(/^Stadt/)).toHaveValue(s.after.form.city));
    expect(screen.getByLabelText(/^PLZ/)).toHaveValue(s.after.form.postalCode);
    expect(useOfferStore.getState().revision).toBe(s.after.server.revision);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Version 2 wiederhergestellt", expect.anything());
  });

  it("„Abbrechen“ in the question restores nothing", async () => {
    const s = scen("restore an older version");
    const srv = fakeServer({ ...BASE, "GET /api/deals/70031/draft": draft("70031", 0, 4), "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(s)) });
    renderApp("/deal/70031/bu/Kundendaten");
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: "Wiederherstellen: Version 3" }));
    await userEvent.click(within(panel()).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(srv.count("POST /api/deals/70031/draft/restore")).toBe(0);
  });

  it("unsaved input, then restore at once: today the input is replaced — here it is saved first as its own version (U-062)", async () => {
    const s = scen("unsaved input, then restore at once");
    // recorded: no save before the restore, baseRevision 3, the typed city gone
    expect(s.requests.map((r: Obj) => r.method)).toEqual(["POST", "GET"]);
    expect(s.requests[0].body).toEqual({ revision: 1, baseRevision: 3 });
    expect(s.after.server.city).toBe("Hof");
    let rev = 3;
    const srv = fakeServer({
      ...BASE,
      "GET /api/deals/70031/draft": () => (rev === 5 ? draft("70031", 0, 5) : draft("70031", 2, rev)),
      "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(s)),
      "PUT /api/deals/70031/draft": () => { rev = 4; return { body: { dealId: "70031", revision: 4, changed: true } }; },
      "POST /api/deals/70031/draft/restore": () => { rev = 5; return { body: { dealId: "70031", revision: 5, changed: true } }; },
    });
    usePrefs.getState().setAutosave(false); // the input stays unsaved until the restore
    renderApp("/deal/70031/bu/Kundendaten");
    const city = await screen.findByLabelText(/^Stadt/);
    await userEvent.clear(city); await userEvent.type(city, "Rehau"); await userEvent.tab();
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: "Wiederherstellen: Version 1" }));
    expect(within(panel()).getByText(TEXT.askUnsaved)).toBeInTheDocument();
    await userEvent.click(within(panel()).getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() => expect(screen.queryByTestId("versions-panel")).toBeNull());
    const keys = srv.calls.map((c) => c.key);
    expect(keys.indexOf("PUT /api/deals/70031/draft")).toBeLessThan(keys.indexOf("POST /api/deals/70031/draft/restore"));
    expect((srv.calls.find((c) => c.key === "PUT /api/deals/70031/draft")!.body as Obj).payload.Kundendaten.city).toBe("Rehau");
    expect(srv.calls.find((c) => c.key === "POST /api/deals/70031/draft/restore")!.body).toEqual({ revision: 1, baseRevision: 4 });
    await waitFor(() => expect(screen.getByLabelText(/^Stadt/)).toHaveValue(s.after.form.city));
  });

  it("no version yet: today's line", async () => {
    fakeServer({ ...BASE, "GET /api/deals/70032/draft/revisions": listReply("70032", []) });
    renderApp("/deal/70032/bu/Kundendaten");
    await openPanel();
    expect(await within(panel()).findByText(scen("no version yet").dialog.items[0].text)).toBeInTheDocument();
    expect(within(panel()).queryAllByTestId("version-row")).toHaveLength(0);
  });

  it("temporary draft (no deal number): today's heading", async () => {
    const s = scen("temporary draft (no deal number)");
    fakeServer({ ...BASE, [`GET /api/deals/${TEMP}/draft`]: draft(TEMP, 2, 3), [`GET /api/deals/${TEMP}/draft/revisions`]: listReply(TEMP, revisionsOf(s)) });
    renderApp(`/deal/${TEMP}/bu/Kundendaten`);
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(within(panel()).getByRole("heading").textContent).toBe(s.dialog.heading);
  });

  it("versions cannot be loaded: today's line", async () => {
    fakeServer({ ...BASE, "GET /api/deals/70031/draft": draft("70031", 2, 3), "GET /api/deals/70031/draft/revisions": FAIL() });
    renderApp("/deal/70031/bu/Kundendaten");
    await openPanel();
    expect(await within(panel()).findByText(scen("versions cannot be loaded").dialog.items[0].text)).toBeInTheDocument();
  });

  it("restore refused by the server: today's message, the panel stays, nothing changes", async () => {
    const s = scen("restore refused by the server");
    const srv = fakeServer({ ...BASE, "GET /api/deals/70031/draft": draft("70031", 2, 3), "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(s)),
      "POST /api/deals/70031/draft/restore": FAIL(409, "REVISION_CONFLICT") });
    renderApp("/deal/70031/bu/Kundendaten");
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: "Wiederherstellen: Version 1" }));
    await userEvent.click(within(panel()).getByRole("button", { name: "Wiederherstellen" }));
    expect(await within(panel()).findByText(s.badge.title)).toBeInTheDocument();
    expect(srv.calls.filter((c) => c.key === "POST /api/deals/70031/draft/restore").map((c) => c.body)).toEqual([s.requests[0].body]);
    expect(screen.getByLabelText(/^Stadt/)).toHaveValue(s.after.form.city);
    expect(useOfferStore.getState().revision).toBe(3);
    expect(within(panel()).queryByTestId("versions-sent-refused")).toBeNull(); // not the refusal of U-074
  });

  it("changed elsewhere: today's two choices; „Neuesten Stand laden“ replaces the open state", async () => {
    const s = scen("changed elsewhere (conflict)");
    // the open state is based on version 3 (opened before the other device saved version 4)
    let first = true;
    const open = draft("70031", 2, 3);
    fakeServer({ ...BASE,
      "GET /api/deals/70031/draft": () => { if (first) { first = false; return open; } return draft("70031", 2, 4, { Kundendaten: { ...STATES[2]!.payload.Kundendaten, city: "Plauen" } }); },
      "GET /api/deals/70031/draft/revisions": listReply("70031", [{ revision: 4, at: AT, by: "x.y@local.test", kind: "save", sections: ["Kundendaten"], note: "", offerType: "bu" }, ...revisionsOf(s)]),
      "PUT /api/deals/70031/draft": FAIL(409, "REVISION_CONFLICT") });
    renderApp("/deal/70031/bu/Kundendaten");
    const city = await screen.findByLabelText(/^Stadt/);
    await userEvent.clear(city); await userEvent.type(city, "Rehau"); await userEvent.tab();
    await act(async () => { await (await import("../src/features/offer/index.js")).flushDraft(); });
    await openPanel();
    const box = await within(panel()).findByTestId("versions-conflict");
    await waitFor(() => expect(within(box).getAllByRole("button").map((b) => mask(b.textContent ?? ""))).toEqual(s.dialog.items.slice(0, 2).map((i: Obj) => i.button)));
    expect(shownRows().map((r) => r.text)).toEqual(serverRows(s).map((i) => i.text));
    await userEvent.click(within(box).getByRole("button", { name: /^Neuesten Stand laden/ }));
    await waitFor(() => expect(screen.queryByTestId("versions-panel")).toBeNull());
    expect(screen.getByLabelText(/^Stadt/)).toHaveValue("Plauen");
    expect(useOfferStore.getState().revision).toBe(4);
  });

  it("changed elsewhere: „Meinen Stand … speichern“ saves the open state on top of the newest version", async () => {
    let first = true, saved = false;
    const srv = fakeServer({ ...BASE,
      "GET /api/deals/70031/draft": () => { if (first) { first = false; return draft("70031", 2, 3); } return draft("70031", 2, 4, { Kundendaten: { ...STATES[2]!.payload.Kundendaten, city: "Plauen" } }); },
      "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(scen("changed elsewhere (conflict)"))),
      "PUT /api/deals/70031/draft": (b) => ((b as Obj).baseRevision === 4 ? (saved = true, { body: { dealId: "70031", revision: 5, changed: true } }) : FAIL(409, "REVISION_CONFLICT")) });
    renderApp("/deal/70031/bu/Kundendaten");
    const city = await screen.findByLabelText(/^Stadt/);
    await userEvent.clear(city); await userEvent.type(city, "Rehau"); await userEvent.tab();
    await act(async () => { await (await import("../src/features/offer/index.js")).flushDraft(); });
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: TEXT.keepMine }));
    await waitFor(() => expect(saved).toBe(true));
    expect((srv.calls.filter((c) => c.key === "PUT /api/deals/70031/draft").at(-1)!.body as Obj).payload.Kundendaten.city).toBe("Rehau");
    expect(useOfferStore.getState().revision).toBe(5);
    expect(screen.getByLabelText(/^Stadt/)).toHaveValue("Rehau");
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(TEXT.keptMine, undefined);
  });
});

describe("where it is opened, variants, sent offers", () => {
  it("the step drawer's „Versionen“ opens the same panel (no link to today's UI any more)", async () => {
    fakeServer({ ...BASE, "GET /api/deals/70031/draft": draft("70031", 2, 3), "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(scen("temporary draft (no deal number)"))) });
    renderApp("/deal/70031/bu/Kundendaten");
    await userEvent.click(await screen.findByRole("button", { name: "Schritte öffnen" }));
    const drawer = await screen.findByRole("dialog", { name: "Schritte" });
    expect(within(drawer).queryByRole("link", { name: "Versionen" })).toBeNull();
    await userEvent.click(within(drawer).getByRole("button", { name: "Versionen" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.queryByRole("link", { name: "Versionen" })).toBeNull();
  });

  it("a known variant: list and restore name it", async () => {
    const V2 = "v-0123456789ab";
    let rev = 3;
    const srv = fakeServer({ ...BASE,
      [`GET /api/deals/70031/draft?variant=${V2}`]: () => ({ body: { ...(draft("70031", rev === 3 ? 2 : 0, rev).body as Obj), variantId: V2, variantName: "Günstig" } }),
      [`GET /api/deals/70031/draft/revisions?variant=${V2}`]: listReply("70031", revisionsOf(scen("temporary draft (no deal number)"))),
      [`POST /api/deals/70031/draft/restore?variant=${V2}`]: () => { rev = 4; return { body: { dealId: "70031", revision: 4, changed: true } }; } });
    renderApp(`/deal/70031/bu/Kundendaten?variante=${V2}`);
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: "Wiederherstellen: Version 1" }));
    await userEvent.click(within(panel()).getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() => expect(srv.count(`POST /api/deals/70031/draft/restore?variant=${V2}`)).toBe(1));
    await waitFor(() => expect(screen.getByLabelText(/^Stadt/)).toHaveValue("Hof"));
    expect(srv.count("POST /api/deals/70031/draft/restore")).toBe(0);
  });

  it("a sent offer: the question says the sent offer stays unchanged", async () => {
    const sent = { offerNumber: "ANG2026-1124-100000", zusammenfassung: { ...STATES[2]!.payload.zusammenfassung, versand: { art: "email", versendetAm: "24.11.2026" } } };
    fakeServer({ ...BASE, "GET /api/deals/70031/draft": draft("70031", 2, 3, sent), "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(scen("temporary draft (no deal number)"))) });
    renderApp("/deal/70031/bu/Kundendaten");
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: "Wiederherstellen: Version 1" }));
    expect(within(panel()).getByText(TEXT.askSent("ANG2026-1124-100000"))).toBeInTheDocument();
  });

  it("U-074: a version with an older, already sent offer number is refused with the server's text and a button that opens the sent offer from the Hauptmenü", async () => {
    const OLD = "ANG2026-1101-080000";
    const message = TEXT.sentRefused(OLD);
    const srv = fakeServer({
      ...BASE, "GET /api/deals/70031/draft": draft("70031", 2, 3, { offerNumber: "ANG2026-1124-090000" }), "GET /api/deals/70031/draft/revisions": listReply("70031", revisionsOf(scen("restore refused by the server"))),
      "POST /api/deals/70031/draft/restore": { status: 409, body: { error: { code: "RESTORE_SENT_NUMBER", message, requestId: "t", offerNumber: OLD } } },
      "GET /api/planning/v2/today": { body: { ok: true, plan: null } },
      [`GET /api/offers/${OLD}`]: { body: { offer: { offerNumber: OLD, offerType: "bu", payload: { ...STATES[0]!.payload, offerNumber: OLD, auftragId: "70031" } } } },
    });
    const router = renderApp("/deal/70031/bu/Kundendaten");
    await openPanel();
    await userEvent.click(await within(panel()).findByRole("button", { name: "Wiederherstellen: Version 1" }));
    await userEvent.click(within(panel()).getByRole("button", { name: "Wiederherstellen" }));
    const refused = await within(panel()).findByTestId("versions-sent-refused");
    expect(refused).toHaveTextContent(message);
    expect(message).toMatch(/bleibt unverändert gespeichert\. Sie öffnen es im Hauptmenü unter „Öffnen“ mit der Nummer ANG2026-1101-080000/);
    expect(useOfferStore.getState().revision).toBe(3); // nothing restored
    // „Zurück“ leads back to the list; the button opens the sent offer as „Öffnen“ with its number does
    await userEvent.click(within(refused).getByRole("button", { name: `Angebot ${OLD} öffnen` }));
    await waitFor(() => expect(screen.queryByTestId("versions-panel")).toBeNull());
    expect(await screen.findByTestId("takeover-question")).toHaveTextContent(`Wenn Sie Angebot ${OLD} übernehmen`); // U-057: the deal's draft differs
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe(""); // the address is cleaned: a reload does not open it again
    expect(screen.getAllByTestId("takeover-question")).toHaveLength(1); // opened once
    expect(srv.count(`POST /api/deals/70031/draft/import`)).toBe(0); // nothing copied before the answer
  });

  it("no draft at all yet (a new offer): no version, nothing to restore", async () => {
    fakeServer({ ...BASE, "GET /api/deals/70033/draft/revisions": { status: 404, body: (NO_DRAFT.body as Obj) } });
    renderApp("/deal/70033/bu/Kundendaten");
    await openPanel();
    // today's add-on reads an answer without a list (e.g. 404) as „Noch keine …“, only a lost connection as „Keine Verbindung …“
    expect(await within(panel()).findByText(TEXT.none)).toBeInTheDocument();
  });
});
