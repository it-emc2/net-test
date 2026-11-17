// "Angebot per Post senden" must do what today's UI does: the same two tabs, the same address with
// its filling from Kundendaten and its warning, the same list of what the letter holds, the same
// checks and questions before the send, the same request, the same messages, the same dialog
// after it, and store the same. Reference: fixtures/versand-post.json, recorded from today's UI by
// v2/scripts/capture-versand-post.cjs (every route answered there as here; no letter is sent).
// On purpose different, matched below as such: a field marked as missing loses its mark once it is filled (today
// only with the next send), a document that cannot be made is named in words, and the send guard of v2 (sendId, the offer itself) is part of the send.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { ADDRESS, alreadySent, changedQuestion, filled, invalid, liveQuestion, missing, priorQuestion, priorSend, sentText, statics, uploadSize, withBalance, type Recipient } from "../src/features/steps/versand/post-rules.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-post.json" with { type: "json" };
import { renderApp } from "./helpers.js";

process.env.TZ = "Europe/Berlin"; // the recordings show times as the office sees them

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface Tile { name: string; meta: string; fixed?: boolean }
interface FieldView { label: string; value: string; invalid: boolean }
interface PostView { shown: boolean; title: string; warning: string; fields: Record<string, FieldView>; files: Tile[]; listTitle: string; hint: string; send: { label: string; disabled: boolean }; status: { type: string; text: string } | null }
interface View {
  tab: string; tabs: string[]; post: PostView; attachments: Tile[];
  release: { title: string; text: string; note: string; placeholder: string; buttons: string[] } | null;
  live: { title: string; texts: string[]; buttons: string[] } | null;
  hp: Obj | null; ask: { title: string; message: string; ok: string; cancel: string } | null; stage: { title: string; text: string; body: string; buttons: { label: string; disabled: boolean }[] } | null; versand: string; note: string | null;
}
interface Act { act: string[]; requests: Obj[]; toasts: string[][]; alerts: string[]; stored: Obj; view: View }
interface Scenario { name: string; type: string; offer: Obj; pre: string[][]; answers: [string, number, Obj][]; view: View; acts: Act[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;
const FILES = reference.files as unknown as Record<string, [string, string, string] | null>;
const NUM = /ANG\d{4}-\d{4}-\d{6}/g, NUMBER = "ANG2026-1116-093000";
const mask = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null).replace(NUM, "<number>").replace(/upload-\d+-[a-z0-9]+/g, "upload-<id>"));
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const tight = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return JSON.parse(JSON.stringify(o).replace(NUM, NUMBER)); };
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const FILE_BODY: Record<string, [string, string]> = { "Grundriss.pdf": ["application/pdf", "%PDF-1.4 plan"], "Notiz.txt": ["text/plain", "Notiz"], "Aufmass.pdf": ["application/pdf", "%PDF-1.4 aufmass"] };
const fileOf = (name: string) => new File([FILE_BODY[name]![1]], name, { type: FILE_BODY[name]![0] });
const text64 = (b64: unknown) => { try { return new TextDecoder().decode(Uint8Array.from(atob(String(b64 || "")), (c) => c.charCodeAt(0))).slice(0, 40); } catch { return ""; } };
const unicon = (s: string) => s.replace(/^✅ /, "");
const clock = (s: string) => s.replace(/am \d\d\.\d\d\.\d{4} um \d\d:\d\d Uhr/, "am <date> um <time> Uhr");

