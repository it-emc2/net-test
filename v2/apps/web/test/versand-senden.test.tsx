// Sending must do what today's UI does: the same checks before sending, the same question about
// main items, the same documents for Bitrix, the same request (fields, files, offer), the same
// messages, the same "already sent" question, the same dialog after sending with the same move
// of the deal, and store the same. Reference: fixtures/versand-senden.json, recorded from today's
// UI by v2/scripts/capture-versand-senden.cjs (every route answered there as here).
// On purpose different, matched below as such: messages in German instead of English, a
// document that cannot be made is named in words (today: the server's raw answer), the button
// says "An Kunden senden" again once the edited Word file went out (today it keeps "Geänderte
// DOCX senden" although the file is gone), and the send guard of v2 (sendId) is part of the send.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { POLL_MS } from "../src/features/steps/versand/Senden.js";
import { TEXT, addFiles, bitrixJobs, errorOf, fileSize, materialCodes, missingMain, movePayload } from "../src/features/steps/versand/send-rules.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-senden.json" with { type: "json" };
import { renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
type Line = [string, string];
interface Tile { name: string; meta: string }
interface View {
  step: string; send: { label: string; disabled: boolean }; bitrix: { label: string; disabled: boolean };
  docx: { title: string; text: string; remove: boolean; note: string }; attachments: Tile[]; count: string; bitrixFiles: Tile[]; bitrixCount: string;
  deal: { value: string; invalid: boolean }; note: string | null; status: { log: Line[] } | { type: string; text: string } | null;
  hp: { title: string; text: string; rows: { key: string; text: string; page: string; checked: boolean }[]; buttons: { label: string; disabled: boolean }[] } | null;
  stage: { title: string; text: string; body: string; buttons: { label: string; disabled: boolean }[] } | null;
  ask: { title: string; message: string; ok: string; cancel: string } | null; versand: string;
}
interface Act { act: string[]; requests: Obj[]; toasts: string[][]; alerts: string[]; stored: Obj; view: View }
interface Scenario { name: string; type: string; offer: Obj; pre: unknown[][]; answers: [string, number, Obj][]; view: View; acts: Act[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;
const FILES = reference.files as unknown as Record<string, [string, string, string] | null>;
const NUM = /ANG\d{4}-\d{4}-\d{6}/g, NUMBER = "ANG2026-1116-093000";
const mask = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null).replace(NUM, "<number>"));
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return JSON.parse(JSON.stringify(o).replace(NUM, NUMBER)); };
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const FILE_BODY: Record<string, [string, string]> = { "Grundriss.pdf": ["application/pdf", "%PDF-1.4 plan"], "Notiz.txt": ["text/plain", "Notiz"], "Aufmass.pdf": ["application/pdf", "%PDF-1.4 aufmass"], "Foto.jpg": ["image/jpeg", "jpeg"], "Angebot_bearbeitet.docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx edited"], "Angebot.pdf": ["application/pdf", "%PDF-1.4"] };
const fileOf = (name: string) => new File([FILE_BODY[name]![1]], name, { type: FILE_BODY[name]![0] });

/** today's words where React says it on purpose differently */
const ours = (text: string): string => text
  .replace("Please fill in the Lead ID / Auftrag ID before sending the email.", TEXT.noDeal)
  .replace("Please enter a recipient email.", TEXT.noRecipient)
  .replace(/^(Senden fehlgeschlagen: .+ konnte nicht erzeugt werden: )\S+ \(\d+\): \{"error":"([^"]*)"\}$/, "$1$2");
const unicon = (s: string) => s.replace(/^✅ /, "");
const clock = (s: string) => s.replace(/am \d\d\.\d\d\.\d{4} um \d\d:\d\d Uhr/, "am <date> um <time> Uhr");

