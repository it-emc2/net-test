// Product pictures and plan photos must do what today's UI does: the same list of products with
// the same ticks, the same extra attachment, the same preview request, the same fields in the
// send, and the same pictures (made smaller, named) for Bitrix only. Reference:
// fixtures/versand-bilder.json, recorded from today's UI by v2/scripts/capture-versand-bilder.cjs.
// On purpose different, matched below as such: what today says in a browser alert is a toast.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { NO_PICTURES, fitted, isTicked, jpgName, leftOut, pictureFields, picturesFile, planName, withOwnPicture, withProducts, type Product } from "../src/features/steps/versand/pictures.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/versand-bilder.json" with { type: "json" };
import { renderApp } from "./helpers.js";

process.env.TZ = "Europe/Berlin";

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface Tile { name: string; meta: string }
interface Row { id: string; name: string; finish: string; qty: string; checked: boolean; disabled: boolean; picture: string; upload: string }
interface View {
  attachments: Tile[]; count: string; bitrixFiles: Tile[]; bitrixCount: string;
  prod: { label: string; checked: boolean; open: boolean; hint: string; preview: string; rows: Row[] };
  plan: { label: string; title: string; text: string }; opened: [string, string][];
}
interface Act { act: string[]; requests: Obj[]; toasts: string[][]; alerts: string[]; stored: Obj; view: View }
interface Scenario { name: string; type: string; offer: Obj; pre: unknown[][]; answers: [string, number, Obj][]; products: Product[] | null; view: View; acts: Act[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;
const FILES = reference.files as unknown as Record<string, [string, string, string] | null>;
const NUM = /ANG\d{4}-\d{4}-\d{6}/g, NUMBER = "ANG2026-1116-093000";
const mask = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null).replace(NUM, "<number>").replace(/Grundriss_\d{4}-\d{2}-\d{2}_/g, "Grundriss_<date>_").replace(/(Nur Bitrix · )[\d.,]+ (B|KB|MB)/g, "$1<size>"));
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return JSON.parse(JSON.stringify(o).replace(NUM, NUMBER)); };
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const short = (o: Obj | undefined) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, String(v).slice(0, 22)]));

