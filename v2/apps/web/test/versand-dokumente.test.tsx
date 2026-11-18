// The Dokumentenstudio must ask the server for the same as today's UI, hand over the same files,
// store the same and show the same preview. Reference: fixtures/versand-dokumente.json, recorded
// from today's UI by v2/scripts/capture-versand-dokumente.cjs (the document routes answered by
// the small fixed files below).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { ACTIONS, cardsOf, csvName, newOfferNumber } from "../src/features/steps/versand/documents.js";
import { filenameOf } from "../src/shared/api/index.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-dokumente.json" with { type: "json" };
import { openMore, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface Preview { title: string; status: string; open: { label: string; ready: boolean }; download: { label: string; ready: boolean; filename: string }; close: string; tabs: { key: string; label: string; active: boolean }[]; mode: string; pdf: boolean; content: string }
interface View { step: string; studio: { title: string; text: string; cards: { badge: string; format: string; title: string; text: string; buttons: { id: string; label: string; disabled: boolean }[] }[] } | null; preview: Preview | null }
interface Act { act: string[]; requests: Obj[]; handed: string[]; toasts: string[][]; alerts: string[]; stored: Obj; view: View }
interface Scenario { name: string; type: string; offer: Obj; view: View; acts: Act[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;
const FILES: Record<string, [string, string, string]> = {
  "/docx-template": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Angebot_TEST.docx", "docx"],
  "/docx-template/pdf": ["application/pdf", "Angebot_TEST.pdf", "%PDF-1.4 offer"],
  "/api/docx/pdf-preview": ["application/pdf", "Angebot_Vorschau.pdf", "%PDF-1.4 preview"],
  "/kalkulation/docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Kalkulation_TEST.docx", "docx"],
  "/kalkulation/pdf": ["application/pdf", "Kalkulation_TEST.pdf", "%PDF-1.4 kalk"],
  "/kalkulation/pdf-v2": ["application/pdf", "Kalkulation_V2_TEST.pdf", "%PDF-1.4 kalk2"],
  "/material-overview/hassmann-cart": ["text/csv; charset=utf-8", "Hassmann_TEST.csv", "Artikel;Menge\nA-1;2\nB-7;1\n"],
};
const NUM = /ANG\d{4}-\d{4}-\d{6}/g;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const masked = (d: Obj) => { const { mail: _mail, ...rest } = d; if (typeof rest.offerNumber === "string") rest.offerNumber = rest.offerNumber.replace(NUM, "<new number>"); return rest; }; // the mail subject follows the number — the mail part is not built yet
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return JSON.parse(JSON.stringify(o).replace(/ANG\d{4}-\d{4}-\d{6}/g, "ANG2026-1116-093000")); };
const offer = () => useOfferStore.getState().offer as unknown as Obj;

let seen: Obj[] = [], handed: string[] = [], failing: Record<string, number> = {}, before: Obj = {};
/** the sends the server knows (null: it does not answer, as in the recordings), and the number register */
let sends: Obj[] | null = null, claims: Obj[] = [], claimAnswer: Obj | null = null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function server(s: Scenario, payload: Obj) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET", body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    if (url === "/api/auth/me") return json({ user: { email: "capture@local.test", name: "Capture", role: "user" } });
    if (url === "/api/users") return json(reference.users);
    if (url === `/api/deals/${KEY}/draft` && method === "GET") return json({ dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" });
    if (url === "/api/price") return json({ total: 10, selfPayAmount: 0, services: { sum: 5, lines: [] } });
    if (url === "/api/price/inputs") return json({});
    if (sends && /\/sends$/.test(url)) return json({ ok: true, sends });
    if (url === "/api/offer-numbers/claim") { claims.push(body); return claimAnswer ? json(claimAnswer) : json({ ok: true, offerNumber: body.current, changed: false }); }
    if (url === "/api/offers" && method === "POST") { seen.push({ path: url, offerNumber: String(body.offerNumber).replace(NUM, "<new number>"), offerType: body.offerType, pricing: !!body.pricing && Object.keys(body.pricing).length > 0, keys: Object.keys(body).sort(), payloadIsOffer: same(body.payload, offer()) }); return json({ ok: true }); }
    const file = method === "POST" ? FILES[url] : undefined;
    if (file) {
      seen.push({ path: url, accept: new Headers(init.headers).get("accept") ?? "", sent: masked(changed(before, body)) });
      if (failing[url]) { const status = failing[url]!; delete failing[url]; return json({ error: "Dokument konnte nicht erstellt werden", detail: "Vorlage fehlt" }, status); }
      return new Response(file[2], { status: 200, headers: { "content-type": file[0], "content-disposition": `attachment; filename="${file[1]}"` } });
    }
    return json({ error: { code: "NOT_FOUND", message: `kein Handler: ${method} ${url}`, requestId: "t" } }, 404);
  }));
}
beforeEach(() => {
  seen = []; handed = []; failing = {}; sends = null; claims = []; claimAnswer = null;
  let n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test/${++n}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { if (this.href.startsWith("blob:")) handed.push(this.download.replace(NUM, "<new number>")); });
  vi.spyOn(toast, "error"); vi.spyOn(toast, "success");
});
afterEach(() => vi.restoreAllMocks());