// ---- the fake server ----
let seen: Obj[] = [], answers: Record<string, [number, Obj][]> = {}, before: Obj = {}, mode = "test", total = 10, selfPay = 0, sends: Obj[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** today's answer shapes → the server's own (v2: { error: { code, message } } and the extras beside it) */
const v2 = (status: number, body: Obj) => (status < 400 ? json(body, status) : json({ ...body, ok: false, error: { code: body.code ?? "FAILED", message: String(body.error ?? ""), requestId: "t" }, code: undefined }, status));
function server(s: Scenario, payload: Obj) {
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input), method = init.method ?? "GET", path = url.split("?")[0]!;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    const answer = (k: string) => { const a = answers[k]?.shift(); return a ? v2(a[0], a[1]) : null; };
    if (url === "/api/auth/me") return json({ user: { email: "capture@local.test", name: "Capture", role: "user" } });
    if (url === "/api/users") return json(reference.users);
    if (url === `/api/deals/${KEY}/draft` && method === "GET") return json({ dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" });
    if (url === `/api/deals/${KEY}/draft` && method === "PUT") return json({ dealId: KEY, revision: 4, changed: true });
    if (url === "/api/price") return json({ total, selfPayAmount: selfPay });
    if (url === "/api/price/inputs") return json({});
    if (url === "/api/post/config") { seen.push({ path: url }); return answer(url) ?? json({ ok: true, mode }); }
    if (url === "/api/post/balance") { seen.push({ path: url }); return answer(url) ?? json({ ok: true, balance: 42.5, currency: "EUR" }); }
    if (url === "/api/auth/confirm-password") { seen.push({ path: url, keys: Object.keys(body) }); return answer(url) ?? json({ ok: true, email: "capture@local.test", name: "Capture" }); }
    if (/^\/api\/offers\/[^/]+\/sends$/.test(path)) return json({ ok: true, sends });
    if (url === "/api/offers" && method === "POST") { seen.push({ path: url, offerNumber: mask(body.offerNumber), offerType: body.offerType, payload: Object.keys(changed(before, body.payload ?? {})) }); return json({ ok: true }); }
    if (url === "/api/post/send") {
      const { document: doc, attachments = [], bitrixDocs = [], sendId, payload: p, useSentOriginal, ...rest } = body as Obj;
      seen.push({ path: url, body: mask(rest), document: { filename: mask(doc?.filename), content: text64(doc?.base64) },
        attachments: attachments.map((a: Obj) => ({ type: a.type, ...(a.id ? { id: a.id } : {}), filename: a.filename, ...(a.base64 ? { content: text64(a.base64) } : {}) })),
        bitrixDocs: bitrixDocs.map((d: Obj) => mask(d.filename)), guard: { sendId: /^[0-9a-f-]{36}$/.test(String(sendId)), offer: useSentOriginal ? "original" : p && typeof p === "object" ? "open" : "none" } });
      return answer(url) ?? json({ ...(reference.posted as Obj), mode, attachmentCount: attachments.length, attachmentNames: [doc?.filename, ...attachments.map((a: Obj) => a.filename)], sendId });
    }
    const bx = path.match(/^\/api\/bitrix\/deal\/([^/]+)\/(.+)$/);
    if (bx && method === "POST") { seen.push({ path: `/api/bitrix/deal/<id>/${bx[2]}`, deal: bx[1], body: mask(body) }); return json({ ok: true }); }
    if (method === "POST" && path in FILES) {
      seen.push({ path: url, sent: Object.keys(changed(before, body)) });
      const a = answer(path); if (a) return a;
      const f = FILES[path];
      return f ? new Response(f[2], { status: 200, headers: { "content-type": f[0], "content-disposition": `attachment; filename="${f[1]}"` } }) : new Response(null, { status: 204 });
    }
    return json({ error: { code: "NOT_FOUND", message: `kein Handler: ${method} ${url}`, requestId: "t" } }, 404);
  }));
}
beforeEach(() => {
  seen = []; answers = {}; mode = "test"; total = 10; selfPay = 0; sends = [];
  for (const k of ["error", "success", "warning", "info"] as const) vi.spyOn(toast, k);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// ---- what the page shows ----
const part = (el: Element | null | undefined, name: string) => flat(el?.querySelector(`[data-part="${name}"]`)?.textContent);
const tiles = (sec: Element): Tile[] => Array.from(sec.querySelectorAll('[data-testid="zf-mail-file"]')).map((t) => ({ name: part(t, "name"), meta: part(t, "meta"), fixed: !!t.querySelector('[data-part="fixed"]') }));
const FIELD: Record<string, string> = { deal: "zf-post-deal", ...Object.fromEntries(ADDRESS.map((f) => [f, `zf-post-${f}`])) };
const buttons = (el: Element) => Array.from(el.querySelectorAll<HTMLButtonElement>(":scope > div:last-child button"));
function shown() {
  const post = screen.getByTestId("zf-post"), panel = document.getElementById("zf-panel-post")!, files = screen.getByTestId("zf-post-files");
  const send = post.querySelector<HTMLButtonElement>('[data-action="post"]')!, st = screen.queryByTestId("zf-post-status");
  const release = screen.queryByTestId("zf-post-release"), live = screen.queryByTestId("zf-post-live"), sent = screen.queryByTestId("zf-sent");
  return mask({
    tab: screen.getAllByRole("tab", { hidden: true }).find((t) => t.getAttribute("aria-selected") === "true")!.id.replace("zf-tab-", ""),
    mailShown: !document.getElementById("zf-panel-mail")!.hidden,
    post: {
      shown: !panel.hidden, warning: panel.hidden ? "" : flat(screen.queryByTestId("zf-post-warning")?.textContent), // today's warning is only drawn on the open tab
      fields: Object.fromEntries(Object.entries(FIELD).map(([k, id]) => { const el = document.getElementById(id) as HTMLInputElement; return [k, { value: el.value, invalid: el.getAttribute("aria-invalid") === "true" }]; })),
      files: tiles(files), send: { label: part(send, "label"), disabled: send.disabled },
      status: st ? { type: st.dataset.type === "warning" ? "warn" : st.dataset.type!, text: part(st, "text") } : null,
    },
    mailFiles: tiles(screen.getByTestId("zf-mail-files")).map((t) => t.name),
    release: release ? { title: flat(release.querySelector("h3")?.textContent), text: tight(part(release, "text")), note: part(release, "note"), buttons: buttons(release).map((b) => flat(b.textContent)).sort() } : null,
    live: live ? { title: flat(live.querySelector("h3")?.textContent), texts: Array.from(live.querySelectorAll('[data-part="text"]')).map((p) => tight(p.textContent)), buttons: buttons(live).map((b) => flat(b.textContent)).sort() } : null,
    ask: (() => { const q = screen.queryByTestId("zf-ask"); return q ? { title: flat(q.querySelector("h3")?.textContent), message: part(q, "message"), ok: flat(q.querySelectorAll("button")[1]?.textContent), cancel: flat(q.querySelectorAll("button")[0]?.textContent) } : null; })(),
    hp: !!screen.queryByTestId("zf-main"),
    stage: sent ? { title: flat(sent.querySelector("h3")?.textContent), text: part(sent, "text"), body: part(sent, "body"), buttons: buttons(sent).map((b) => ({ label: flat(b.textContent), disabled: b.disabled })) } : null,
    versand: clock(flat(screen.getByTestId("zf-status").textContent)),
    note: (screen.getByLabelText(/Interne Notiz/) as HTMLTextAreaElement).value,
  });
}
/** the recording, in the words and marks of the React page */
function expected(v: View) {
  const p = v.post;
  return {
    tab: v.tab, mailShown: v.tab === "mail",
    post: {
      // today's warning is not drawn again when Kundendaten fills a field: it then names a field that is filled (not copied)
      shown: p.shown, warning: ADDRESS.every((f) => p.fields[f]!.value.trim()) ? "" : p.warning,
      fields: Object.fromEntries(Object.entries(p.fields).map(([k, f]) => [k, { value: f.value, invalid: f.invalid && !f.value.trim() }])), // a mark goes once the field is filled
      files: p.files, send: p.send, status: p.status,
    },
    mailFiles: v.attachments.map((t) => t.name),
    release: v.release ? { title: v.release.title, text: tight(v.release.text), note: v.release.note, buttons: [...v.release.buttons].sort() } : null,
    live: v.live ? { title: v.live.title, texts: v.live.texts.map(tight), buttons: [...v.live.buttons].sort() } : null,
    ask: v.ask ? { ...v.ask, message: v.ask.message.replace(/(\d\d:\d\d):\d\d/, "$1:00") } : null,
    hp: !!v.hp,
    stage: v.stage ? { ...v.stage, title: unicon(v.stage.title), body: unicon(v.stage.body) } : null,
    versand: clock(unicon(v.versand)), note: v.note,
  };
}

async function act(a: string[], user: ReturnType<typeof userEvent.setup>) {
  const [kind, x, y] = a;
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  if (kind === "tab") await user.click(document.getElementById(`zf-tab-${x}`)!);
  else if (kind === "deal") fireEvent.change(screen.getByLabelText("Lead ID / Auftrag ID", { selector: "#zf-mail-deal" }), { target: { value: x } });
  else if (kind === "pfield") fireEvent.change(field(x === "AuftragId" ? "zf-post-deal" : FIELD[{ FirstName: "firstName", LastName: "lastName", Street: "street", Zip: "zipCode", City: "city", Country: "country" }[x!]!]!), { target: { value: y } });
  else if (kind === "kfield") useOfferStore.getState().patch("Kundendaten" as never, { [x!]: y } as never); // typed on the Kundendaten step
  else if (kind === "pfile") await user.upload(field("zf-post-add"), fileOf(x!));
  else if (kind === "premove") await user.click(within(screen.getByTestId("zf-post-files")).getByRole("button", { name: `${x} entfernen` }));
  else if (kind === "doc") await user.click(screen.getByTestId("zf-docs").querySelector<HTMLElement>(`#zf-doc-${x}`)!);
  else if (kind === "note") fireEvent.change(screen.getByLabelText(/Interne Notiz/), { target: { value: x } });
  else if (kind === "psend") { const b = screen.getByTestId("zf-post").querySelector<HTMLButtonElement>('[data-action="post"]')!; if (!b.disabled) await user.click(b); }
  else if (kind === "pw") {
    const box = await screen.findByTestId("zf-post-release");
    if (x === "ok") { await user.type(within(box).getByLabelText("Passwort"), "nur-ein-test"); await user.click(within(box).getByRole("button", { name: "Freigeben und senden" })); }
    else await user.click(within(box).getByRole("button", { name: "Abbrechen" }));
  } else if (kind === "live") await user.click(within(await screen.findByTestId("zf-post-live")).getByRole("button", { name: x === "ok" ? "Verbindlich senden" : "Abbrechen" }));
  else if (kind === "hp") {
    const main = await screen.findByTestId("zf-main");
    if (x === "all") { for (const b of within(main).getAllByRole("checkbox")) await user.click(b); await user.click(within(main).getByRole("button", { name: "Bestätigt – senden" })); }
    else await user.click(within(main).getByRole("button", { name: "Zurück" }));
  } else if (kind === "confirm") await user.click(within(await screen.findByTestId("zf-ask")).getAllByRole("button")[x === "yes" ? 1 : 0]!);
  else if (kind === "move") await user.click(within(await screen.findByTestId("zf-sent")).getByRole("button", { name: /ANG verschickt/ }));
  else if (kind === "close") await user.click(within(await screen.findByTestId("zf-sent")).getByRole("button", { name: "Schließen" }));
  else throw new Error(`act not handled: ${kind}`);
}
/** what the recording set up without an act of its own: the printer's mode */
const liveMode = (s: Scenario) => s.name.startsWith("live:");

describe("the letter does what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    server(s, offerOf(s));
    mode = liveMode(s) ? "live" : "test";
    const moved = s.acts.flatMap((a) => a.requests).find((r) => String(r.path).endsWith("/move-ang-verschickt"));
    if (moved) { total = Number(moved.body.opportunity) || total; selfPay = Number(moved.body.selfPayAmount) || 0; } // today's page takes both from its own price
    for (const [path, status, body] of s.answers) (answers[path] ??= []).push([status, body]);
    renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
    await screen.findByTestId("zf-post");
    const user = userEvent.setup({ applyAccept: false });
    for (const p of s.pre) await act(p, user);
    await waitFor(() => expect(shown()).toEqual(expected(s.view)));
    for (const a of s.acts) {
      seen = []; before = structuredClone(offer());
      for (const m of ["error", "success", "warning", "info"] as const) vi.mocked(toast[m]).mockClear();
      await act(a.act, user);
      const want = a.requests.filter((r) => r.path !== "/api/drafts").map((r) => {
        // a document that cannot be made is named in words (today: the server's raw answer)
        if (r.path === "/api/post/send") return { ...r, body: { ...r.body, docWarnings: (r.body.docWarnings as string[]).map((w) => w.replace(/^(.+ konnte nicht erzeugt werden: )\S+ \(\d+\): \{"error":"([^"]*)"\}$/, "$1$2")) }, guard: { sendId: true, offer: "open" } };
        if (r.sent) return { path: r.path, sent: Object.keys(r.sent) };
        if (r.path === "/api/offers") return { ...r, payload: Object.keys(r.payload) };
        return r;
      });
      await waitFor(() => expect(mask(seen)).toEqual(mask(want)), { timeout: 3000 });
      await waitFor(() => expect(shown()).toEqual(expected(a.view)));
      const toasts = (["error", "success", "warning", "info"] as const).flatMap((m) => vi.mocked(toast[m]).mock.calls.map((c) => [m === "warning" ? "warn" : m, String(c[0]), String((c[1] as Obj | undefined)?.description ?? "")]));
      expect(mask(toasts).sort()).toEqual(mask(a.toasts).sort());
      // stored: today's page writes the Checkliste defaults along with the send state; here only what the send says
      // (today's page also works out the Arbeitszeit totals again in passing — not part of the letter)
      const stored = mask(changed(before, offer())), { zusammenfassung: z, Arbeitszeit: _a, ...rest } = a.stored;
      if (z) expect(stored.zusammenfassung?.versand?.art).toBe(z.versand.art);
      const { zusammenfassung: _z, ...mine } = stored;
      expect(mine).toEqual(mask(rest));
    }
  });
});

describe("the letter — rules and what goes beyond the recordings", () => {
  const R: Recipient = { firstName: "Erika", lastName: "Muster", street: "Musterweg 4", zipCode: "95028", city: "Hof", country: "Deutschland" };
  const ready = SCENARIOS.find((s) => s.name === "sent in test mode, dialog closed")!;
  const open = async () => {
    server(ready, offerOf(ready));
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByTestId("zf-post");
    const user = userEvent.setup();
    for (const p of ready.pre) await act(p, user);
    return user;
  };
  const sendAll = async (user: ReturnType<typeof userEvent.setup>) => { await act(["psend"], user); await act(["hp", "all"], user); };

  it("an empty field is filled from Kundendaten, a filled one is kept; the country is Deutschland unless said", () => {
    const o = { Kundendaten: { firstName: " Erika ", lastName: "Muster", street: "Musterweg 4", postalCode: "95028", city: "Hof" }, postal: { recipient: { street: "Andere Str. 5", city: " " } } };
    expect(filled(o)).toEqual({ firstName: "Erika", lastName: "Muster", street: "Andere Str. 5", zipCode: "95028", city: "Hof", country: "Deutschland" });
    expect(filled({ Kundendaten: { country: "Österreich" } }).country).toBe("Österreich");
  });

  it("the warning names what is missing; the country stops the send but is not named", () => {
    expect(missing({ ...R, street: "", city: " " })).toEqual(["Straße", "Ort"]);
    expect(missing({ ...R, country: "" })).toEqual([]);
    expect(invalid({ ...R, country: "" })).toEqual(["country"]);
  });

  it("Abtretung and Vollmacht follow the ticks, the flyer never goes by post", () => {
    expect(statics({ activeOffer: "bu", Kundendaten: { payer: "Kassenkunde" } }).map((s) => s.id)).toEqual(["abtretung", "vollmacht"]);
    expect(statics({ activeOffer: "bu", Kundendaten: { payer: "Kassenkunde" }, docSelection: { vollmacht: false } }).map((s) => s.id)).toEqual(["abtretung"]);
    expect(statics({ activeOffer: "bu", Kundendaten: { payer: "Kassenkunde" } }, ["abtretung"]).map((s) => s.id)).toEqual(["vollmacht"]);
  });

  it("sizes and texts", () => {
    expect([uploadSize(0), uploadSize(300), uploadSize(2048), uploadSize(3 * 1024 * 1024)]).toEqual(["Default", "1 KB", "2 KB", "3.00 MB"]);
    expect(sentText({ mode: "live", printjobId: 7, attachmentCount: 2 })).toBe("Postversand erfolgreich gestartet. Auftrag: 7 · Anlagen: 2");
    expect(liveQuestion(R, ["a.pdf"], "ANG1").heading).toBe("Sendung (1 Dokument)");
    expect(withBalance("Angebot: ANG1", { ok: true, balance: 0, currency: "" })).toBe("Angebot: ANG1 · Guthaben: 0 EUR");
    expect(withBalance("Angebot: ANG1", { ok: false })).toBe("Angebot: ANG1");
    expect(alreadySent({}).message).toBe("Für diesen Deal wurde am kürzlich schon ein Brief gesendet (-, onlinebrief24 -).");
  });

  it("an offer sent before: only a send that reached the customer counts", () => {
    expect(priorSend([{ status: "done", channel: "bitrix" }, { status: "failed", channel: "email" }])).toBeNull();
    expect(priorSend([{ status: "done", channel: "bitrix" }, { status: "done", channel: "email", to: "kunde@example.test" }])?.channel).toBe("email");
    expect(priorQuestion("ANG1", { channel: "email", to: "kunde@example.test", finishedAt: "2026-11-15T09:30:00.000Z" }).message).toContain("wurde am 15.11.2026, 10:30 per E-Mail an kunde@example.test versendet.");
    expect(changedQuestion({ differences: ["Preis"], sent: { at: "2026-11-15T09:30:00.000Z" } }).message).toContain("Unterschied: Preis. Sie können das Original vom 15.11.2026, 10:30");
  });

  it("an offer that was mailed before: asked first; no → nothing is made, nothing is sent", async () => {
    const user = await open();
    sends = [{ status: "done", channel: "email", to: "kunde@example.test", finishedAt: "2026-11-15T09:30:00.000Z" }];
    await sendAll(user);
    const ask = await screen.findByTestId("zf-ask");
    expect(within(ask).getByRole("heading").textContent).toBe("Angebot wurde bereits versendet");
    await user.click(within(ask).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(part(screen.getByTestId("zf-post-status"), "text")).toBe("Versand abgebrochen."));
    expect(seen.filter((r) => r.path === "/api/post/send" || r.path === "/docx-template/pdf")).toEqual([]);
  });

  it("the open offer differs from the sent one: the original goes out on request, without the open offer", async () => {
    const user = await open();
    answers["/api/post/send"] = [[409, { error: "geändert", code: "OFFER_CHANGED", differences: ["Preis"], sent: { at: "2026-11-15T09:30:00.000Z" } }]];
    await sendAll(user);
    const ask = await screen.findByTestId("zf-ask");
    await user.click(within(ask).getByRole("button", { name: "Original per Post senden" }));
    await screen.findByTestId("zf-sent");
    expect(seen.filter((r) => r.path === "/api/post/send").map((r) => r.guard.offer)).toEqual(["open", "original"]);
  });

  it("the open offer differs and the original is not wanted: says to make a new version", async () => {
    const user = await open();
    answers["/api/post/send"] = [[409, { error: "geändert", code: "OFFER_CHANGED" }]];
    await sendAll(user);
    await user.click(within(await screen.findByTestId("zf-ask")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(part(screen.getByTestId("zf-post-status"), "text")).toContain("Neue Version erstellen"));
    expect(screen.queryByTestId("zf-sent")).toBeNull();
  });

  it("the first missing field of the address gets the focus", async () => {
    const s = SCENARIOS.find((x) => x.name === "send: address incomplete")!;
    server(s, offerOf(s));
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByTestId("zf-post");
    const user = userEvent.setup();
    for (const p of s.pre) await act(p, user);
    await act(["psend"], user);
    await waitFor(() => expect(document.activeElement?.id).toBe("zf-post-street"));
  });

  it("two taps on send start one send", async () => {
    const user = await open();
    const b = screen.getByTestId("zf-post").querySelector<HTMLElement>('[data-action="post"]')!;
    await user.click(b); await user.click(b);
    expect(screen.getAllByTestId("zf-main")).toHaveLength(1);
  });
});
