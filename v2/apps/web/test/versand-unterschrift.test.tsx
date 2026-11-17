// Signing must do what today's UI does: "Vor Ort unterschreiben (iPad)" on both tabs — the same
// checks, the same save of the offer, the same request, the same question when documents were
// signed before, the same signing view opened, the same messages — and "Unterschriebene Unterlagen
// per Post senden" on the Post tab. Reference: fixtures/versand-unterschrift.json, recorded from
// today's UI by v2/scripts/capture-versand-unterschrift.cjs (every route answered there as here).
// On purpose different, matched below as such: an offer changed after it was sent is answered
// with what to do ("Neue Version"), a field marked as missing loses its mark once it
// is filled, and the send guard of v2 (sendId) is part of the hand-over and of the letter.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { ADDRESS } from "../src/features/steps/versand/post-rules.js";
import { TEXT, canPostSigned, ready, signedParts, signedSent } from "../src/features/steps/versand/sign-rules.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-unterschrift.json" with { type: "json" };
import { renderApp } from "./helpers.js";

process.env.TZ = "Europe/Berlin"; // the recordings show times as the office sees them

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface Tile { name: string; meta: string; fixed?: boolean }
interface FieldView { label: string; value: string; invalid: boolean }
interface PostView { signed: boolean; shown: boolean; title: string; warning: string; fields: Record<string, FieldView>; files: Tile[]; listTitle: string; hint: string; send: { label: string; disabled: boolean }; status: { type: string; text: string } | null }
interface SignView { shown: boolean; label: string; disabled: boolean; status: { type: string; text: string } | null }
interface View {
  step: string; sign: { mail: SignView; post: SignView }; signedLabel: string; opened: [string, string][];
  tab: string; tabs: string[]; post: PostView; attachments: Tile[];
  release: { title: string; text: string; note: string; placeholder: string; buttons: string[] } | null;
  live: { title: string; texts: string[]; buttons: string[] } | null;
  hp: Obj | null; ask: { title: string; message: string; ok: string; cancel: string } | null; stage: { title: string; text: string; body: string; buttons: { label: string; disabled: boolean }[] } | null; versand: string; note: string | null;
}
interface Act { act: string[]; requests: Obj[]; toasts: string[][]; alerts: string[]; stored: Obj; view: View }
interface Scenario { name: string; type: string; offer: Obj; pre: unknown[][]; answers: [string, number, Obj][]; view: View; acts: Act[] }
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
let seen: Obj[] = [], answers: Record<string, [number, Obj][]> = {}, before: Obj = {}, mode = "test", total = 10, selfPay = 0, sends: Obj[] = [], signings: Obj[] = [], opened: [string, string][] = [], blockWindows = false;
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
    if (url === "/api/offers" && method === "POST") { seen.push({ path: url, offerNumber: mask(body.offerNumber), offerType: body.offerType, payload: Object.keys(changed(before, body.payload ?? {})) }); return answer(url) ?? json({ ok: true }); }
    if (url === "/api/signing" && method === "POST") {
      const { payload: p, sendId, ...rest } = body as Obj;
      seen.push({ path: url, body: mask(rest), payload: Object.keys(changed(before, p ?? {})), guard: /^[0-9a-f-]{36}$/.test(String(sendId)) });
      return answer(url) ?? json(reference.signing, 201);
    }
    if (/^\/api\/signing\/status\/[^/]+\/signed$/.test(path)) { seen.push({ path: "/api/signing/status/<number>/signed" }); return answer("/signed") ?? json(reference.signed); }
    if (/^\/api\/signing\/status\/[^/]+$/.test(path)) return json(signings);
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
  seen = []; answers = {}; mode = "test"; total = 10; selfPay = 0; sends = []; signings = []; opened = []; blockWindows = false;
  vi.spyOn(window, "open").mockImplementation((url, target) => { opened.push([String(url), String(target)]); return blockWindows ? null : ({} as Window); });
  for (const k of ["error", "success", "warning", "info"] as const) vi.spyOn(toast, k);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// ---- what the page shows ----
