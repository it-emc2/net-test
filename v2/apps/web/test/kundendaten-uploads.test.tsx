// The upload boxes of Kundendaten ("Freigabe der Kasse", "Bestätigung des Vermieters") must be
// on the page where today's UI has them, say what it says, send what it sends and store what it
// stores. The reference (fixtures/kundendaten-uploads.json) is recorded from today's UI by
// v2/scripts/capture-kundendaten-uploads.cjs; here the same acts are made in the React screen.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { MAX_BYTES, dealNumber, failed, fileName, landlordAnswer, refusal, showKasse, showVermieter, uploaded } from "../src/features/steps/kundendaten/uploads.js";
import recorded from "./fixtures/kundendaten-uploads.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const GROUP: Record<string, string> = {
  payer: "Ist der Kunde Selbstzahler oder Kassenkunde?", wohnsituation: "Angabe zur Wohnsituation",
  vermieterGenehmigungErforderlich: "Genehmigung des Vermieters erforderlich?", vermieterGenehmigung: "Genehmigung des Vermieters liegt vor?",
};
const TYPE: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", txt: "text/plain" };
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// what differs from `base` (dotted paths) — as the recorder writes it
function changed(base: unknown, now: unknown) {
  const out: Record<string, unknown> = {};
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const walk = (a: unknown, b: unknown, p: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (obj(a) && obj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  walk(base, now, "");
  for (const k of Object.keys(out)) if (/^mail\.(subject|body)$|^offerNumber$|^Kundendaten\.(date|ansprechpartner|emc2_contact)$/.test(k)) delete out[k];
  return out;
}

type View = (typeof recorded.scenarios)[number]["view"];
/** what the React page shows, in the recorder's words */
function shown() {
  const box = (kind: string) => {
    const el = screen.queryByTestId(`kd-upload-${kind}`);
    if (!el) return null;
    const part = (name: string) => (el.querySelector(`[data-part="${name}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim();
    return { label: part("label"), state: el.querySelector('[data-part="box"]')!.getAttribute("data-state"), title: part("title"), hint: part("hint"), accept: (within(el).getByTestId(`kd-upload-${kind}-file`) as HTMLInputElement).accept };
  };
  const answer = screen.queryByRole("group", { name: GROUP.vermieterGenehmigung });
  return { kasse: box("kasse"), vermieter: box("vermieter"), approvalAsked: !!answer, approval: (answer?.querySelector("input:checked") as HTMLInputElement | null)?.value ?? "" };
}
/** Today's words → the React page's, where they differ on purpose (UX-CHANGES U-024):
 *  - no connection / an answer without a message: today the browser's words ("Failed to fetch")
 *    or the bare status ("502"); the React page says it in German
 *  - an answer that is not asked (the home is not rented) is not marked on the React page: today
 *    the hidden answer is ticked, and stored only once "Miete" is chosen — the React page stores it then too */
function expected(view: View) {
  const v = copy(view) as any;
  for (const k of ["kasse", "vermieter"]) if (v[k]) v[k].hint = v[k].hint.replace(/^Failed to fetch – /, "Keine Verbindung zum Server – ").replace(/^502 – /, "Der Server hat mit einem Fehler geantwortet (502) – ");
  if (!v.approvalAsked) v.approval = "";
  return v;
}

async function choose(field: string, value: string) {
  await userEvent.click(within(screen.getByRole("group", { name: GROUP[field]! })).getByRole("radio", { name: value }));
}

describe("Kundendaten: the uploads to the Bitrix deal behave as in today's UI", () => {
  it.each(recorded.scenarios.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    // the server: every upload is answered from the queue (default: done, field kept all files)
    const answers: { status: number; body: unknown }[] = [];
    let hold = false, offline = false, release = () => {};
    const server = fakeServer({ ...BASE, "POST /api/bitrix/deal/*/upload/*": () => answers.shift() ?? { body: { ok: true, kept: true } } });
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (/\/upload\//.test(url)) {
        if (offline) { offline = false; await inner(url, init); throw new TypeError("Failed to fetch"); }
        if (hold) { hold = false; const res = await inner(url, init); await new Promise<void>((go) => { release = go; }); return res; }
      }
      return inner(url, init);
    });
    const uploads = () => server.calls.filter((c) => c.key.includes("/upload/")).map((c) => ({ method: c.key.split(" ")[0], path: c.key.split(" ")[1], body: c.body }));

    renderApp(`/deal/${KEY}/${s.type}/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    for (const [, field, value] of s.setup as [string, string, string][]) {
      if ((s.skipped as string[]).includes(field)) { expect(screen.queryByRole("group", { name: GROUP[field]! }), `${field} must not be offered`).toBeNull(); continue; }
      await choose(field, value);
    }
    expect(shown()).toEqual(expected(s.view));
    const base = copy(offer());

    const user = userEvent.setup({ applyAccept: false }); // a file of another kind can be chosen on a tablet ("all files")
    for (const a of s.acts) {
      const [kind, x, y, z] = a.act as [string, any, any, any];
      if (!("view" in a)) { if (kind === "answer") answers.push({ status: x, body: y }); else if (kind === "hold") hold = true; else offline = true; continue; } // about the server
      const from = uploads().length;
      if (kind === "deal") { const o = offer(); useOfferStore.getState().setTop({ auftragId: x, mail: { ...o.mail, auftragId: x }, postal: { ...o.postal, auftragId: x } }); } // as the deal field of Angebotsversand does
      else if (kind === "release") release();
      else if (kind === "radio") await choose(x, y);
      else if (kind === "file") await user.upload(screen.getByTestId(`kd-upload-${x}-file`), new File([z ? new Uint8Array(z * 1024 * 1024) : `inhalt ${y}`], y, { type: TYPE[y.split(".").pop()]! }));
      await waitFor(() => expect(shown()).toEqual(expected(a.view!)));
      expect(uploads().slice(from)).toEqual(a.requests);
      expect(changed(base, offer())).toEqual(a.stored);
    }
  });
});

describe("Kundendaten uploads: more than the recordings", () => {
  const open = async (path: string, handlers = {}) => {
    const server = fakeServer({ ...BASE, "POST /api/bitrix/deal/*/upload/*": { body: { ok: true, kept: true } }, ...handlers });
    renderApp(path);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    return server;
  };
  const pdf = (name = "Freigabe.pdf") => new File(["x"], name, { type: "application/pdf" });

  it("an offer opened under a deal number uploads to that deal without the number being typed", async () => {
    const server = await open("/deal/4711/bu/Kundendaten");
    await userEvent.upload(screen.getByTestId("kd-upload-kasse-file"), pdf());
    await waitFor(() => expect(shown().kasse?.state).toBe("ok"));
    expect(server.count("POST /api/bitrix/deal/4711/upload/kasse")).toBe(1);
  });

  it("a failed upload never stops „Weiter“", async () => {
    await open("/deal/4711/bu/Kundendaten", { "POST /api/bitrix/deal/*/upload/*": { status: 500, body: { error: { code: "BITRIX_ERROR", message: "Bitrix antwortet nicht", requestId: "r" } } } });
    for (const [field, value] of [["Vorname", "Erika"], ["Nachname", "Muster"]] as const) await userEvent.type(screen.getByLabelText(field), value);
    await userEvent.click(within(screen.getByRole("group", { name: "Anrede" })).getByRole("radio", { name: "Frau" }));
    await choose("vermieterGenehmigungErforderlich", "Nein");
    await userEvent.upload(screen.getByTestId("kd-upload-kasse-file"), pdf());
    await waitFor(() => expect(shown().kasse?.state).toBe("err"));
    await userEvent.click(screen.getByRole("link", { name: "Weiter zu Arbeiten" }));
    await screen.findByRole("heading", { name: /Arbeiten/ });
  });

  it("what a box says is still there after another step was visited; a new offer starts empty", async () => {
    await open("/deal/4711/bu/Kundendaten");
    await userEvent.upload(screen.getByTestId("kd-upload-kasse-file"), pdf());
    await waitFor(() => expect(shown().kasse?.state).toBe("ok"));
    expect((useOfferStore.getState().scratch.uploads as any).kasse.done).toEqual(["Freigabe.pdf"]);
    useOfferStore.getState().load(copy(offer()) as never, "4712");
    expect(useOfferStore.getState().scratch.uploads).toBeUndefined();
  });

  it("an answer that comes after the offer was closed does not land in the next offer", async () => {
    let release = () => {};
    await open("/deal/4711/bu/Kundendaten");
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => { const res = await inner(url, init); if (/\/upload\//.test(url)) await new Promise<void>((go) => { release = go; }); return res; });
    await choose("wohnsituation", "Miete");
    await userEvent.upload(screen.getByTestId("kd-upload-vermieter-file"), pdf("Vermieter.pdf"));
    await waitFor(() => expect(shown().vermieter?.state).toBe("busy"));
    useOfferStore.getState().load(copy(offer()) as never, "4712"); // another offer is opened meanwhile
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(useOfferStore.getState().scratch.uploads).toBeUndefined();
    expect(offer().Kundendaten.vermieterGenehmigung).toBeUndefined();
  });
});

describe("the rules of the upload boxes", () => {
  it("where the boxes are", () => {
    expect([showKasse("bu", "Kassenkunde"), showKasse("bl", "Kassenkunde"), showKasse("ah", "Kassenkunde"), showKasse("bu", "Selbstzahler")]).toEqual([true, true, false, false]);
    expect([showVermieter("bu", "Ja"), showVermieter("hl", "Ja"), showVermieter("bl", "Ja"), showVermieter("bu", "Nein"), showVermieter("bu", undefined)]).toEqual([true, true, false, false, false]);
  });
  it("the deal: the offer's number, else the deal it was opened under — digits only", () => {
    expect(dealNumber({ auftragId: " 65418 " }, "t-0123456789abcdef01234567")).toBe("65418");
    expect(dealNumber({ mail: { auftragId: "70001" } }, null)).toBe("70001");
    expect(dealNumber({}, "4711")).toBe("4711");
    expect(dealNumber({ auftragId: "abc" }, "4711")).toBe("abc"); // typed wrong: said, not replaced
    expect(dealNumber({}, "t-0123456789abcdef01234567")).toBe("");
  });
  it("what is refused before anything is sent", () => {
    expect(refusal("", 10)?.title).toBe("Auftrag ID fehlt");
    expect(refusal("t-1", 10)?.title).toBe("Auftrag ID fehlt");
    expect(refusal("65418", MAX_BYTES + 1)?.title).toBe("Datei zu groß");
    expect(refusal("65418", MAX_BYTES)).toBeNull();
  });
  it("texts", () => {
    expect(uploaded(["a.pdf", "b.jpg"], true).hint).toBe("a.pdf, b.jpg – tippen für weitere Datei");
    expect(uploaded(["a.pdf"], false).hint).toContain("nur die neueste Datei");
    expect(failed("Keine Verbindung zum Server.").hint).toBe("Keine Verbindung zum Server – tippen zum erneuten Versuch");
    expect([fileName("kasse", ""), fileName("vermieter", "x.pdf")]).toEqual(["kasse.jpg", "x.pdf"]);
  });
  it("the landlord's answer after a confirmation went up: Ja for a rented home only", () => {
    expect([landlordAnswer("Miete", true), landlordAnswer("Eigentum", true), landlordAnswer(undefined, true), landlordAnswer("Miete", false)]).toEqual([{ vermieterGenehmigung: "Ja" }, {}, {}, {}]);
  });
});