// ---- the fake server ----
let seen: Obj[] = [], answers: Record<string, [number, Obj][]> = {}, before: Obj = {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** today's answer shapes → the server's own (v2: { error: { code, message } } and the extras beside it) */
const v2 = (status: number, body: Obj) => (status < 400 ? json(body, status) : json({ ...body, error: { code: body.code ?? "FAILED", message: String(body.error ?? ""), requestId: "t" }, code: undefined }, status));
function server(s: Scenario, payload: Obj) {
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input), method = init.method ?? "GET", path = url.split("?")[0]!;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    const answer = (k: string) => { const a = answers[k]?.shift(); return a ? v2(a[0], a[1]) : null; };
    if (url === "/api/auth/me") return json({ user: { email: "capture@local.test", name: "Capture", role: "user" } });
    if (url === "/api/users") return json(reference.users);
    if (url === `/api/deals/${KEY}/draft` && method === "GET") return json({ dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" });
    if (url === `/api/deals/${KEY}/draft` && method === "PUT") return json({ dealId: KEY, revision: 4, updatedAt: "2026-11-16T10:00:00Z" });
    if (url === "/api/price") return json({ total: 10, selfPayAmount: 0 });
    if (url === "/api/price/inputs") return json({});
    if (url === "/api/offers" && method === "POST") { seen.push({ path: url, offerNumber: mask(body.offerNumber), offerType: body.offerType, payload: Object.keys(changed(before, body.payload ?? {})) }); return json({ ok: true }); }
    if (url === "/api/email/send-offer") {
      const form = init.body as FormData, fields: Obj = {}, files: Record<string, string[]> = {};
      for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v; else (files[k] ??= []).push(v.name);
      const { payload: p, sendId, ...rest } = fields;
      seen.push({ path: url, fields: mask(rest), files, payload: Object.keys(changed(before, JSON.parse(p))), sendId: typeof sendId === "string" && sendId.length > 10 });
      return answer(url) ?? json(reference.sent);
    }
    const bx = path.match(/^\/api\/bitrix\/deal\/([^/]+)\/(.+)$/);
    if (bx && method === "POST") {
      const b = body && typeof body.payload === "string" ? { ...body, payload: "<the offer>" } : body;
      seen.push({ path: `/api/bitrix/deal/<id>/${bx[2]}`, deal: bx[1], body: mask(b) });
      return answer(`/${bx[2]}`) ?? json({ ok: true });
    }
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
  seen = []; answers = {};
  for (const k of ["error", "success", "warning", "info"] as const) vi.spyOn(toast, k);
});
afterEach(() => vi.restoreAllMocks());

// ---- what the page shows ----
const part = (el: Element | null | undefined, name: string) => flat(el?.querySelector(`[data-part="${name}"]`)?.textContent);
const tiles = (sec: Element): Tile[] => Array.from(sec.querySelectorAll('[data-testid="zf-mail-file"]')).map((t) => ({ name: part(t, "name"), meta: part(t, "meta") }));
function shown(router: { state: { location: { pathname: string } } }): Partial<View> {
  const step = router.state.location.pathname.split("/").pop()!;
  const main = screen.queryByTestId("zf-main"), sent = screen.queryByTestId("zf-sent"), ask = screen.queryByTestId("zf-ask");
  const dialogs = {
    hp: main ? { title: flat(main.querySelector("h3")?.textContent), text: flat(main.querySelector("p")?.textContent),
      rows: within(main).getAllByTestId("zf-main-row").map((r) => ({ key: r.dataset.key!, text: flat(r.querySelector("label")?.textContent), page: r.querySelector<HTMLElement>("[data-page]")!.dataset.page!, checked: r.querySelector<HTMLInputElement>("input")!.checked })),
      buttons: Array.from(main.querySelectorAll<HTMLButtonElement>(":scope > div:last-child button")).map((b) => ({ label: flat(b.textContent), disabled: b.disabled })) } : null,
    stage: sent ? { title: flat(sent.querySelector("h3")?.textContent), text: part(sent, "text"), body: part(sent, "body"), buttons: Array.from(sent.querySelectorAll<HTMLButtonElement>(":scope > div:last-child button")).map((b) => ({ label: flat(b.textContent), disabled: b.disabled })) } : null,
    ask: ask ? { title: flat(ask.querySelector("h3")?.textContent), message: part(ask, "message"), ok: flat(ask.querySelectorAll("button")[1]?.textContent), cancel: flat(ask.querySelectorAll("button")[0]?.textContent) } : null,
  };
  if (step !== "Zusammenfassung") return { step, ...dialogs };
  const send = screen.getByTestId("zf-send"), mail = screen.getByTestId("zf-mail-files"), bx = screen.getByTestId("zf-bitrix-files"), docx = screen.getByTestId("zf-docx");
  const btn = (a: string) => send.querySelector<HTMLButtonElement>(`[data-action="${a}"]`)!;
  const st = screen.queryByTestId("zf-send-status"), lines = st ? Array.from(st.querySelectorAll("p")).map((p) => [p.dataset.type!, part(p, "text")] as Line) : [];
  const status = useOfferStore.getState().scratch.sendStatus as Obj | null | undefined;
  const deal = screen.getByLabelText("Lead ID / Auftrag ID") as HTMLInputElement;
  return mask({
    step, ...dialogs,
    send: { label: part(btn("send"), "label"), disabled: btn("send").disabled }, bitrix: { label: part(btn("bitrix"), "label"), disabled: btn("bitrix").disabled },
    docx: { title: part(docx, "title"), text: part(docx, "text"), remove: !!within(docx).queryByRole("button", { name: "Datei entfernen" }), note: flat(screen.queryByTestId("zf-docx-note")?.textContent) },
    attachments: tiles(mail), count: part(mail, "count"), bitrixFiles: tiles(bx), bitrixCount: part(bx, "count"),
    deal: { value: deal.value, invalid: deal.getAttribute("aria-invalid") === "true" },
    note: (screen.getByLabelText(/Interne Notiz/) as HTMLTextAreaElement).value,
    status: !st ? null : status && "log" in status ? { log: lines } : { type: lines[0]![0], text: lines[0]![1] },
    versand: flat(screen.getByTestId("zf-status").textContent),
  });
}
/** the recording, with today's words replaced where React says it differently on purpose */
function expected(v: View): Partial<View> {
  const status = !v.status ? null : "log" in v.status ? { log: v.status.log.map(([k, t]) => [k, ours(t)] as Line) } : { type: v.status.type, text: ours(v.status.text) };
  const out: Partial<View> = { step: v.step, hp: v.hp, ask: v.ask, stage: v.stage ? { ...v.stage, title: unicon(v.stage.title), body: unicon(v.stage.body) } : null };
  if (v.step !== "Zusammenfassung") return out;
  return { ...out, send: { ...v.send, label: v.docx.remove ? v.send.label : v.send.label.replace("Geänderte DOCX senden", "An Kunden senden") } as View["send"], bitrix: v.bitrix, docx: v.docx,
    attachments: v.attachments, count: v.count, bitrixFiles: v.bitrixFiles, bitrixCount: v.bitrixCount, deal: v.deal, note: v.note, status, versand: unicon(v.versand) };
}
const comparable = (v: Partial<View>) => ({ ...v, ...(v.versand ? { versand: clock(v.versand) } : {}), ...(v.send ? { send: { label: v.send.label, disabled: v.send.disabled } } : {}) });

async function act(kind: string, a: string | undefined, user: ReturnType<typeof userEvent.setup>) {
  const send = () => screen.getByTestId("zf-send");
  if (kind === "send") await user.click(send().querySelector<HTMLElement>('[data-action="send"]')!);
  else if (kind === "bitrix") await user.click(send().querySelector<HTMLElement>('[data-action="bitrix"]')!);
  else if (kind === "hp") {
    const main = screen.getByTestId("zf-main");
    if (a === "all") { for (const box of within(main).getAllByRole("checkbox")) await user.click(box); await user.click(within(main).getByRole("button", { name: "Bestätigt – senden" })); }
    else if (a === "back") await user.click(within(main).getByRole("button", { name: "Zurück" }));
    else await user.click(main.querySelector<HTMLElement>(`[data-page="${a}"]`)!);
  } else if (kind === "confirm") await user.click(within(screen.getByTestId("zf-ask")).getAllByRole("button")[a === "yes" ? 1 : 0]!);
  else if (kind === "move") await user.click(within(screen.getByTestId("zf-sent")).getByRole("button", { name: /ANG verschickt/ }));
  else if (kind === "close") await user.click(within(screen.getByTestId("zf-sent")).getByRole("button", { name: "Schließen" }));
  else if (kind === "deal") fireEvent.change(screen.getByLabelText("Lead ID / Auftrag ID"), { target: { value: a } });
  else if (kind === "note") fireEvent.change(screen.getByLabelText(/Interne Notiz/), { target: { value: a } });
  else if (kind === "doc") await user.click(screen.getByTestId("zf-docs").querySelector<HTMLElement>(`#zf-doc-${a}`)!);
  else if (kind === "tile" || kind === "untile") await user.click(within(screen.getByTestId("zf-mail-files")).getByRole("button", { name: `${a} entfernen` }));
  else if (kind === "unbitrix") await user.click(within(screen.getByTestId("zf-bitrix-files")).getByRole("button", { name: `${a} entfernen` }));
  else if (kind === "undocx") await user.click(within(screen.getByTestId("zf-docx")).getByRole("button", { name: "Datei entfernen" }));
  else throw new Error(`act not handled: ${kind}`);
}
async function choose(where: string, name: string, user: ReturnType<typeof userEvent.setup>) {
  const input = where === "attachments" ? document.getElementById("zf-mail-add") : where === "bitrix" ? document.getElementById("zf-bitrix-add") : screen.getByTestId("zf-docx-input");
  await user.upload(input as HTMLInputElement, fileOf(name));
}

describe("sending does what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    server(s, offerOf(s));
    for (const [path, status, body] of s.answers) (answers[path] ??= []).push([status, body]); // how the recording answered
    const router = renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
    await screen.findByTestId("zf-send");
    const user = userEvent.setup({ applyAccept: false });
    // the recorded offer already holds what the steps before stored (ticks, deal number); what is only remembered on the page is done again
    for (const [k, a] of s.pre as [string, string][]) if (k !== "doc") await act(k, a, user);
    await waitFor(() => expect(comparable(shown(router))).toEqual(comparable(expected(s.view))));
    for (const a of s.acts) {
      const [kind, x] = a.act;
      seen = []; before = structuredClone(offer());
      for (const m of ["error", "success", "warning", "info"] as const) vi.mocked(toast[m]).mockClear();
      if (kind === "file") await choose(x!, a.act[2]!, user);
      else await act(kind!, x, user);
      // the recording: the documents and the requests (without today's quick save — React keeps its draft by itself)
      const want = a.requests.filter((r) => r.path !== "/api/drafts").map((r) => {
        if (r.path === "/api/email/send-offer") return { path: r.path, fields: Object.fromEntries(Object.entries(r.fields as Obj).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\r\n/g, "\n") : v])), files: r.files, payload: Object.keys(r.payload), sendId: true };
        if (r.sent) return { path: r.path, sent: Object.keys(r.sent) };
        if (r.path === "/api/offers") return { ...r, payload: Object.keys(r.payload) };
        return r;
      });
      await waitFor(() => expect(mask(seen)).toEqual(mask(want)), { timeout: 3000 });
      await waitFor(() => expect(comparable(shown(router))).toEqual(comparable(expected(a.view))));
      const toasts = (["error", "success", "warning", "info"] as const).flatMap((m) => vi.mocked(toast[m]).mock.calls.map((c) => [m === "warning" ? "warn" : m, String(c[0]), String((c[1] as Obj | undefined)?.description ?? "")]));
      expect(mask(toasts).sort()).toEqual(mask(a.toasts).sort());
      // stored: today's page writes the Checkliste defaults along with the send state; here only what the send says
      const stored = changed(before, offer());
      if (a.stored.zusammenfassung) expect(stored.zusammenfassung?.versand?.art).toBe(a.stored.zusammenfassung.versand.art);
      else expect(stored).toEqual({});
    }
  });
});

