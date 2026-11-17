// Audit of the sending flows, 2026-11-17 (client side) — what goes beyond today's UI on purpose
// (UX-CHANGES U-025; rules: src/features/steps/versand/version.ts):
//  F6  "Neue Version erstellen": the one explicit way to change a sent offer
//  F7  a refused or failed draft save stops mail, letter and signing
//  F4  an offer sent with a hand-edited Word file is not signed or resent from the form data
// (F5, F12, F13: versand-dokumente.test.tsx; F11: versand-anpassungen.test.tsx)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT as SEND } from "../src/features/steps/versand/send-rules.js";
import { TEXT as SIGN } from "../src/features/steps/versand/sign-rules.js";
import { NeedsNewVersion, TEXT, isSentNumber, mayRenumber, refusal, saveProblem, sentHandEdited, sentSend } from "../src/features/steps/versand/version.js";
import { todayIso } from "../src/shared/lib/format.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-post.json" with { type: "json" };
import { renderApp } from "./helpers.js";

process.env.TZ = "Europe/Berlin";
type Obj = Record<string, any>;
const KEY = "t-0123456789abcdef01234567", DEAL = "4711", SENT = "ANG2026-1116-093000", NEW = /^ANG\d{4}-\d{4}-\d{6}$/;
const ME = { email: "me@local.test", name: "ME" }, USERS = [{ email: "capture@local.test", name: "Capture" }, ME];
const BASE = (reference.scenarios as unknown as { name: string; offer: Obj }[]).find((s) => s.name === "sent in test mode, dialog closed")!;
/** a complete Badumbau offer for deal 4711 (Kundendaten as recorded for the letter) */
function offerOf(extra: Obj = {}): Obj {
  const o: Obj = structuredClone((reference.bases as unknown as Obj).bu);
  for (const [k, v] of Object.entries(BASE.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); }
  delete o.offerNumber;
  return { ...o, auftragId: DEAL, mail: { ...(o.mail ?? {}), auftragId: DEAL, to: "kunde@example.test", subject: "Ihr Angebot", body: "Guten Tag" }, ...extra };
}
const sentOffer = (extra: Obj = {}) => offerOf({ offerNumber: SENT, zusammenfassung: { versand: { art: "mail", versendetAm: "2026-11-16T09:31:00.000Z" } }, ...extra });
const mailSend = (extra: Obj = {}): Obj => ({ sendId: "send-0001", offerNumber: SENT, dealId: DEAL, status: "done", channel: "email", to: "kunde@example.test", startedAt: "2026-11-16T09:30:00.000Z", finishedAt: "2026-11-16T09:31:00.000Z", files: [{ role: "offer", filename: `${SENT}.pdf`, fileId: "f1" }], steps: {}, ...extra });
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const scratch = () => useOfferStore.getState().scratch as Obj;

