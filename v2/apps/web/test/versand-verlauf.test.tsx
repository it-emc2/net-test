// "Versandverlauf" (UX-CHANGES U-015) must show what today's page shows (there the add-on
// modules/web/addons/offer-record.js draws it): one line per send — when, how, to whom, signed,
// Bitrix state, stored document — and repeat a failed Bitrix filing. Check level "Light": the
// rules against the add-on's wording, the list on the page, and the one action in it.
// U-023 (owner 2026-11-17): the list holds the sends of the deal and is not drawn when nothing
// was sent — the test "an offer that never went out" changed with it, the deal tests are new.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyChanged } from "../src/features/steps/versand/Verlauf.js";
import { TEXT, lineOf, linesOf, shownSends } from "../src/features/steps/versand/history-rules.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-post.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

process.env.TZ = "Europe/Berlin";
const KEY = "t-0123456789abcdef01234567", NUMBER = "ANG2026-1116-093000", ID = "0123456789abcdef0123456789abcdef";
type Obj = Record<string, unknown>;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const MAILED: Obj = { sendId: ID, channel: "email", status: "done", to: "kunde@example.test", finishedAt: "2026-11-15T09:30:00.000Z", steps: { bitrix: { status: "ok" } }, files: [{ role: "offer", fileId: "f1", filename: "a.pdf" }, { role: "bitrixDoc", fileId: "f2", filename: "k.pdf" }] };
const offer = { ...(reference.bases as unknown as Record<string, Obj>).bu, offerNumber: NUMBER };
const draft: Reply = { body: { dealId: KEY, offerType: "bu", payload: offer, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } };
const open = async (sends: Reply | (() => Reply), more: Record<string, Reply> = {}, d: Reply = draft) => {
  const server = fakeServer({ ...BASE, "GET /api/deals/*/draft": d, [`GET /api/offers/${NUMBER}/sends`]: sends, ...more });
  renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
  await screen.findByTestId("zf-post");
  return server;
};
const rows = () => screen.getAllByTestId("zf-history-row").map((r) => flat(r.textContent));
beforeEach(() => { for (const k of ["error", "success"] as const) vi.spyOn(toast, k); });
afterEach(() => vi.restoreAllMocks());

describe("Versandverlauf — the rules", () => {
  it("a mailed offer: when, how, to whom, filed, and the stored offer (other stored files are not offered)", () => {
    expect(lineOf(MAILED)).toEqual({ id: ID, when: "15.11.2026, 10:30", offer: "", how: "per E-Mail an kunde@example.test", notes: [{ tone: "ok", text: "✓ in Bitrix abgelegt" }], retry: false,
      files: [{ label: "Angebot ansehen", href: `/api/sends/${ID}/files/f1` }] });
  });

  it("signing: not yet signed, then signed with its time", () => {
    const onSite = { sendId: "s", channel: "onsite", status: "done", signing: true, startedAt: "2026-11-15T09:30:00.000Z" };
    expect(lineOf(onSite).how).toBe("Unterschrift vor Ort");
    expect(lineOf(onSite).notes).toEqual([{ tone: "plain", text: "noch nicht unterschrieben" }]);
    expect(lineOf({ ...onSite, channel: "signlink", signedAt: "2026-11-16T08:05:00.000Z", files: [{ role: "signed", fileId: "f9" }] })).toMatchObject({
      how: "Link zur Online-Unterschrift", notes: [{ tone: "ok", text: "✓ unterschrieben am 16.11.2026, 09:05" }], files: [{ label: "Unterschriebenes Dokument", href: "/api/sends/s/files/f9" }] });
    expect(lineOf({ ...onSite, channel: "email" }).notes).toEqual([]); // a mail is not waited on for a signature
  });

  it("a letter, a filing only, one still running, one that failed", () => {
    expect(lineOf({ sendId: "p", channel: "post", status: "done", to: "Erika Muster, Musterweg 4, 95028, Hof", files: [{ role: "letter", fileId: "l" }] })).toMatchObject({ how: "per Post an Erika Muster, Musterweg 4, 95028, Hof", files: [{ label: "Brief ansehen", href: "/api/sends/p/files/l" }] });
    expect(lineOf({ sendId: "b", channel: "bitrix", status: "done" }).how).toBe("nur in Bitrix abgelegt");
    expect(lineOf({ sendId: "r", channel: "email", status: "running" }).notes).toEqual([{ tone: "bad", text: "läuft noch …" }]);
    expect(lineOf({ sendId: "f", channel: "email", status: "failed", error: "SMTP 550" }).notes).toEqual([{ tone: "bad", text: "nicht versendet: SMTP 550" }]);
    expect(lineOf({ sendId: "f", channel: "email", status: "failed", files: [{ role: "offer", fileId: "x" }], steps: { bitrix: { status: "failed" } } })).toMatchObject({ retry: false, files: [] });
  });

  it("a failed filing can be repeated; a failed send is only shown while it is the latest", () => {
    expect(lineOf({ ...MAILED, steps: { bitrix: { status: "failed" } } })).toMatchObject({ retry: true, notes: [{ tone: "bad", text: "Bitrix-Ablage fehlgeschlagen" }] });
    const failed = { sendId: "f", status: "failed" }, done = { sendId: "d", status: "done" };
    expect(shownSends([failed, done, failed]).map((s) => s.sendId)).toEqual(["f", "d"]);
    expect(shownSends([done, failed]).map((s) => s.sendId)).toEqual(["d"]);
    expect(linesOf(null)).toEqual([]);
  });
});

