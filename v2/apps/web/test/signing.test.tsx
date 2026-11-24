// The customer signing page (/sign/<token>) in React — replays the recordings of today's page
// (fixtures/signing.json, v2/scripts/capture-signing.cjs; check level Full): every scenario opens
// the React page with the server answers today's page got, does the same acts (same element ids:
// the document HTML is the server's, the signature controls keep today's ids) and must show the
// same texts and states and send the same requests with the same bodies. Signature pictures are
// compared as "<png>" (a drawing is never byte-equal). Deviations on purpose (U-068) are listed in
// KNOWN and applied to the recording before comparing.
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignPage } from "../src/features/signing/index.js";
import { FIELD_NAMES, missingFields, nextOpen, progressText, tokenFromPath, errorText, fileProblem, TEXT } from "../src/features/signing/rules.js";
import fx from "./fixtures/signing.json";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
vi.mock("../src/features/signing/picture.js", () => ({ typedNameToPng: () => PNG, fileToSignaturePng: async () => PNG }));

type Answer = { status: number; type: string; body: string };
type Req = { method: string; path: string; body: unknown; answer: Answer };
type Act = [string, string, (string | number)?];
type Scenario = { name: string; token: string; rep: boolean; view: any; requests: Req[]; acts: { act: Act; requests: Req[]; view: any }[] };
const SCENARIOS = fx.scenarios as unknown as Scenario[];

// ---- deviations on purpose (U-068), applied to what today's page showed ----
const COMPANY_TODAY = "EmC2 Inhaber Name"; // the recording's masked company line (owner's name)
const KNOWN: Record<string, (s: Scenario) => void> = {
  // today: the server's error answer (JSON text) is put into the page as the "document"
  "document cannot be loaded": (s) => { s.view.doc = { message: TEXT.docFailed, buttons: [], error: null, editable: [], typing: [false, false], uploading: [false, false], preview: [false, false] }; },
};
function expected(s0: Scenario): Scenario {
  const s = JSON.parse(JSON.stringify(s0)) as Scenario;
  const fix = (v: any) => { if (v?.expired?.contact) v.expired.contact = v.expired.contact.replace(COMPANY_TODAY, "EmC2"); };
  fix(s.view); s.acts.forEach((a) => fix(a.view));
  KNOWN[s.name]?.(s);
  return s;
}

// ---- the server: today's answers, in the order they came ----
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
function bodyOf(raw: unknown) {
  if (typeof raw !== "string" || !raw) return null;
  const b = JSON.parse(raw);
  const png = (v: unknown) => (typeof v === "string" && PNG_URL.test(v) ? "<png>" : v);
  if ("signatureImage" in b) b.signatureImage = png(b.signatureImage);
  if (b.extraFields && "bevollmaechtigterSignature" in b.extraFields) b.extraFields.bevollmaechtigterSignature = png(b.extraFields.bevollmaechtigterSignature);
  return b;
}
function server(s: Scenario) {
  const pool = [...s.requests, ...s.acts.flatMap((a) => a.requests)].map((r) => ({ ...r, used: false }));
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET", path = String(url);
    calls.push({ method, path, body: bodyOf(init.body) });
    const hit = pool.find((r) => !r.used && r.method === method && r.path === path);
    if (!hit) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `kein Handler: ${method} ${path}`, requestId: "t" } }), { status: 404 });
    hit.used = true;
    return new Response(hit.answer.body, { status: hit.answer.status, headers: { "content-type": hit.answer.type || "application/json" } });
  }));
  return calls;
}