// ---- the fake server ----
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refuse = (code: string, message: string, extra: Obj = {}, status = 409) => json({ error: { code, message, requestId: "t" }, ...extra }, status);
interface Srv { draft: Obj; revision: number; sends: Obj[]; put: (() => Response) | null; putBodies: Obj[]; offers: Obj[]; saveOffer: (() => Response) | null; mails: Obj[]; mail: (() => Response)[]; letters: Obj[]; letter: (() => Response)[]; signings: Obj[]; signing: (() => Response)[]; claims: Obj[] }
let srv: Srv;
function server(payload: Obj, sends: Obj[] = []) {
  srv = { draft: payload, revision: 3, sends, put: null, putBodies: [], offers: [], saveOffer: null, mails: [], mail: [], letters: [], letter: [], signings: [], signing: [], claims: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input), method = init.method ?? "GET", path = url.split("?")[0]!;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    if (url === "/api/auth/me") return json({ user: { email: ME.email, name: ME.name, role: "user" } });
    if (url === "/api/users") return json(USERS);
    if (url === `/api/deals/${KEY}/draft` && method === "GET") return json({ dealId: KEY, offerType: "bu", payload: srv.draft, revision: srv.revision, updatedAt: "2026-11-17T10:00:00Z" });
    if (url === `/api/deals/${KEY}/draft` && method === "PUT") { srv.putBodies.push(body); return srv.put ? srv.put() : json({ dealId: KEY, revision: ++srv.revision, changed: true }); }
    if (url === "/api/price") return json({ total: 10, selfPayAmount: 0 });
    if (url === "/api/price/inputs") return json({});
    if (url === `/api/deals/${DEAL}/sends`) return json({ ok: true, sends: srv.sends });
    const of = path.match(/^\/api\/offers\/([^/]+)\/sends$/);
    if (of) return json({ ok: true, sends: srv.sends.filter((s) => s.offerNumber === decodeURIComponent(of[1]!)) });
    if (url === "/api/offer-numbers/claim") { srv.claims.push(body); return json({ ok: true, offerNumber: body.current, changed: false, reason: "reserved" }); }
    if (url === "/api/offers" && method === "POST") { srv.offers.push(body); return srv.saveOffer ? srv.saveOffer() : json({ ok: true }); }
    if (url === "/api/email/send-offer") {
      const fields: Obj = {}; for (const [k, v] of (init.body as FormData).entries()) if (typeof v === "string") fields[k] = v;
      srv.mails.push(fields);
      return (srv.mail.shift() ?? (() => json({ ok: true, attachmentNames: ["ANGEBOT.pdf"], bitrixComment: { ok: true }, offerTotal: 10, selfPayAmount: 0, sendId: fields.sendId })))();
    }
    if (url === "/api/post/config") return json({ mode: "test" });
    if (url === "/api/post/send") { srv.letters.push(body); return (srv.letter.shift() ?? (() => json({ ok: true, mode: "test", printjobId: 9, attachmentCount: 0, bitrix: { ok: true } })))(); }
    if (path.startsWith("/api/signing/status/")) return json([]);
    if (url === "/api/signing" && method === "POST") { srv.signings.push(body); return (srv.signing.shift() ?? (() => json({ link: "/sign/TESTTOKEN", customerType: "Kassenkunde", documents: ["angebot"] }, 201)))(); }
    if (/^\/api\/bitrix\/deal\//.test(path)) return json({ ok: true });
    if (method === "POST" && path === "/docx-template/pdf") return new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="Angebot.pdf"' } });
    if (method === "POST" && /^\/(docx-template|material-overview|kalkulation)/.test(path)) return new Response("doc", { status: 200, headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="doc.bin"' } });
    return json({ error: { code: "NOT_FOUND", message: `kein Handler: ${method} ${url}`, requestId: "t" } }, 404);
  }));
}
beforeEach(() => { for (const k of ["error", "success", "warning", "info"] as const) vi.spyOn(toast, k); vi.spyOn(window, "open").mockImplementation(() => null); });
afterEach(() => vi.restoreAllMocks());

async function open(payload: Obj, sends: Obj[] = []) {
  server(payload, sends);
  renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
  await screen.findByTestId("zf-send");
  if (sends.length) await screen.findByTestId("zf-history"); // the sends of the deal are known
  else await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([u]) => String(u).endsWith("/sends"))).toBe(true));
}
const user = () => userEvent.setup();
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const statusLine = () => { const p = screen.getByTestId("zf-status"); return { sent: p.dataset.sent === "true", text: flat(p.textContent) }; };
const mailStatus = () => Array.from(screen.queryByTestId("zf-send-status")?.querySelectorAll("p") ?? []).map((p) => [p.dataset.type, flat(p.textContent)]);
const stopAt = (place: string) => screen.queryByTestId(`zf-stop-${place}`);
/** the main items that are not in the offer are confirmed one by one, then the send goes on */
async function confirmMain() {
  const d = await screen.findByTestId("zf-main");
  for (const box of within(d).getAllByRole("checkbox")) fireEvent.click(box);
  fireEvent.click(within(d).getByRole("button", { name: "Bestätigt – senden" }));
}
const tapSend = async () => { fireEvent.click(screen.getByTestId("zf-send").querySelector('[data-action="send"]')!); await confirmMain(); };
const tapSign = (via: "mail" | "post" = "mail") => fireEvent.click(screen.getByTestId(`zf-sign-${via}`).querySelector('[data-action="sign"]')!);
const signStatus = (via: "mail" | "post" = "mail") => { const p = screen.getByTestId(`zf-sign-${via}`).querySelector('[data-part="status"]') as HTMLElement | null; return p ? [p.dataset.type, flat(p.querySelector('[data-part="text"]')?.textContent)] : null; };
async function toPost() { await user().click(screen.getByRole("tab", { name: /Per Post/ })); await screen.findByTestId("zf-post"); }
const tapPost = async () => { fireEvent.click(screen.getByTestId("zf-post").querySelector('[data-action="post"]')!); await confirmMain(); };
const postStatus = () => { const p = screen.queryByTestId("zf-post-status"); return p ? [p.dataset.type, flat(p.textContent)] : null; };
/** something was typed since the last save */
const typed = () => useOfferStore.getState().patch("Kundendaten" as never, { notes: "geändert auf diesem Gerät" } as never);