describe("Versandverlauf — on the page", () => {
  it("lists the sends, newest first as the server gives them", async () => {
    await open({ body: { ok: true, sends: [{ sendId: "s2", channel: "onsite", status: "done", signing: true, finishedAt: "2026-11-16T08:00:00.000Z" }, MAILED] } });
    const box = await screen.findByTestId("zf-history");
    expect(within(box).getByRole("heading").textContent).toBe("Versandverlauf");
    expect(rows()).toEqual(["16.11.2026, 09:00Unterschrift vor Ortnoch nicht unterschrieben", "15.11.2026, 10:30per E-Mail an kunde@example.test✓ in Bitrix abgelegtAngebot ansehen"]);
    expect(box.dataset.count).toBe("2");
    const link = within(box).getByRole("link", { name: "Angebot ansehen" });
    expect([link.getAttribute("href"), link.getAttribute("target")]).toEqual([`/api/sends/${ID}/files/f1`, "_blank"]);
  });

  it("nothing sent: no list at all (U-023; before: \"Dieses Angebot wurde noch nicht versendet.\")", async () => {
    const server = await open({ body: { ok: true, sends: [] } });
    await waitFor(() => expect(server.count(`GET /api/offers/${NUMBER}/sends`)).toBeGreaterThan(0));
    expect(screen.queryByTestId("zf-history")).toBeNull();
  });

  it("with a deal number: the sends of the deal, a line of another offer number names it (U-023)", async () => {
    const withDeal: Reply = { body: { ...(draft.body as Obj), payload: { ...offer, auftragId: "65418" } } };
    const server = await open({ body: { ok: true, sends: [] } }, { "GET /api/deals/65418/sends": { body: { ok: true, sends: [{ ...MAILED, offerNumber: NUMBER }, { sendId: "old", channel: "post", status: "done", offerNumber: "ANG2026-1101-080000", to: "Erika Muster", finishedAt: "2026-11-01T08:00:00.000Z" }] } } }, withDeal);
    await screen.findByTestId("zf-history");
    expect(rows()).toEqual(["15.11.2026, 10:30per E-Mail an kunde@example.test✓ in Bitrix abgelegtAngebot ansehen", "01.11.2026, 09:00Angebot ANG2026-1101-080000per Post an Erika Muster"]);
    expect(server.count(`GET /api/offers/${NUMBER}/sends`)).toBe(0);
  });

  it("the list cannot be read: nothing is shown, nothing breaks", async () => {
    await open({ status: 500, body: { error: { code: "X", message: "kaputt", requestId: "t" } } });
    expect(screen.queryByTestId("zf-history")).toBeNull();
  });

  it("\"Ablage wiederholen\" files again, says so, and reads the list again", async () => {
    let filed = false;
    const server = await open(() => ({ body: { ok: true, sends: [{ ...MAILED, steps: { bitrix: { status: filed ? "ok" : "failed" } } }] } }), { [`POST /api/sends/${ID}/retry-bitrix`]: { body: { ok: true } } });
    const button = await screen.findByRole("button", { name: "Ablage wiederholen" });
    filed = true;
    await userEvent.setup().click(button);
    await waitFor(() => expect(rows()[0]).toContain("✓ in Bitrix abgelegt"));
    expect(screen.queryByRole("button", { name: "Ablage wiederholen" })).toBeNull();
    expect(server.count(`POST /api/sends/${ID}/retry-bitrix`)).toBe(1);
    expect(vi.mocked(toast.success).mock.calls.map((c) => c[0])).toEqual([TEXT.refiled]);
  });

  it("the repeated filing fails again: said so, the button stays", async () => {
    await open({ body: { ok: true, sends: [{ ...MAILED, steps: { bitrix: { status: "failed" } } }] } }, { [`POST /api/sends/${ID}/retry-bitrix`]: { status: 502, body: { error: { code: "BITRIX", message: "Timeout", requestId: "t" } } } });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Ablage wiederholen" }));
    await waitFor(() => expect(vi.mocked(toast.error).mock.calls.map((c) => c[0])).toEqual([TEXT.refileFailed]));
    expect(await screen.findByRole("button", { name: "Ablage wiederholen" })).toBeTruthy();
  });

  it("after a send on this page the list is read again", async () => {
    const server = await open({ body: { ok: true, sends: [MAILED] } }); // U-023: the list is only drawn with a send in it
    await screen.findByTestId("zf-history");
    const was = server.count(`GET /api/offers/${NUMBER}/sends`);
    historyChanged();
    await waitFor(() => expect(server.count(`GET /api/offers/${NUMBER}/sends`)).toBe(was + 1));
  });
});