// ---- the fake server ----
let seen: Obj[] = [], answers: Record<string, [number, Obj][]> = {}, before: Obj = {}, products: Product[] = [], opened: [string, string][] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const v2 = (status: number, body: Obj) => (status === 204 ? new Response(null, { status }) : status < 400 ? json(body, status) : json({ ...body, error: { code: "FAILED", message: String(body.error ?? ""), requestId: "t" } }, status));
function server(s: Scenario, payload: Obj) {
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input), method = init.method ?? "GET", path = url.split("?")[0]!;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    const answer = (k: string) => { const a = answers[k]?.shift(); return a ? v2(a[0], a[1]) : null; };
    if (url === "/api/auth/me") return json({ user: { email: "capture@local.test", name: "Capture", role: "user" } });
    if (url === "/api/users") return json(reference.users);
    if (url === `/api/deals/${KEY}/draft` && method === "GET") return json({ dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" });
    if (url === `/api/deals/${KEY}/draft` && method === "PUT") return json({ dealId: KEY, revision: 4, changed: true });
    if (url === "/api/price") return json({ total: 10, selfPayAmount: 0 });
    if (url === "/api/price/inputs") return json({});
    if (url === "/api/offers" && method === "POST") { seen.push({ path: url, offerNumber: mask(body.offerNumber), offerType: body.offerType, payload: Object.keys(changed(before, body.payload ?? {})) }); return json({ ok: true }); }
    if (url === "/api/email/product-image-list") { seen.push({ path: url, keys: Object.keys(body).sort(), payload: changed(before, body.payload ?? {}) }); return answer(url) ?? json({ products }); }
    if (url === "/api/email/preview-product-image-pdf") {
      seen.push({ path: url, keys: Object.keys(body).sort(), payload: changed(before, body.payload ?? {}), excludeProductImageIds: body.excludeProductImageIds, custom: short(body.productCustomImageData) });
      return answer(url) ?? new Response("%PDF-1.4 bilder", { status: 200, headers: { "content-type": "application/pdf" } });
    }
    if (url === "/api/email/send-offer") {
      const form = init.body as FormData, fields: Obj = {}, files: Record<string, string[]> = {};
      for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v; else (files[k] ??= []).push(v.name);
      const { payload: p, sendId, ...rest } = fields;
      if (rest.productCustomImageData) rest.productCustomImageData = JSON.stringify(short(JSON.parse(rest.productCustomImageData)));
      seen.push({ path: url, fields: mask(rest), files: mask(files), payload: Object.keys(changed(before, JSON.parse(p))), sendId: typeof sendId === "string" && sendId.length > 10 });
      return answer(url) ?? json(reference.sent);
    }
    const bx = path.match(/^\/api\/bitrix\/deal\/([^/]+)\/(.+)$/);
    if (bx && method === "POST") {
      const b = body && typeof body.payload === "string" ? { ...body, payload: "<the offer>" } : body;
      seen.push({ path: `/api/bitrix/deal/<id>/${bx[2]}`, deal: bx[1], body: mask(b) });
      return json({ ok: true });
    }
    if (method === "POST" && path in FILES) {
      seen.push({ path: url, sent: Object.keys(changed(before, body)) });
      const f = FILES[path];
      return f ? new Response(f[2], { status: 200, headers: { "content-type": f[0], "content-disposition": `attachment; filename="${f[1]}"` } }) : new Response(null, { status: 204 });
    }
    return json({ error: { code: "NOT_FOUND", message: `kein Handler: ${method} ${url}`, requestId: "t" } }, 404);
  }));
}
/** a picture of 2400 × 1200 px, as the recording chose (the test's DOM draws nothing) */
const BIG = { width: 2400, height: 1200 };
let drawn: { width: number; height: number }[] = [];
beforeEach(() => {
  seen = []; answers = {}; opened = []; drawn = []; products = structuredClone(reference.products) as Product[];
  for (const k of ["error", "success", "warning", "info"] as const) vi.spyOn(toast, k);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ ...BIG, close() {} })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {} } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) { drawn.push({ width: this.width, height: this.height }); cb(new Blob(["jpeg"], { type: "image/jpeg" })); });
  URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn();
  vi.spyOn(window, "open").mockImplementation((url, target) => { opened.push([String(url).startsWith("blob:") ? "blob:" : String(url), String(target)]); return null; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// ---- what the page shows ----
const part = (el: Element | null | undefined, name: string) => flat(el?.querySelector(`[data-part="${name}"]`)?.textContent);
const tiles = (sec: Element): Tile[] => Array.from(sec.querySelectorAll('[data-testid="zf-mail-file"]')).map((t) => ({ name: part(t, "name"), meta: part(t, "meta") }));
function shown(): View {
  const mail = screen.getByTestId("zf-mail-files"), bx = screen.getByTestId("zf-bitrix-files"), pics = screen.getByTestId("zf-pictures"), plan = screen.getByTestId("zf-plan");
  const box = pics.querySelector<HTMLInputElement>("#zf-pictures-on")!, panel = pics.querySelector('[data-part="panel"]');
  return mask({
    attachments: tiles(mail), count: part(mail, "count"), bitrixFiles: tiles(bx), bitrixCount: part(bx, "count"),
    prod: {
      label: flat(pics.querySelector('label[for="zf-pictures-on"]')?.textContent), checked: box.checked, open: !!panel, hint: part(pics, "hint"),
      preview: panel ? flat(within(pics).queryByRole("button", { name: /Vorschau|Lade/ })?.textContent) : "",
      rows: within(pics).queryAllByTestId("zf-picture-row").map((r) => {
        const cb = r.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        return { id: r.dataset.product!, name: part(r, "name"), finish: part(r, "finish"), qty: part(r, "qty"), checked: cb.checked, disabled: cb.disabled, picture: r.dataset.picture!, upload: r.querySelector<HTMLElement>("button")!.title };
      }),
    },
    plan: { label: plan.getAttribute("aria-label")!, title: part(plan, "title"), text: part(plan, "text") },
    opened: [...opened],
  });
}
/** the recording; with the tick off today keeps the rows in the page, hidden — here they are not drawn */
const expected = (v: View): View => ({ attachments: v.attachments, count: v.count, bitrixFiles: v.bitrixFiles, bitrixCount: v.bitrixCount, prod: v.prod.open ? v.prod : { ...v.prod, rows: [] }, plan: v.plan, opened: v.opened });
const picture = (name: string) => (name.endsWith(".txt") ? new File(["Notiz"], name, { type: "text/plain" }) : new File(["png"], name, { type: "image/png" }));

async function act(a: string[], user: ReturnType<typeof userEvent.setup>) {
  const [kind, x] = a, pics = () => screen.getByTestId("zf-pictures");
  const row = (id: string) => within(pics()).getAllByTestId("zf-picture-row").find((r) => r.dataset.product === id)!;
  if (kind === "prodimg") await user.click(pics().querySelector<HTMLElement>("#zf-pictures-on")!);
  else if (kind === "prod") await user.click(row(x!).querySelector<HTMLElement>('input[type="checkbox"]')!);
  else if (kind === "prodfile") await user.upload(row(x!).querySelector<HTMLInputElement>('input[type="file"]')!, new File(["png"], "eigenes.png", { type: "image/png" }));
  else if (kind === "prodpreview") await user.click(within(pics()).getByRole("button", { name: "PDF Vorschau" }));
  else if (kind === "plan") await user.upload(screen.getByTestId("zf-plan-input"), a.slice(1).map(picture));
  else if (kind === "untile") await user.click(within(screen.getByTestId("zf-mail-files")).getByRole("button", { name: new RegExp(`^${x}.* entfernen$`) }));
  else if (kind === "deal") fireEvent.change(screen.getByLabelText("Lead ID / Auftrag ID", { selector: "#zf-mail-deal" }), { target: { value: x } });
  else if (kind === "send") await user.click(screen.getByTestId("zf-send").querySelector<HTMLElement>('[data-action="send"]')!);
  else if (kind === "hp") { const main = await screen.findByTestId("zf-main"); for (const b of within(main).getAllByRole("checkbox")) await user.click(b); await user.click(within(main).getByRole("button", { name: "Bestätigt – senden" })); }
  else if (kind === "close") await user.click(within(await screen.findByTestId("zf-sent")).getByRole("button", { name: "Schließen" }));
  else throw new Error(`act not handled: ${kind}`);
}

describe("product pictures and plan photos do what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    server(s, offerOf(s));
    if (s.products) products = s.products;
    for (const [path, status, body] of s.answers) (answers[path] ??= []).push([status, body]);
    renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
    await screen.findByTestId("zf-send");
    const user = userEvent.setup({ applyAccept: false });
    for (const p of s.pre as string[][]) await act(p, user);
    await waitFor(() => expect(shown()).toEqual(expected(s.view)));
    for (const a of s.acts) {
      seen = []; opened = []; before = structuredClone(offer());
      for (const m of ["error", "success", "warning", "info"] as const) vi.mocked(toast[m]).mockClear();
      await act(a.act, user);
      const want = a.requests.filter((r) => r.path !== "/api/drafts").map((r) => {
        if (r.path === "/api/email/send-offer") return { path: r.path, fields: Object.fromEntries(Object.entries(r.fields as Obj).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\r\n/g, "\n") : v])), files: r.files, payload: Object.keys(r.payload), sendId: true };
        if (r.sent) return { path: r.path, sent: Object.keys(r.sent) };
        if (r.path === "/api/offers") return { ...r, payload: Object.keys(r.payload) };
        return r;
      });
      await waitFor(() => expect(mask(seen)).toEqual(mask(want)), { timeout: 3000 });
      if (a.act[0] !== "send" && a.act[0] !== "hp") await waitFor(() => expect(shown()).toEqual(expected(a.view)));
      // what today says in an alert is a toast here; the words are the same
      const said = (["error", "success", "warning", "info"] as const).flatMap((m) => vi.mocked(toast[m]).mock.calls.map((c) => String(c[0])));
      expect(said.sort()).toEqual([...a.toasts.map((t) => t[1]!), ...a.alerts].sort());
      const stored = changed(before, offer());
      if (a.stored.zusammenfassung) expect(stored.zusammenfassung?.versand?.art).toBe(a.stored.zusammenfassung.versand.art);
      else expect(stored).toEqual({});
    }
  });
});