// ---- what the customer sees, in the shape the recording script reads from today's page ----
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const shownEl = (el: Element | null): boolean => {
  for (let e: Element | null = el; e; e = e.parentElement) if ((e as HTMLElement).hidden || e.classList.contains("hidden") || (e as HTMLElement).style?.display === "none") return false;
  return !!el;
};
const text = (el: Element | null) => {
  if (!el) return null;
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll("br").forEach((b) => b.replaceWith(" "));
  return (c.textContent || "").replace(/\s+/g, " ").trim();
};
function shown() {
  const screenName = $("#loading") ? "loading" : $("#fatal") ? "fatal" : $("#expired") ? "expired" : $("main") ? "app" : null;
  const v: any = { screen: screenName };
  if (screenName === "fatal") v.fatal = text($("#fatal"));
  if (screenName === "expired") {
    const btn = $("#requestNewLink") as HTMLButtonElement | null, msg = $("#requestNewLinkMsg");
    v.expired = { heading: text($("#expired h1")), intro: text($("#expired p")), contact: text($("#expired .contact")),
      button: shownEl(btn) ? { text: text(btn), disabled: btn!.disabled } : null,
      message: shownEl(msg) ? { text: text(msg), kind: msg!.dataset.kind } : null };
  }
  if (screenName === "app") {
    v.title = text($(".title"));
    v.backLink = $("#backToOc") ? { text: text($("#backToOc")), href: $("#backToOc")!.getAttribute("href") } : null;
    v.nav = $("#docNav") ? { progress: text($("#progress")), prevDisabled: ($("#prevDoc") as HTMLButtonElement).disabled, nextDisabled: ($("#nextDoc") as HTMLButtonElement).disabled } : null;
    v.done = $("#doneCard") ? text($("#doneCard")) : null;
    const c = $("#docContainer");
    const own = c?.querySelector(":scope > p");
    v.doc = !c ? null : {
      message: own ? text(own) : null,
      buttons: [...c.querySelectorAll("button")].filter(shownEl).map((b) => ({ text: text(b), disabled: (b as HTMLButtonElement).disabled })),
      error: shownEl($("#docError")) ? text($("#docError")) : null,
      editable: [...c.querySelectorAll<HTMLInputElement>("[data-edit-field], input[name=pflegegrad]")].filter((i) => !i.disabled).map((i) => i.getAttribute("data-edit-field") || "pflegegrad:" + i.value),
      typing: [shownEl($("#typeWrap")), shownEl($("#typeWrap2"))],
      uploading: [shownEl($("#uploadWrap")), shownEl($("#uploadWrap2"))],
      preview: [shownEl($("#sigPreview")), shownEl($("#sigPreview2"))],
    };
  }
  return v;
}

async function doAct([kind, sel, arg]: Act) {
  const all = [...document.querySelectorAll<HTMLElement>(sel)];
  const el = all[typeof arg === "number" ? arg : 0];
  if (!el) throw new Error(`not found: ${sel}`);
  await act(async () => {
    if (kind === "click" || kind === "check") fireEvent.click(el);
    if (kind === "fill") fireEvent.change(el, { target: { value: arg } });
    if (kind === "upload") {
      const file = arg === "png" ? new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "unterschrift.png", { type: "image/png" }) : new File(["keine Unterschrift"], "notiz.txt", { type: "text/plain" });
      fireEvent.change(el, { target: { files: [file] } });
    }
    if (kind === "draw") {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 20, clientY: 40 });
      for (let k = 1; k <= 8; k++) fireEvent.pointerMove(el, { pointerId: 1, clientX: 20 + k * 25, clientY: 40 + (k % 2) * 50 });
      fireEvent.pointerUp(el, { pointerId: 1 });
    }
  });
}

beforeEach(() => {
  // jsdom has no canvas: a context that draws nothing and a fixed PNG
  const ctx = new Proxy({} as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : () => {}) });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => PNG);
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("signing page — replay of today's page", () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))("%s", async (_n, recorded) => {
    const s = expected(recorded);
    const calls = server(s);
    render(<SignPage pathname={`/sign/${s.token}`} internal={s.rep} />);
    const strip = (rs: Req[]) => rs.map(({ method, path, body }) => ({ method, path, body }));
    await waitFor(() => expect(shown()).toEqual(s.view));
    await waitFor(() => expect(calls).toEqual(strip(s.requests)));
    for (const [i, a] of s.acts.entries()) {
      const before = calls.length;
      await doAct(a.act);
      await waitFor(() => expect(shown()).toEqual(a.view));
      await waitFor(() => expect(calls.slice(before)).toEqual(strip(a.requests)), { timeout: 3000 }).catch((e) => { throw new Error(`act ${i} ${JSON.stringify(a.act)}: ${e.message}`); });
    }
    // only the signing routes of this one token were asked
    for (const c of calls) expect(c.path.startsWith(`/api/signing/${s.token}`)).toBe(true);
  });
});