async function open(s: Scenario, payload = offerOf(s)) {
  server(s, payload);
  const router = renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
  await screen.findByTestId("zf-studio"); openMore(); // U-024: the studio is in "Mehr Optionen"
  return router;
}
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const studio = () => { const sec = screen.getByTestId("zf-studio"); return { title: flat(sec.querySelector("h3")?.textContent), text: flat(sec.querySelector("p")?.textContent), cards: within(sec).getAllByTestId("zf-doc-card").map((c) => ({ badge: part(c, "badge"), format: part(c, "format"), title: flat(c.querySelector("h4")?.textContent), text: part(c, "text"), buttons: Array.from(c.querySelectorAll<HTMLButtonElement>("button")).map((b) => ({ id: b.dataset.action!, label: part(b, "label"), disabled: b.disabled })) })) }; };
function preview(): Preview | null {
  const p = screen.queryByTestId("zf-preview");
  if (!p) return null;
  const link = (name: string) => p.querySelector<HTMLAnchorElement>(`[data-part="${name}"]`)!, pdf = p.querySelector<HTMLIFrameElement>('[data-part="pdf"]');
  return {
    title: flat(p.querySelector("h3")?.textContent), status: part(p, "status"),
    open: { label: flat(link("open").textContent), ready: link("open").getAttribute("aria-disabled") === "false" },
    download: { label: flat(link("download").textContent), ready: link("download").getAttribute("aria-disabled") === "false", filename: link("download").getAttribute("download") ?? "" },
    close: flat(within(p).getByRole("button", { name: "Schließen" }).textContent),
    tabs: within(p).getAllByRole("tab").map((t) => ({ key: t.dataset.preview!, label: flat(t.textContent), active: t.getAttribute("aria-selected") === "true" })),
    mode: pdf ? "pdf" : "text", pdf: !!pdf && String(pdf.getAttribute("src")).startsWith("blob:"), content: p.querySelector('[data-part="text"]')?.textContent ?? "",
  };
}
const toasts = () => [...vi.mocked(toast.error).mock.calls.map((c) => ["error", String(c[0]), String((c[1] as Obj | undefined)?.description ?? "")]), ...vi.mocked(toast.success).mock.calls.map((c) => ["success", String(c[0]), String((c[1] as Obj | undefined)?.description ?? "").replace(NUM, "<new number>")])];