const part = (el: Element | null | undefined, name: string) => flat(el?.querySelector(`[data-part="${name}"]`)?.textContent);
const tiles = (sec: Element): Tile[] => Array.from(sec.querySelectorAll('[data-testid="zf-mail-file"]')).map((t) => ({ name: part(t, "name"), meta: part(t, "meta"), fixed: !!t.querySelector('[data-part="fixed"]') }));
const FIELD: Record<string, string> = { deal: "zf-post-deal", ...Object.fromEntries(ADDRESS.map((f) => [f, `zf-post-${f}`])) };
const buttons = (el: Element) => Array.from(el.querySelectorAll<HTMLButtonElement>(":scope > div:last-child button"));
function signOf(via: "mail" | "post"): SignView {
  const box = screen.getByTestId(`zf-sign-${via}`), b = box.querySelector<HTMLButtonElement>('[data-action="sign"]')!, st = box.querySelector<HTMLElement>('[data-part="status"]');
  return { shown: !document.getElementById(`zf-panel-${via}`)!.hidden, label: part(b, "label"), disabled: b.disabled, status: st ? { type: st.dataset.type === "error" ? "error" : "ok", text: part(st, "text") } : null };
}
function shown(router: { state: { location: { pathname: string } } }) {
  const step = router.state.location.pathname.split("/").pop()!;
  if (step !== "Zusammenfassung") return { step };
  const post = screen.getByTestId("zf-post"), panel = document.getElementById("zf-panel-post")!, files = screen.getByTestId("zf-post-files");
  const send = post.querySelector<HTMLButtonElement>('[data-action="post"]')!, st = screen.queryByTestId("zf-post-status");
  const release = screen.queryByTestId("zf-post-release"), live = screen.queryByTestId("zf-post-live"), sent = screen.queryByTestId("zf-sent");
  const signedButton = post.querySelector<HTMLButtonElement>('[data-action="post-signed"]');
  return mask({
    step, sign: { mail: signOf("mail"), post: signOf("post") }, signed: !!signedButton, signedLabel: signedButton ? part(signedButton, "label") : "", opened: [...opened],
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
/** an offer changed after it was sent: today the server's sentence, here what to do about it (as the mail send says it) */
const ownWords = (x: SignView): SignView => (x.status?.text === "Dieses Angebot wurde bereits versendet und seitdem geändert." ? { ...x, status: { ...x.status, text: TEXT.offerChanged } } : x);
function expected(v: View) {
  if (v.step !== "Zusammenfassung") return { step: v.step };
  const p = v.post;
  return {
    step: v.step, sign: { mail: ownWords(v.sign.mail), post: ownWords(v.sign.post) }, signed: p.signed, signedLabel: p.signed ? v.signedLabel : "", opened: v.opened,
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

async function act(a: unknown[], user: ReturnType<typeof userEvent.setup>) {
  const [kind, x, y] = a as string[];
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  if (kind === "sign" || kind === "signpost") await user.click(screen.getByTestId(`zf-sign-${kind === "sign" ? "mail" : "post"}`).querySelector<HTMLElement>('[data-action="sign"]')!);
  else if (kind === "psigned") await user.click(screen.getByTestId("zf-post").querySelector<HTMLElement>('[data-action="post-signed"]')!);
  else if (kind === "tab") await user.click(document.getElementById(`zf-tab-${x}`)!);
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
const liveMode = (s: Scenario) => / live\b/.test(s.name);

describe("signing does what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    server(s, offerOf(s));
    mode = liveMode(s) ? "live" : "test";
    const moved = s.acts.flatMap((a) => a.requests).find((r) => String(r.path).endsWith("/move-ang-verschickt"));
    if (moved) { total = Number(moved.body.opportunity) || total; selfPay = Number(moved.body.selfPayAmount) || 0; } // today's page takes both from its own price
    for (const [path, status, body] of s.answers) (answers[path] ??= []).push([status, body]);
    const router = renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
    await screen.findByTestId("zf-post");
    const user = userEvent.setup({ applyAccept: false });
    for (const p of s.pre) { if (p[0] === "signings") signings = p[1] as Obj[]; else await act(p, user); } // what the server knows about signatures is set, not done
    await waitFor(() => expect(shown(router)).toEqual(expected(s.view)));
    for (const a of s.acts) {
      seen = []; opened = []; before = structuredClone(offer());
      for (const m of ["error", "success", "warning", "info"] as const) vi.mocked(toast[m]).mockClear();
      await act(a.act, user);
      const want = a.requests.filter((r) => r.path !== "/api/drafts").map((r) => {
        if (r.path === "/api/signing") return { ...r, payload: Object.keys(r.payload), guard: true };
        if (r.path === "/api/post/send") return { ...r, guard: { sendId: true, offer: "none" } }; // the signed documents: no open offer goes along
        if (r.sent) return { path: r.path, sent: Object.keys(r.sent) };
        if (r.path === "/api/offers") return { ...r, payload: Object.keys(r.payload) };
        return r;
      });
      await waitFor(() => expect(mask(seen)).toEqual(mask(want)), { timeout: 3000 });
      await waitFor(() => expect(shown(router)).toEqual(expected(a.view)));
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

describe("signing — rules and what goes beyond the recordings", () => {
  const onSite = SCENARIOS.find((x) => x.name === "bwt: signed on site")!;
  const open = async () => {
    server(onSite, offerOf(onSite));
    const router = renderApp(`/deal/${KEY}/bwt/Zusammenfassung`);
    await screen.findByTestId("zf-post");
    return { router, user: userEvent.setup() };
  };

  it("texts", () => {
    expect(ready({ customerType: "Selbstzahler", documents: ["angebot"] })).toBe("Bereit zum Unterschreiben (Selbstzahler, 1 Dokument(e)). Tablet dem Kunden übergeben.");
    expect(signedSent({ mode: "live", printjobId: 9 })).toEqual({ ok: true, text: "Unterschriebene Unterlagen per Post versendet. Auftrag: 9" });
    expect(signedSent({ mode: "test", bitrix: { ok: false, error: "Timeout" } }).text).toContain("(Auftrag -). – Der Brief wurde versendet, die Ablage in Bitrix hat nicht geklappt (Timeout).");
  });

  it("the signed documents are offered only for a complete signature started from the Post tab", () => {
    expect(canPostSigned([{ status: "completed", via: "" }, { status: "opened", via: "post" }])).toBe(false);
    expect(canPostSigned([{ status: "opened", via: "post" }, { status: "completed", via: "post" }])).toBe(true);
    expect(canPostSigned({ error: "x" })).toBe(false);
  });

  it("the signed offer is the letter; without one the first document is", () => {
    const a = { key: "abtretung", filename: "a.pdf", base64: "QQ==" }, o = { key: "angebot", filename: "o.pdf", base64: "Qg==" };
    expect(signedParts([a, o])).toEqual({ main: o, rest: [a] });
    expect(signedParts([a])).toEqual({ main: a, rest: [] });
    expect(signedParts([])).toBeNull();
  });

  it("a tablet that blocks new windows: the link to the signing view stays under the message", async () => {
    const { user } = await open();
    blockWindows = true;
    await act(["sign"], user);
    const link = await waitFor(() => { const l = screen.getByTestId("zf-sign-mail").querySelector<HTMLAnchorElement>('[data-part="link"]'); expect(l).toBeTruthy(); return l!; });
    expect(link.getAttribute("href")).toBe("/sign/TESTTOKEN");
    expect(link.target).toBe("_blank");
  });

  it("an offer changed after it was sent (the server's own answer): says to make a new version, nothing opens", async () => {
    const { user } = await open();
    answers["/api/signing"] = [[409, { error: "geändert", code: "OFFER_CHANGED" }]];
    await act(["sign"], user);
    await waitFor(() => expect(signOf("mail").status).toEqual({ type: "error", text: TEXT.offerChanged }));
    expect(opened).toEqual([]);
  });
});