describe("sending — rules and what goes beyond the recordings", () => {
  const filled = SCENARIOS.find((s) => s.name === "sent, dialog closed")!;
  const ready = async () => {
    server(filled, offerOf(filled));
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByTestId("zf-send");
    fireEvent.change(screen.getByLabelText("Lead ID / Auftrag ID"), { target: { value: "65418" } });
    return userEvent.setup();
  };
  const sendAll = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByTestId("zf-send").querySelector<HTMLElement>('[data-action="send"]')!);
    const main = await screen.findByTestId("zf-main");
    for (const box of within(main).getAllByRole("checkbox")) await user.click(box);
    await user.click(within(main).getByRole("button", { name: "Bestätigt – senden" }));
  };

  it("the server's own answer to an already sent deal (v2 shape) asks too, and a repeated send carries forceResend", async () => {
    const user = await ready();
    answers["/api/email/send-offer"] = [[409, { error: "Für diesen Deal wurde bereits eine Angebots-E-Mail versendet.", code: "ALREADY_SENT", lastSentAt: "2026-11-15T09:30:00.000Z", lastOfferNumber: "ANG2026-1115-093000" }]];
    await sendAll(user);
    const ask = await screen.findByTestId("zf-ask");
    expect(within(ask).getByRole("heading").textContent).toBe("Angebot noch einmal senden?");
    await user.click(within(ask).getByRole("button", { name: "Ja, noch einmal senden" }));
    await screen.findByTestId("zf-sent");
    const sends = seen.filter((r) => r.path === "/api/email/send-offer");
    expect(sends.map((r) => r.fields.forceResend ?? null)).toEqual([null, "1"]);
  });

  it("a send of a changed offer that was already sent: says to make a new version", async () => {
    const user = await ready();
    answers["/api/email/send-offer"] = [[409, { error: "geändert", code: "OFFER_CHANGED" }]];
    await sendAll(user);
    await waitFor(() => expect(flat(screen.getByTestId("zf-send-status").textContent)).toContain(TEXT.offerChanged));
    expect(screen.queryByTestId("zf-sent")).toBeNull();
  });

  it("Bitrix filing failed: the dialog offers to repeat it from the stored files, nothing is sent again", async () => {
    const user = await ready();
    answers["/api/email/send-offer"] = [[200, { ...reference.sent, bitrixComment: { ok: false, error: "Timeout" }, sendId: "0123456789abcdef0123456789abcdef" }]];
    const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
    const retried: string[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => { if (String(url).endsWith("/retry-bitrix")) { retried.push(String(url)); return json({ ok: true }); } return real(url as never, init as never); });
    await sendAll(user);
    const sent = await screen.findByTestId("zf-sent");
    await user.click(within(sent).getByRole("button", { name: "Ablage wiederholen" }));
    await waitFor(() => expect(within(sent).getByText("Die Unterlagen sind jetzt in Bitrix abgelegt.")).toBeTruthy());
    expect(retried).toEqual(["/api/sends/0123456789abcdef0123456789abcdef/retry-bitrix"]);
    expect(seen.filter((r) => r.path === "/api/email/send-offer")).toHaveLength(1);
  });

  it("the connection drops while the server sends: the send is followed until it is done (no second send)", async () => {
    const user = await ready();
    const was = { ...POLL_MS }; POLL_MS.every = 5;
    const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
    let polls = 0, sendId = "";
    vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => {
      if (url === "/api/email/send-offer") { sendId = String((init!.body as FormData).get("sendId")); throw new TypeError("Load failed"); }
      if (String(url).startsWith("/api/sends/")) { polls++; return json(polls < 2 ? { ok: true, send: { status: "running" } } : { ok: true, send: { status: "done" }, result: reference.sent }); }
      return real(url as never, init as never);
    });
    try {
      await sendAll(user);
      await screen.findByTestId("zf-sent");
      expect(polls).toBe(2);
      expect(sendId).toMatch(/^[0-9a-f-]{36}$/);
      expect(flat(screen.getByTestId("zf-send-status").textContent)).toContain(TEXT.stillRunning);
    } finally { Object.assign(POLL_MS, was); }
  });

  it("the connection drops and the server never saw the request: nothing was sent, said so", async () => {
    const user = await ready();
    const was = { ...POLL_MS }; POLL_MS.every = 1;
    const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => {
      if (url === "/api/email/send-offer") throw new TypeError("Load failed");
      if (String(url).startsWith("/api/sends/")) return json({ error: { code: "NOT_FOUND", message: "Versand nicht gefunden", requestId: "t" } }, 404);
      return real(url as never, init as never);
    });
    try {
      await sendAll(user);
      await waitFor(() => expect(flat(screen.getByTestId("zf-send-status").textContent)).toContain("Senden fehlgeschlagen: Keine Verbindung zum Server."));
      expect(screen.queryByTestId("zf-sent")).toBeNull();
    } finally { Object.assign(POLL_MS, was); }
  });

  it("two taps on send start one send", async () => {
    const user = await ready();
    const b = screen.getByTestId("zf-send").querySelector<HTMLElement>('[data-action="send"]')!;
    await user.click(b); await user.click(b);
    expect(screen.getAllByTestId("zf-main")).toHaveLength(1);
  });

  it("an offer without a number gets one before it goes out: subject, text, PDF and the offer name the same number", async () => {
    const o = offerOf(filled);
    o.offerNumber = ""; o.mail = { ...o.mail, subject: "", body: "" }; // as an offer made in React that was never downloaded
    server(filled, o);
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByTestId("zf-send");
    fireEvent.change(screen.getByLabelText("Lead ID / Auftrag ID"), { target: { value: "65418" } });
    await waitFor(() => expect(String(offer().mail.body)).toContain("1. Ihr Angebot ANG-2025-_____")); // the blank, while there is no number
    await sendAll(userEvent.setup());
    await screen.findByTestId("zf-sent");
    const form = vi.mocked(globalThis.fetch).mock.calls.find((c) => c[0] === "/api/email/send-offer")![1]!.body as FormData;
    const number = String(form.get("offerNumber"));
    expect(number).toMatch(/^ANG\d{4}-\d{4}-\d{6}$/);
    expect(form.get("subject")).toBe(`emc2 | Ihr Angebot ${number} zum Badumbau`);
    expect(String(form.get("body"))).toContain(`1. Ihr Angebot ${number}\n`);
    expect(String(form.get("body"))).not.toContain("ANG-2025-_____");
    expect(JSON.parse(String(form.get("payload"))).offerNumber).toBe(number);
    expect(offer().offerNumber).toBe(number); // kept: the next send and every document use this number
  });

  it("main items: a configured enclosure, curtain, tray, floor, panels and optional lines need no confirmation", () => {
    const o = { activeOffer: "bu", duschwanne: { trayEnabled: true, addFlooring: true }, wandverkleidung: { wvEnabled: true },
      duschabtrennung: { configurator: { lines: [{ articleNumber: "DA1" }] }, quickAdd: [{ productId: "DA1" }], curtainEnabled: true }, duschvorhang: { configurator: { lines: [{ articleNumber: "C1" }] } } };
    const price = { materialsDisplayUI: { lines: [{ productId: "V3WV-1", category: "Wandverkleidung", qty: 3 }] }, optionalDisplayUI: { lines: [{ productId: "HG" }] } };
    expect(missingMain(o, price as never)).toEqual([]);
    expect(missingMain({ ...o, activeOffer: "bwt" }, null)).toEqual([]);
    expect(missingMain({ activeOffer: "bu" }, null).map((m) => m.key)).toEqual(["duschwanne", "fussboden", "wandverkleidung", "duschabtrennung", "duschvorhang", "optional"]);
  });

  it("documents for Bitrix, files, answers and the move of the deal", () => {
    expect(bitrixJobs("ah", "ANG 1", false).map((j) => j.name)).toEqual(["ANG_1.docx", "Kalkulation_ANG_1.pdf", "Badolux_Warenkorb_ANG_1.csv", "Badolux_Warenkorb_ANG_1.json", "winwall_Warenkorb_ANG_1.csv", "winwall_Warenkorb_ANG_1.json"]);
    expect(bitrixJobs("bu", "", true).map((j) => j.path)).not.toContain("/docx-template");
    expect([fileSize(0), fileSize(13), fileSize(2048), fileSize(3 * 1024 * 1024)]).toEqual(["", "13 B", "2 KB", "3.0 MB"]);
    const a = new File(["x"], "a.pdf", { lastModified: 1 });
    expect(addFiles([a], [a, new File(["yy"], "b.pdf")]).map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(errorOf({ error: { code: "SEND_FAILED", message: "Send failed" }, detail: "SMTP" })).toEqual({ code: "SEND_FAILED", message: "SMTP" });
    expect(errorOf({ error: "Für diesen Deal …", code: "ALREADY_SENT" })).toEqual({ code: "ALREADY_SENT", message: "Für diesen Deal …" });
    expect(materialCodes({ supplierCodes: { wv: "WV-WW", fb: "WV-WW", dw: "DW-SL" } })).toBe("WV-WW · DW-SL");
    expect(movePayload({ activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, Arbeitszeit: { workDays: 2 } }, { offerTotal: 100, selfPayAmount: 50 }, "N", "DW-SL"))
      .toEqual({ opportunity: 100, finalTotal: 100, workDays: 2, offerType: "bu", offerNumber: "N", materialCodes: "DW-SL" });
  });
});