describe("signing page — rules", () => {
  it("token from the address, as today", () => {
    expect(tokenFromPath("/sign/abc123")).toBe("abc123");
    expect(tokenFromPath("/sign/abc123//")).toBe("abc123");
    expect(tokenFromPath("/sign/")).toBe("");
    expect(tokenFromPath("/anders")).toBe("");
    expect(tokenFromPath("/sign/%E0%A4%A")).toBe(""); // not decodable
  });
  it("first open document, progress text with the person for a second signer", () => {
    const docs = [{ key: "angebot", status: "signed" }, { key: "vollmacht", label: "Vollmacht – Person 1 (A B)", status: "pending" }, { key: "vollmacht_p2", label: "Vollmacht – Person 2 (C D)", status: "pending" }];
    expect(nextOpen(docs, 0)).toBe(1);
    expect(nextOpen(docs.map((d) => ({ ...d, status: "signed" })), 0)).toBe(3);
    expect(progressText(docs, 0)).toBe("Dokument 1 von 3");
    expect(progressText(docs, 1)).toBe("Dokument 2 von 3 – Vollmacht – Person 1 (A B)");
    expect(progressText(docs, 2)).toBe("Dokument 3 von 3 – Vollmacht – Person 2 (C D)");
  });
  it("required fields of Vollmacht and Abtretung (also of the second person), in the document's order", () => {
    expect(missingFields("angebot", {})).toEqual([]);
    expect(missingFields("vollmacht_p2", { lastName: "X" })).toEqual(["Vorname", "Straße", "PLZ", "Ort", "Telefon", "Geburtsdatum", "Krankenkasse", "KVNR"]);
    expect(missingFields("abtretung_ah", { lastName: "X", firstName: " " })).toContain("Pflegegrad");
  });
  it("error texts of the server: v2 object, plain text, nothing", () => {
    expect(errorText({ error: { code: "X", message: "Text", requestId: "r" } })).toBe("Text");
    expect(errorText({ error: "Alt" })).toBe("Alt");
    expect(errorText({})).toBeNull();
    expect(errorText(null)).toBeNull();
  });
  it("uploaded files: images up to 10 MB", () => {
    expect(fileProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(fileProblem({ type: "text/plain", size: 10 })).toBe(TEXT.notAnImage);
    expect(fileProblem({ type: "image/png", size: 11 * 1024 * 1024 })).toBe(TEXT.tooBig);
    expect(fileProblem(null)).toBe(TEXT.notAnImage);
  });
});

describe("signing page — new on purpose (U-068) and accessibility", () => {
  const one = SCENARIOS.find((s) => s.name === "kasse: Vollmacht with missing fields")!;
  it("no connection: a clear message instead of the browser's error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<SignPage pathname="/sign/abc" internal={false} />);
    await waitFor(() => expect(text($("#fatal"))).toBe(TEXT.offline));
  });
  it("no token in the address: today's text, no request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<SignPage pathname="/sign/" internal={false} />);
    await waitFor(() => expect(text($("#fatal"))).toBe(TEXT.invalidLink));
    expect(f).not.toHaveBeenCalled();
  });
  it("the document is the server's HTML; every field has a name; the page's own controls are 48 px buttons", async () => {
    server(expected(one));
    render(<SignPage pathname={`/sign/${one.token}`} internal={false} />);
    await waitFor(() => expect($("#submitBtn")).not.toBeNull());
    // the server's text and fields are there, its own signature placeholders are not
    const html = one.requests.find((r) => r.path.endsWith("/html"))!.answer.body;
    expect(html).toContain('id="sigCanvas"');
    expect(document.querySelectorAll("#sigCanvas")).toHaveLength(1);
    expect($("#sigCanvas")!.tagName).toBe("CANVAS");
    expect($("[data-sign-mount=sig] #sigCanvas")).not.toBeNull();
    expect(document.querySelectorAll("#submitBtn")).toHaveLength(1);
    expect(document.querySelectorAll("[data-edit-field]").length).toBe((html.match(/data-edit-field="/g) || []).length);
    for (const i of document.querySelectorAll<HTMLInputElement>("#docContainer input")) {
      const named = i.getAttribute("aria-label") || (i.id && document.querySelector(`label[for="${i.id}"]`)) || i.closest("label");
      expect([i.outerHTML.slice(0, 80), !!named]).toEqual([i.outerHTML.slice(0, 80), true]);
      const key = i.getAttribute("data-edit-field");
      if (key && FIELD_NAMES[key]) expect(i.getAttribute("aria-label")).not.toBe(key);
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>("#docContainer [data-sign-mount] button, #docNav button")) expect(b.className).toMatch(/min-h-1[24]/);
    expect($("#sigCanvas")!.getAttribute("aria-label")).toBe(TEXT.padLabel);
    expect($("#docError")!.getAttribute("role")).toBe("alert");
  });
  it("a document that cannot be loaded says so (today: the server's error text as the document)", async () => {
    const s = expected(SCENARIOS.find((x) => x.name === "document cannot be loaded")!);
    server(s);
    render(<SignPage pathname={`/sign/${s.token}`} internal={false} />);
    await waitFor(() => expect(text($("#docContainer [role=alert]"))).toBe(TEXT.docFailed));
  });
});
