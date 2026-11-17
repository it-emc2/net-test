// The Vermieter confirmation upload (Kundendaten) must send and show what today's UI does for the
// same inputs. Reference: fixtures/vermieter-upload.json, recorded from today's UI by
// v2/scripts/capture-vermieter-upload.cjs (the upload answer is faked there as here).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { sizeText } from "../src/features/steps/kundendaten/VermieterUpload.js";
import reference from "./fixtures/vermieter-upload.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type Answer = { status: number; body: unknown };
const offer = () => useOfferStore.getState().offer as Record<string, any>;
async function open(deal: string, answers: Answer[], owner = false) {
  let n = 0;
  const server = fakeServer({ ...BASE, [`POST /api/bitrix/deal/${deal || "x"}/upload/vermieter`]: () => answers[n++] ?? { status: 200, body: { ok: true } } });
  renderApp(`/deal/${deal || "t-0123456789abcdef01234567"}/bu/Kundendaten`);
  await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
  await userEvent.setup().click(screen.getByRole("radio", { name: owner ? "Eigentum" : "Miete" }));
  return server;
}
const choose = (label: string, name: string, bytes: number, type: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [new File([new Uint8Array(bytes)], name, { type })] } });

describe("Vermieter upload sends and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, sc) => {
    const s = sc as unknown as { deal: string; files: [string, number][]; requests: { filename: string; base64Length: number; keys: string[]; method: string }[]; view: { shown: boolean; state: string; title: string; hint: string; liegtVor: string }[] };
    const server = await open(s.deal, (sc as unknown as { answers?: Answer[] }).answers ?? answersOf(sc.name), sc.name.includes("Eigentum"));
    expect(!!screen.queryByTestId("vermieter-upload")).toBe(s.view[0]!.shown);
    for (const [i, [name, bytes]] of s.files.entries()) {
      choose("Datei der Vermieter-Bestätigung", name, bytes, name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      const want = s.view[i + 1]!;
      await waitFor(() => expect(screen.getByRole("status").textContent!.startsWith(want.title)).toBe(true));
      if (want.state === "err") expect(screen.getByRole("status").textContent).toContain(want.hint);
      expect((offer().Kundendaten?.vermieterGenehmigung ?? "")).toBe(want.liegtVor);
    }
    const sent = server.calls.filter((c) => c.key.includes("/upload/vermieter")).map((c) => c.body as { filename: string; base64: string });
    expect(sent.map((b) => ({ filename: b.filename, base64Length: b.base64.length, keys: Object.keys(b).sort() }))).toEqual(s.requests.map(({ filename, base64Length, keys }) => ({ filename, base64Length, keys })));
    expect(server.calls.filter((c) => c.key.includes("/upload/vermieter")).every((c) => c.key.startsWith("POST /api/bitrix/deal/4711/"))).toBe(true);
  });
});

// the answers the recording faked (see the SCENARIOS of the capture script)
function answersOf(name: string): Answer[] {
  const err = { status: 500, body: { error: "Bitrix nicht erreichbar" } }, ok = { status: 200, body: { ok: true } };
  if (name === "upload: server error") return [err];
  if (name === "upload: error, then ok") return [err, ok];
  if (name === "upload: field keeps only the newest") return [{ status: 200, body: { ok: true, kept: false } }];
  return [ok, ok];
}

describe("Vermieter upload — chips and buttons", () => {
  it("a file chip shows name and size and can be removed; the Foto button takes a camera picture", async () => {
    await open("4711", []);
    const photo = screen.getByLabelText("Foto der Vermieter-Bestätigung") as HTMLInputElement;
    expect([photo.accept, photo.getAttribute("capture")]).toEqual(["image/*", "environment"]);
    choose("Foto der Vermieter-Bestätigung", "foto.jpg", 2048, "image/jpeg");
    const chip = await screen.findByTestId("vermieter-file");
    expect(chip.textContent).toContain("foto.jpg");
    expect(chip.textContent).toContain("2 KB");
    await waitFor(() => expect(chip.dataset.state).toBe("ok"));
    await userEvent.setup().click(within(chip).getByRole("button", { name: "foto.jpg aus der Liste entfernen" }));
    expect(screen.queryByTestId("vermieter-file")).toBeNull();
    expect([sizeText(500), sizeText(3.5 * 1024 * 1024)]).toEqual(["1 KB", "3,5 MB"]);
  });
});