describe("pictures — rules and what goes beyond the recordings", () => {
  const P = reference.products as Product[];
  it("ticks: the server's proposal, never without a picture, kept when the list comes again", () => {
    let s = withProducts({ ...NO_PICTURES, on: true }, P);
    expect(P.map((p) => isTicked(p, s))).toEqual([true, false, true, false]);
    s = { ...s, ticks: { ...s.ticks, V3WV997: true, SLA90120: false } };
    s = withProducts(s, P);
    expect(leftOut(s)).toEqual(["SLA90120", "KM02"]);
    s = withOwnPicture(s, "KM02", "data:image/png;base64,AAAA");
    expect(leftOut(s)).toEqual(["SLA90120"]);
  });

  it("the attachment: only with the tick on and a product ticked; its name follows the offer number", () => {
    const s = withProducts({ ...NO_PICTURES, on: true }, P);
    expect(picturesFile(s, "ANG2026-1116-093000")).toEqual({ name: "Produktbilder_ANG2026-1116-093000.pdf", meta: "Produktbilder" });
    expect(picturesFile(s, "")?.name).toBe("Produktbilder_Angebot.pdf");
    expect(picturesFile({ ...s, on: false }, "x")).toBeNull();
    expect(picturesFile({ ...s, ticks: {}, products: P.map((p) => ({ ...p, defaultInclude: false })) }, "x")).toBeNull();
  });

  it("the send says nothing about pictures while the tick is off", () => {
    expect(pictureFields(withProducts(NO_PICTURES, P))).toEqual({ includeProductImages: "" });
    expect(pictureFields(withProducts({ ...NO_PICTURES, on: true }, P))).toEqual({ includeProductImages: "1", excludeProductImageIds: JSON.stringify(["V3WV997", "KM02"]), productCustomImageData: "{}" });
  });

  it("plan pictures: longest side 1600 px, never made larger; names that say nothing are replaced", () => {
    expect(fitted(2400, 1200)).toEqual({ width: 1600, height: 800 });
    expect(fitted(1200, 2400)).toEqual({ width: 800, height: 1600 });
    expect(fitted(640, 480)).toEqual({ width: 640, height: 480 });
    expect(jpgName("Bad Aufmass.png")).toBe("Bad Aufmass.jpg");
    expect(planName("image.jpg", "2026-11-16", 2)).toBe("Grundriss_2026-11-16_2.jpg");
    expect(planName("Bad Aufmass.jpg", "2026-11-16", 1)).toBe("Bad Aufmass.jpg");
  });

  it("a picture is drawn at the fitted size before it goes to Bitrix", async () => {
    const s = SCENARIOS.find((x) => x.name === "a screenshot as plan")!;
    server(s, offerOf(s));
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByTestId("zf-send");
    await userEvent.setup().upload(screen.getByTestId("zf-plan-input"), picture("image.png"));
    await waitFor(() => expect(drawn).toEqual([{ width: 1600, height: 800 }]));
  });

  it("a picture pasted on the plan zone is taken like a chosen one", async () => {
    const s = SCENARIOS.find((x) => x.name === "a screenshot as plan")!;
    server(s, offerOf(s));
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByTestId("zf-send");
    fireEvent.paste(screen.getByTestId("zf-plan"), { clipboardData: { files: [picture("image.png")] } });
    await waitFor(() => expect(tiles(screen.getByTestId("zf-bitrix-files")).map((t) => t.name)).toEqual([expect.stringMatching(/^Grundriss_\d{4}-\d\d-\d\d_1\.jpg$/)]));
  });
});