describe("the Dokumentenstudio does what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    const router = await open(s);
    expect(studio()).toEqual(s.view.studio);
    expect(preview()).toBeNull();
    const user = userEvent.setup();
    let fails = false;
    for (const a of s.acts) {
      const [kind, what] = a.act;
      if (router.state.location.pathname.split("/").pop() !== "Zusammenfassung") { await router.navigate(`/deal/${KEY}/${s.type}/Zusammenfassung`); await screen.findByTestId("zf-studio"); openMore(); } // U-024: the studio is in "Mehr Optionen"
      // a request that failed in the recording fails here too
      for (const r of a.requests) if (r.path !== "/api/offers" && !a.handed.length && !a.view.preview?.download.ready && a.act[0] === "click" && (a.alerts.length || !a.toasts.length) && a.view.step === "Zusammenfassung") { failing[r.path] = 500; fails = true; }
      seen = []; handed = []; vi.mocked(toast.error).mockClear(); vi.mocked(toast.success).mockClear();
      before = structuredClone(offer());
      // a second number made within the same second is the same number (the recording took longer between two buttons)
      const sameSecond = (d: Obj) => { if (!NUM.test(String(before.offerNumber ?? ""))) return d; NUM.lastIndex = 0; const { offerNumber: _n, ...rest } = d; return rest; };
      if (kind === "click") await user.click(screen.getByTestId("zf-studio").querySelector<HTMLElement>(`[data-action="${what}"]`)!);
      else if (kind === "switch") await user.click(within(screen.getByTestId("zf-preview")).getAllByRole("tab").find((t) => t.dataset.preview === what)!);
      else await user.click(within(screen.getByTestId("zf-preview")).getByRole("button", { name: "Schließen" }));
      // Alltagshilfe is priced in the browser today; that price is not built here yet, so the offer is saved without one (the server prices it)
      const want = a.requests.map((r) => (r.path === "/api/offers" ? { path: r.path, offerNumber: r.offerNumber, offerType: r.offerType, pricing: s.type === "ah" ? false : r.pricing, keys: [...r.keys, "client"].sort(), payloadIsOffer: true } : r)); // "client": the React app says who saves (server: sends/origin.ts)
      await waitFor(() => expect(seen.map((r) => (r.sent ? { ...r, sent: sameSecond(r.sent) } : r))).toEqual(want.map((r) => (r.sent ? { ...r, sent: sameSecond(r.sent) } : r))));
      await waitFor(() => expect(handed).toEqual(a.handed.map((f) => f.replace(NUM, "<new number>"))));
      await waitFor(() => expect(router.state.location.pathname.split("/").pop()).toBe(a.view.step));
      if (a.view.step !== "Zusammenfassung") await waitFor(() => expect(screen.queryByTestId("zf-studio")).toBeNull()); // the other step is on the page
      expect(sameSecond(masked(changed(before, offer()))), `stored after ${a.act.join(" ")}`).toEqual(sameSecond(masked(a.stored)));
      if (fails) { // today: silence, a browser alert or the server's raw answer — here always a message in words
        await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1));
        if (a.view.preview) expect({ ...preview(), status: "" }).toEqual({ ...a.view.preview, status: "" });
      } else {
        await waitFor(() => expect(toasts()).toEqual(a.toasts.map((t) => t.map((x) => x.replace(NUM, "<new number>")))));
        if (a.view.step === "Zusammenfassung") await waitFor(() => expect(preview()).toEqual(a.view.preview));
      }
    }
  });
});