describe("F6 — \"Neue Version erstellen\"", () => {
  it("a sent offer offers the action at its status line; an unsent one does not", async () => {
    await open(sentOffer(), [mailSend()]);
    expect(statusLine().sent).toBe(true);
    const box = screen.getByTestId("zf-new-version");
    expect(within(box).getByRole("button", { name: "Neue Version erstellen" })).toBeTruthy();
    expect(flat(box.querySelector('[data-part="hint"]')?.textContent)).toBe(TEXT.sentHint);
  });
  it("an offer that was never sent has no such action", async () => {
    await open(offerOf({ offerNumber: SENT }));
    expect(statusLine()).toEqual({ sent: false, text: "Noch nicht versendet." });
    expect(screen.queryByTestId("zf-new-version")).toBeNull();
  });
  it("sent as the deal's sends say (the offer itself lost the mark): offered too", async () => {
    await open(offerOf({ offerNumber: SENT }), [mailSend({ channel: "post" })]);
    expect(await screen.findByTestId("zf-new-version")).toBeTruthy();
  });

  it("the action makes the open offer a fresh, unsent one — the sent offer and its record stay as they are", async () => {
    await open(sentOffer({ Kundendaten: { ...sentOffer().Kundendaten, date: "2026-11-16", emc2_contact: "Capture", ansprechpartner: "capture@local.test" } }), [mailSend()]);
    useOfferStore.getState().remember("postSent", true); useOfferStore.getState().remember("sendStatus", { type: "success", text: "E-Mail gesendet" });
    await user().click(within(screen.getByTestId("zf-new-version")).getByRole("button", { name: "Neue Version erstellen" }));
    await waitFor(() => expect(offer().offerNumber).not.toBe(SENT));
    const number = String(offer().offerNumber);
    expect(number).toMatch(NEW);
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Neue Version erstellt", { description: `${number} – das versendete Angebot ${SENT} bleibt unverändert gespeichert.` }));
    // a new, registered number
    expect(srv.claims.map((c) => c.current)).toEqual([number]);
    // not sent: the status line says so, the action is gone
    expect(offer().zusammenfassung?.versand).toBeUndefined();
    expect(statusLine()).toEqual({ sent: false, text: "Noch nicht versendet." });
    await waitFor(() => expect(screen.queryByTestId("zf-new-version")).toBeNull());
    // the signed-in user's document now, dated today (as today's "Neue Version erstellen")
    expect(offer().Kundendaten).toMatchObject({ emc2_contact: "ME", ansprechpartner: "me@local.test", date: todayIso() });
    // what the last send left on the page is gone
    expect(scratch().postSent).toBe(false);
    expect(scratch().sendStatus).toBeNull();
    // the draft of the deal holds the new version
    const saved = srv.putBodies.at(-1)!;
    expect(saved.payload.offerNumber).toBe(number);
    expect(saved.payload.zusammenfassung?.versand).toBeUndefined();
    // nothing was written to the sent offer: no save under any number, no send
    expect(srv.offers).toEqual([]);
    expect(srv.mails).toEqual([]);
    // the history is per deal: the send is still there, now named by its number
    const row = within(await screen.findByTestId("zf-history")).getByTestId("zf-history-row");
    await waitFor(() => expect(flat(row.querySelector('[data-part="offer"]')?.textContent)).toBe(`Angebot ${SENT}`));
  });

  it("mail refused (sent and changed since): the message, the action right below it, and the new version goes out", async () => {
    await open(sentOffer(), [mailSend()]);
    srv.mail.push(() => refuse("OFFER_CHANGED", "Das Angebot wurde geändert.", { differences: ["Kundendaten"] }));
    await tapSend();
    await waitFor(() => expect(mailStatus().at(-1)).toEqual(["error", `Senden fehlgeschlagen: ${SEND.offerChanged}`]));
    const stop = stopAt("mail")!;
    expect(stop.dataset.stop).toBe("new-version");
    await user().click(within(stop).getByRole("button", { name: "Neue Version erstellen" }));
    await waitFor(() => expect(offer().offerNumber).not.toBe(SENT));
    await waitFor(() => expect(stopAt("mail")).toBeNull());
    expect(screen.queryByTestId("zf-send-status")).toBeNull();
    await tapSend();
    await screen.findByTestId("zf-sent");
    expect(srv.mails).toHaveLength(2);
    expect(srv.mails[1]!.offerNumber).toBe(offer().offerNumber);
    expect(JSON.parse(srv.mails[1]!.payload).zusammenfassung?.versand).toBeUndefined();
  });

  it("letter refused and the original not wanted: the action below the message", async () => {
    await open(sentOffer(), [mailSend()]);
    await toPost();
    srv.letter.push(() => refuse("OFFER_CHANGED", "Das Angebot wurde geändert.", { differences: ["Kundendaten"], sent: { at: "2026-11-16T09:31:00.000Z" } }));
    await tapPost();
    fireEvent.click(within(await screen.findByTestId("zf-ask")).getByRole("button", { name: "Per Post senden" })); // sent before: post it?
    await waitFor(() => expect(flat(screen.queryByTestId("zf-ask")?.querySelector("h3")?.textContent)).toBe("Das geöffnete Angebot weicht vom versendeten ab"));
    fireEvent.click(within(screen.getByTestId("zf-ask")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(postStatus()).toEqual(["error", SEND.offerChanged]));
    expect(within(stopAt("post")!).getByRole("button", { name: "Neue Version erstellen" })).toBeTruthy();
    expect(srv.letters).toHaveLength(1);
  });
  it("letter: the server has no original to post (its second answer refuses): said with the action, not as a plain failure", async () => {
    await open(sentOffer(), [mailSend()]);
    await toPost();
    srv.letter.push(() => refuse("OFFER_CHANGED", "Das Angebot wurde geändert.", { differences: ["Kundendaten"] }), () => refuse("OFFER_CHANGED", "Kein gespeichertes Original."));
    await tapPost();
    fireEvent.click(within(await screen.findByTestId("zf-ask")).getByRole("button", { name: "Per Post senden" }));
    fireEvent.click(await screen.findByRole("button", { name: "Original per Post senden" }));
    await waitFor(() => expect(postStatus()).toEqual(["error", SEND.offerChanged]));
    expect(stopAt("post")?.dataset.stop).toBe("new-version");
  });

  it("signing refused (sent or signed and changed since): the action below the message, on the tab it was started from", async () => {
    await open(sentOffer(), [mailSend()]);
    srv.saveOffer = () => refuse("OFFER_CHANGED", "Das Angebot wurde geändert.");
    tapSign("mail"); await confirmMain();
    await waitFor(() => expect(signStatus("mail")).toEqual(["error", SIGN.offerChanged]));
    expect(within(stopAt("sign-mail")!).getByRole("button", { name: "Neue Version erstellen" })).toBeTruthy();
    expect(srv.signings).toEqual([]);
  });
  it("signing refused by the signing request itself: the same", async () => {
    await open(sentOffer(), [mailSend()]);
    srv.signing.push(() => refuse("OFFER_CHANGED", "Das Angebot wurde geändert."));
    tapSign("mail"); await confirmMain();
    await waitFor(() => expect(signStatus("mail")).toEqual(["error", SIGN.offerChanged]));
    expect(stopAt("sign-mail")?.dataset.stop).toBe("new-version");
  });
});

describe("F7 — the deal's draft could not be saved: nothing is sent", () => {
  const conflict = () => refuse("DRAFT_CONFLICT", "Der Entwurf wurde an anderer Stelle geändert.", { revision: 9 });

  it("mail, draft changed on another device: stopped with the reason; the newer state can be loaded", async () => {
    await open(offerOf({ offerNumber: SENT }));
    typed(); srv.put = conflict;
    await tapSend();
    await waitFor(() => expect(mailStatus()).toHaveLength(1));
    const [kind, text] = mailStatus()[0]!;
    expect(kind).toBe("error");
    expect(text).toContain("Es wurde nichts gesendet.");
    expect(text).toContain("an anderer Stelle geändert");
    expect(srv.mails).toEqual([]); // nothing went out
    expect(srv.offers).toEqual([]);
    const stop = stopAt("mail")!;
    expect(stop.dataset.stop).toBe("conflict");
    // the other device's state replaces this one
    srv.draft = offerOf({ offerNumber: SENT, Kundendaten: { ...offerOf().Kundendaten, lastName: "Vom-anderen-Gerät" } }); srv.revision = 9; srv.put = null;
    await user().click(within(stop).getByRole("button", { name: "Neueren Stand laden" }));
    await waitFor(() => expect(offer().Kundendaten.lastName).toBe("Vom-anderen-Gerät"));
    expect(offer().Kundendaten.notes).not.toBe("geändert auf diesem Gerät");
    expect(useOfferStore.getState().revision).toBe(9);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(TEXT.reloaded);
    await waitFor(() => expect(stopAt("mail")).toBeNull());
    // and now the send goes through, from the state the deal has
    await tapSend();
    await screen.findByTestId("zf-sent");
    expect(JSON.parse(srv.mails[0]!.payload).Kundendaten.lastName).toBe("Vom-anderen-Gerät");
  });

  it("mail, the save fails: stopped with the reason; trying again sends once the save works", async () => {
    await open(offerOf({ offerNumber: SENT }));
    typed(); srv.put = () => refuse("DB_DOWN", "Die Datenbank ist nicht erreichbar.", {}, 503);
    await tapSend();
    await waitFor(() => expect(mailStatus()).toHaveLength(1));
    expect(mailStatus()[0]).toEqual(["error", "Es wurde nichts gesendet. Das Angebot konnte nicht gespeichert werden (Die Datenbank ist nicht erreichbar.). Bitte prüfen Sie die Verbindung und versuchen Sie es erneut."]);
    expect(srv.mails).toEqual([]);
    expect(stopAt("mail")).toBeNull(); // nothing to load: the way on is to try again
    srv.put = null;
    await tapSend();
    await screen.findByTestId("zf-sent");
    expect(srv.mails).toHaveLength(1);
    expect(JSON.parse(srv.mails[0]!.payload).Kundendaten.notes).toBe("geändert auf diesem Gerät");
    expect(srv.putBodies.at(-1)!.payload.Kundendaten.notes).toBe("geändert auf diesem Gerät"); // the deal holds what went out
  });

  it("no connection at all: stopped as well", async () => {
    await open(offerOf({ offerNumber: SENT }));
    typed(); srv.put = () => { throw new TypeError("Failed to fetch"); };
    await tapSend();
    await waitFor(() => expect(mailStatus()).toHaveLength(1));
    expect(mailStatus()[0]![1]).toContain("Es wurde nichts gesendet. Das Angebot konnte nicht gespeichert werden");
    expect(srv.mails).toEqual([]);
  });

  it("letter: a refused save stops before anything is made or posted", async () => {
    await open(offerOf({ offerNumber: SENT }));
    await toPost();
    typed(); srv.put = conflict;
    await tapPost();
    await waitFor(() => expect(postStatus()?.[0]).toBe("error"));
    expect(postStatus()![1]).toContain("Es wurde kein Brief gesendet.");
    expect(srv.letters).toEqual([]);
    expect(stopAt("post")?.dataset.stop).toBe("conflict");
    expect(scratch().postSent).not.toBe(true); // the button is not locked: nothing went out
  });

  it("signing: a refused save stops before the offer is stored or the signing view asked for", async () => {
    await open(offerOf({ offerNumber: SENT }));
    typed(); srv.put = conflict;
    tapSign("mail"); await confirmMain();
    await waitFor(() => expect(signStatus("mail")?.[0]).toBe("error"));
    expect(signStatus("mail")![1]).toContain("Die Unterschrift wurde nicht gestartet.");
    expect(srv.offers).toEqual([]);
    expect(srv.signings).toEqual([]);
    expect(stopAt("sign-mail")?.dataset.stop).toBe("conflict");
  });

  it("nothing unsaved: the send is not held up", async () => {
    await open(offerOf({ offerNumber: SENT }));
    await tapSend();
    await screen.findByTestId("zf-sent");
    expect(srv.mails).toHaveLength(1);
  });
});

describe("F4 — an offer that went out with a hand-edited Word file", () => {
  const edited = () => mailSend({ files: [{ role: "editedDocx", filename: "Angebot_bearbeitet.docx", fileId: "f0" }, { role: "offer", filename: `${SENT}.pdf`, fileId: "f1" }] });

  it("signing on site is stopped before anything is asked or saved, with the action", async () => {
    await open(sentOffer(), [edited()]);
    tapSign("mail");
    await waitFor(() => expect(signStatus("mail")).toEqual(["error", TEXT.handEditedSent]));
    expect(screen.queryByTestId("zf-main")).toBeNull();
    expect(srv.offers).toEqual([]);
    expect(srv.signings).toEqual([]);
    expect(within(stopAt("sign-mail")!).getByRole("button", { name: "Neue Version erstellen" })).toBeTruthy();
  });
  it("the same from the Post tab", async () => {
    await open(sentOffer(), [edited()]);
    await toPost();
    tapSign("post");
    await waitFor(() => expect(signStatus("post")).toEqual(["error", TEXT.handEditedSent]));
    expect(srv.signings).toEqual([]);
  });
  it("a standard mail after it, or a hand-edited mail of another number: signing goes on", async () => {
    await open(sentOffer(), [mailSend({ sendId: "send-0002", finishedAt: "2026-11-16T12:00:00.000Z" }), { ...edited(), offerNumber: "ANG2026-0101-000000" }]);
    tapSign("mail"); await confirmMain();
    await waitFor(() => expect(srv.signings).toHaveLength(1));
  });
  it("known from the mail's own answer (no link to sign online): signing right after is stopped", async () => {
    await open(offerOf({ offerNumber: SENT }));
    srv.mail.push(() => json({ ok: true, attachmentNames: ["ANGEBOT.pdf"], bitrixComment: { ok: true }, offerTotal: 10, signingLink: "off-hand-edited" }));
    await tapSend();
    fireEvent.click(within(await screen.findByTestId("zf-sent")).getByRole("button", { name: "Schließen" }));
    srv.offers = [];
    tapSign("mail");
    await waitFor(() => expect(signStatus("mail")).toEqual(["error", TEXT.handEditedSent]));
    expect(srv.signings).toEqual([]);
    expect(srv.offers).toEqual([]);
  });
  it("the server refuses the signing (HAND_EDITED_SENT) where the page did not know: its reason, with the action", async () => {
    await open(sentOffer(), [mailSend()]);
    srv.signing.push(() => refuse("HAND_EDITED_SENT", "Dieses Angebot wurde mit einem von Hand bearbeiteten Dokument versendet."));
    tapSign("mail"); await confirmMain();
    await waitFor(() => expect(signStatus("mail")).toEqual(["error", TEXT.handEditedSent]));
    expect(stopAt("sign-mail")?.dataset.stop).toBe("new-version");
  });
  it("the server refuses a resend from the form data (HAND_EDITED_SENT): the reason, with the action", async () => {
    await open(sentOffer(), [edited()]);
    srv.mail.push(() => refuse("HAND_EDITED_SENT", "Dieses Angebot wurde mit einem von Hand bearbeiteten Dokument versendet."));
    await tapSend();
    await waitFor(() => expect(mailStatus().at(-1)).toEqual(["error", `Senden fehlgeschlagen: ${TEXT.handEditedSent}`]));
    expect(stopAt("mail")?.dataset.stop).toBe("new-version");
  });
  it("the same refusal after the \"already sent\" question was answered with yes", async () => {
    await open(sentOffer(), [edited()]);
    srv.mail.push(() => refuse("ALREADY_SENT", "Bereits gesendet.", { lastSentAt: "2026-11-16T09:31:00.000Z", lastOfferNumber: SENT }), () => refuse("HAND_EDITED_SENT", "…"));
    await tapSend();
    fireEvent.click(within(await screen.findByTestId("zf-ask")).getByRole("button", { name: "Ja, noch einmal senden" }));
    await waitFor(() => expect(mailStatus().at(-1)).toEqual(["error", `Senden fehlgeschlagen: ${TEXT.handEditedSent}`]));
    expect(stopAt("mail")?.dataset.stop).toBe("new-version");
  });
});

describe("the rules", () => {
  const sends = [{ offerNumber: "A", status: "failed", channel: "email" }, { offerNumber: "A", status: "done", channel: "bitrix" }, { offerNumber: "B", status: "done", channel: "onsite" }, { offerNumber: "C", status: "running", channel: "post" }];
  it("a number is sent when a send under it reached the customer, or the offer says so", () => {
    expect(sentSend(sends, "A")).toBeNull(); // a failed mail and a filing only
    expect(sentSend(sends, "B")?.channel).toBe("onsite");
    expect(sentSend(sends, "C")).toBeNull();
    expect(sentSend(sends, "")).toBeNull();
    expect(isSentNumber({ offerNumber: "A" }, sends)).toBe(false);
    expect(isSentNumber({ offerNumber: "B" }, sends)).toBe(true);
    expect(isSentNumber({ offerNumber: "A", zusammenfassung: { versand: { art: "post", versendetAm: "2026-11-16T09:31:00.000Z" } } }, [])).toBe(true);
    expect(isSentNumber({ zusammenfassung: { versand: { art: "post", versendetAm: "2026-11-16T09:31:00.000Z" } } }, [])).toBe(false); // no number: nothing to protect
  });
  it("a download may renumber: no number yet, or a number known as not sent", () => {
    expect(mayRenumber({}, undefined)).toBe(true);
    expect(mayRenumber({ offerNumber: "A" }, sends)).toBe(true);
    expect(mayRenumber({ offerNumber: "B" }, sends)).toBe(false);
    expect(mayRenumber({ offerNumber: "A" }, undefined)).toBe(false); // sends not known: kept
  });
  it("hand-edited: the last mail under the number kept an edited Word file", () => {
    const docx = { role: "editedDocx" };
    expect(sentHandEdited([{ offerNumber: "A", status: "done", channel: "email", files: [docx] }], "A")).toBe(true);
    expect(sentHandEdited([{ offerNumber: "A", status: "done", channel: "email", files: [] }, { offerNumber: "A", status: "done", channel: "email", files: [docx] }], "A")).toBe(false); // newest first: a standard mail went out last
    expect(sentHandEdited([{ offerNumber: "A", status: "done", channel: "email", files: [docx] }], "B")).toBe(false);
    expect(sentHandEdited(undefined, "A")).toBe(false);
  });
  it("the server's refusals of a sent offer, and what a save says", () => {
    expect(refusal("OFFER_CHANGED", "x")).toBeInstanceOf(NeedsNewVersion);
    expect(refusal("OFFER_CHANGED", "x")!.message).toBe("x");
    expect(refusal("HAND_EDITED_SENT", "x")!.message).toBe(TEXT.handEditedSent);
    expect(refusal("ALREADY_SENT", "x")).toBeNull();
    expect(saveProblem({ state: "idle" }, "N.")).toBeNull();
    expect(saveProblem({ state: "saved", at: new Date() }, "N.")).toBeNull();
    expect(saveProblem({ state: "conflict" }, "N.")?.stop).toBe("conflict");
    expect(saveProblem({ state: "failed", message: "" }, "N.")).toEqual({ stop: null, text: "N. Das Angebot konnte nicht gespeichert werden. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut." });
  });
});