describe("the Dokumentenstudio — rules and what goes beyond the recordings", () => {
  const filled = SCENARIOS.find((s) => s.name === "Angebot as PDF")!;
  it("the offer could not be saved after the PDF: said in words, the file is handed over all the same", async () => {
    await open(filled);
    const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => (url === "/api/offers" ? json({ error: { code: "SAVE_FAILED", message: "Die Datenbank ist nicht erreichbar.", requestId: "t" } }, 503) : real(url, init)));
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: PDF" }));
    await waitFor(() => expect(handed).toEqual(["Angebot_TEST.pdf"]));
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Speichern fehlgeschlagen", { description: "Die Datenbank ist nicht erreichbar." });
  });

  // ---- audit 2026-11-17 ----
  const SENT = "ANG2026-1116-093000";
  const sentOffer = () => ({ ...offerOf(filled), offerNumber: SENT, zusammenfassung: { versand: { art: "mail", versendetAm: "2026-11-16T09:31:00.000Z" } } });
  const number = () => String((useOfferStore.getState().offer as unknown as Obj).offerNumber ?? "");

  // Deliberately different from the recordings (they show today's UI giving every DOCX / PDF a
  // new number): a number that was sent stays — renumbering it is "Neue Version erstellen" only.
  it.each(["Angebot: DOCX", "Angebot: PDF", "Kalkulation: DOCX", "Kalkulation: PDF"])("F5: %s of a sent offer keeps its number", async (button) => {
    await open(filled, sentOffer());
    await userEvent.setup().click(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toBe(SENT);
    expect(claims).toEqual([]); // no new number was minted
    expect((useOfferStore.getState().offer as unknown as Obj).zusammenfassung.versand.art).toBe("mail");
    for (const [, init] of vi.mocked(globalThis.fetch).mock.calls.filter(([u, i]) => u === "/api/offers" && (i as RequestInit)?.method === "POST")) expect(JSON.parse(String((init as RequestInit).body)).offerNumber).toBe(SENT);
  });
  it("F5: sent as the deal's sends say (the offer itself does not): the number stays too", async () => {
    sends = [{ sendId: "s1", offerNumber: SENT, status: "done", channel: "post" }];
    await open(filled, { ...offerOf(filled), offerNumber: SENT });
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([u]) => String(u).endsWith("/sends"))).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: DOCX" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toBe(SENT);
  });
  it("F5: a number that was not sent is renumbered as today; one whose sends are not known is kept", async () => {
    sends = [{ sendId: "s0", offerNumber: SENT, status: "done", channel: "bitrix" }, { sendId: "s1", offerNumber: SENT, status: "failed", channel: "email" }]; // filed only, and a failed mail: not sent
    await open(filled, { ...offerOf(filled), offerNumber: SENT });
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([u]) => String(u).endsWith("/sends"))).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: DOCX" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toMatch(/^ANG\d{4}-\d{4}-\d{6}$/);
    expect(number()).not.toBe(SENT);
  });
  it("F5: the sends are not known (no answer): the number is kept", async () => {
    await open(filled, { ...offerOf(filled), offerNumber: SENT }); // sends = null: the server does not answer
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: DOCX" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toBe(SENT);
  });
  it("F5: a sent offer that was changed gets no second PDF under its number — the action is offered instead", async () => {
    await open(filled, sentOffer());
    const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => (url === "/api/offers" ? json({ error: { code: "OFFER_CHANGED", message: "Dieses Angebot wurde bereits versendet und kann nicht geändert werden.", requestId: "t" } }, 409) : real(url, init)));
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: PDF" }));
    const note = await screen.findByTestId("zf-studio-changed");
    expect(handed).toEqual([]);
    expect(note.textContent).toContain("Unter der versendeten Nummer wird kein neues PDF erstellt");
    expect(within(note).getByRole("button", { name: "Neue Version erstellen" })).toBeTruthy();
    expect(number()).toBe(SENT);
  });

  it("F13: \"Kalkulation · Neue Version\" on an offer without a number gives the offer the number it is saved under", async () => {
    const o = offerOf(filled); delete o.offerNumber;
    await open(filled, o);
    await userEvent.setup().click(screen.getByRole("button", { name: "Kalkulation: Neue Version" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toMatch(/^ANG\d{4}-\d{4}-\d{6}$/);
    const saved = vi.mocked(globalThis.fetch).mock.calls.filter(([u, i]) => u === "/api/offers" && (i as RequestInit)?.method === "POST").map(([, i]) => JSON.parse(String((i as RequestInit).body)));
    expect(saved).toHaveLength(1);
    expect(saved[0].offerNumber).toBe(number());
    expect(saved[0].payload.offerNumber).toBe(number());
  });
  it("F13: with a number, \"Kalkulation · Neue Version\" keeps it (as today)", async () => {
    sends = [];
    await open(filled, { ...offerOf(filled), offerNumber: SENT });
    await userEvent.setup().click(screen.getByRole("button", { name: "Kalkulation: Neue Version" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toBe(SENT);
  });

  it("F12: a new number is registered; one that is taken is replaced by the server's and said", async () => {
    vi.spyOn(toast, "info");
    const o = offerOf(filled); delete o.offerNumber;
    claimAnswer = { ok: true, offerNumber: "ANG2026-1117-101502", changed: true, reason: "taken" };
    await open(filled, o);
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: DOCX" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(claims).toHaveLength(1);
    expect(claims[0]!.current).toMatch(/^ANG\d{4}-\d{4}-\d{6}$/);
    expect(claims[0]!.claimId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(number()).toBe("ANG2026-1117-101502");
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(`Die Angebotsnummer ${claims[0]!.current} war bereits vergeben. Dieses Angebot hat jetzt die Nummer ANG2026-1117-101502.`);
    // the document was made from the offer with the number it has in the end
    const made = vi.mocked(globalThis.fetch).mock.calls.filter(([u]) => u === "/docx-template").map(([, i]) => JSON.parse(String((i as RequestInit).body)));
    expect(made.at(-1).offerNumber).toBe("ANG2026-1117-101502");
  });
  it("F12: the register does not answer (offline, older server): the minted number stays", async () => {
    const o = offerOf(filled); delete o.offerNumber;
    await open(filled, o);
    const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => { if (url === "/api/offer-numbers/claim") throw new TypeError("Failed to fetch"); return real(url, init); });
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: DOCX" }));
    await waitFor(() => expect(handed).toHaveLength(1));
    expect(number()).toMatch(/^ANG\d{4}-\d{4}-\d{6}$/);
  });

  it("an open preview is made again when the offer changes, and the old one stays meanwhile", async () => {
    await open(filled);
    await userEvent.setup().click(screen.getByRole("button", { name: "Angebot: Vorschau anzeigen" }));
    await waitFor(() => expect(preview()?.status).toBe("Angebot Vorschau bereit."));
    seen = [];
    useOfferStore.getState().patch("docSelection" as never, { barrierefrei: false } as never);
    await waitFor(() => expect(preview()?.status).toBe("Angebot Vorschau automatisch aktualisiert."), { timeout: 2500 });
    expect(seen.map((r) => r.path)).toEqual(["/api/docx/pdf-preview"]);
    expect(preview()?.pdf).toBe(true);
  });

  it("offer number, CSV name, file name of the server, cards per offer type", () => {
    expect(newOfferNumber(new Date(2026, 2, 5, 7, 8, 9))).toBe("ANG2026-0305-070809");
    expect(csvName("ANG 2026/1")).toBe("Hassmann_Warenkorb_ANG_2026_1.csv");
    expect(filenameOf('attachment; filename="Angebot_1.pdf"')).toBe("Angebot_1.pdf");
    expect(filenameOf("attachment; filename*=UTF-8''Angebot%20M%C3%BCller.pdf")).toBe("Angebot Müller.pdf");
    expect(filenameOf(null)).toBe("");
    expect(cardsOf("ah").map((c) => c.title)).toEqual(["Angebot", "Kalkulation"]);
    expect(Object.values(ACTIONS).filter((a) => a.kind === "download" && a.stamp).map((a) => a.kind === "download" && a.path)).toEqual(["/docx-template", "/docx-template/pdf", "/kalkulation/docx", "/kalkulation/pdf"]);
  });
});
