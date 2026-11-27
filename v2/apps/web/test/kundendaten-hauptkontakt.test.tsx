// Kundendaten → „Weiter“: the question whether the deal's Bitrix contact is the customer (owner
// 2026-11-27, rules: features/steps/kundendaten/main-contact.ts). Invented data: the deal's contact
// „Max Muster“ is the son; the customer typed in the offer is „Erika Muster“.
import { customerOfContact, type DealCustomerResponse } from "@oc/api-contract";
import { emptyOffer } from "@oc/domain";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const offer = () => useOfferStore.getState().offer as Record<string, any>;
const CONTACT = { ID: "7001", HONORIFIC: "HNR_DE_2", NAME: "Max", LAST_NAME: "Muster", PHONE: [{ VALUE: "+49 9281 000001" }], EMAIL: [{ VALUE: "max@example.test" }], ADDRESS: "Probeweg 3", ADDRESS_POSTAL_CODE: "95000", ADDRESS_CITY: "Teststadt", ADDRESS_REGION: "Bayern" };
const dealAnswer = (contact: Record<string, unknown> | null = CONTACT): Reply => ({
  body: { dealId: "4711", dealTitle: "Badumbau Test", customer: contact ? customerOfContact(contact) : null, vermieter: { erforderlich: false, liegtVor: null }, source: "batch", loadedAt: "2026-11-27T10:00:00.000Z" } satisfies DealCustomerResponse,
});
/** a saved offer of the deal with the customer typed (all „Weiter“ needs on Kundendaten) */
function draft(kd: Record<string, unknown> = {}, top: Record<string, unknown> = {}): Reply {
  const o = { ...emptyOffer("bu", { date: "2026-11-27" }), auftragId: "4711", ...top } as Record<string, any>;
  o.Kundendaten = { ...o.Kundendaten, salutation: "Frau", firstName: "Erika", lastName: "Muster", bitrixContactId: "7001", customerNumber: "7001", phone: "+49 9281 000001", street: "Probeweg 3", postalCode: "95000", city: "Teststadt", vermieterGenehmigungErforderlich: "Nein", ...kd };
  return { body: { dealId: "4711", revision: 3, offerType: "bu", payload: o, updatedAt: "2026-11-27T10:00:00.000Z", updatedBy: "ap@example.test" } };
}
async function open(handlers: Record<string, Reply | ((b: unknown) => Reply)> = {}) {
  const srv = fakeServer({ ...BASE, "GET /api/deals/*/draft": draft(), "GET /api/deals/4711/customer": dealAnswer(), ...handlers });
  const router = renderApp("/deal/4711/bu/Kundendaten");
  await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
  await waitFor(() => expect(srv.count("GET /api/deals/4711/customer")).toBe(1));
  await waitFor(() => expect(offer().Kundendaten.firstName).toBeTruthy());
  await new Promise((r) => setTimeout(r, 20)); // the deal's answer is in the query cache
  return { srv, step: () => router.state.location.pathname.split("/")[4] };
}
const weiter = () => userEvent.click(screen.getByRole("link", { name: "Weiter zu Arbeiten" }));
const dialog = () => screen.getByTestId("kd-main-contact");
const answer = (name: string) => userEvent.click(within(dialog()).getByRole("button", { name }));
const posts = (srv: { calls: { key: string; body: unknown }[] }) => srv.calls.filter((c) => c.key === "POST /api/bitrix/deal/4711/main-contact").map((c) => c.body);

describe("the question about the deal's main contact on leaving Kundendaten", () => {
  it("appears on „Weiter“ with both names; the step is not left until answered", async () => {
    const { step } = await open();
    await weiter();
    expect(await screen.findByTestId("kd-main-contact")).toBeInTheDocument();
    expect(within(dialog()).getByText("In Bitrix:")).toBeInTheDocument();
    expect(within(dialog()).getByText("Max Muster")).toBeInTheDocument();
    expect(within(dialog()).getByText("Im Angebot:")).toBeInTheDocument();
    expect(within(dialog()).getByText("Erika Muster")).toBeInTheDocument();
    expect(step()).toBe("Kundendaten");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Schließen" })); // closed: stays, nothing written
    expect(screen.queryByTestId("kd-main-contact")).toBeNull();
    expect(step()).toBe("Kundendaten");
  });

  it("also when the step is left through the step list", async () => {
    const { step } = await open();
    await userEvent.click(screen.getAllByRole("link", { name: /^Arbeiten/ })[0]!);
    expect(await screen.findByTestId("kd-main-contact")).toBeInTheDocument();
    expect(step()).toBe("Kundendaten");
  });

  it.each([
    ["the same name (case, spaces)", { firstName: " max ", lastName: "MUSTER" }, null],
    ["first and last name swapped", { firstName: "Muster", lastName: "Max" }, null],
    ["the offer names another Bitrix contact", { bitrixContactId: "7002", customerNumber: "7002" }, null],
    ["the deal has no contact", {}, dealAnswer(null)],
    ["the deal's customer could not be loaded (Bitrix unreachable)", {}, { status: 502, body: { error: { code: "BITRIX_UNAVAILABLE", message: "x", requestId: "r" } } }],
  ] as const)("does not appear: %s — „Weiter“ goes on at once", async (_n, kd, customer) => {
    const { srv, step } = await open({ "GET /api/deals/*/draft": draft(kd), ...(customer ? { "GET /api/deals/4711/customer": customer } : {}) });
    await weiter();
    await waitFor(() => expect(step()).toBe("Arbeiten"));
    expect(screen.queryByTestId("kd-main-contact")).toBeNull();
    expect(posts(srv)).toEqual([]);
  });

  it("„Nicht ändern“: goes on, nothing sent; remembered in the offer — the question does not come back for this contact and name", async () => {
    const { srv, step } = await open();
    const kdBefore = structuredClone(offer().Kundendaten);
    await weiter();
    await answer("Nicht ändern");
    await waitFor(() => expect(step()).toBe("Arbeiten"));
    expect(offer().mainContactKept).toEqual({ contactId: "7001", firstName: "Erika", lastName: "Muster" });
    expect(offer().Kundendaten).toEqual(kdBefore);
    await userEvent.click((await screen.findAllByRole("link", { name: /^Zurück zu / }))[0]!);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await weiter();
    await waitFor(() => expect(step()).toBe("Arbeiten"));
    expect(screen.queryByTestId("kd-main-contact")).toBeNull();
    expect(posts(srv)).toEqual([]);
  });

  it("„Nicht ändern“ stored before: not asked; another typed name asks again", async () => {
    const { step } = await open({ "GET /api/deals/*/draft": draft({ firstName: "Erika Maria" }, { mainContactKept: { contactId: "7001", firstName: "Erika", lastName: "Muster" } }) });
    await weiter();
    expect(await screen.findByTestId("kd-main-contact")).toBeInTheDocument();
    expect(step()).toBe("Kundendaten");
  });

  it("„Andere Person“: the Bitrix contact fills the EMPTY Ansprechpartner fields, the new main contact's id is the offer's; then on", async () => {
    let answered = 0;
    const { srv, step } = await open({
      "GET /api/deals/*/draft": draft({ cp_phone: "0170 1234567" }),
      "POST /api/bitrix/deal/4711/main-contact": () => { answered++; return { body: { ok: true, contactId: "9001", created: true, mode: "replace" } }; },
      "GET /api/deals/4711/customer": () => (answered ? dealAnswer({ ...CONTACT, ID: "9001", NAME: "Erika", HONORIFIC: "HNR_DE_1" }) : dealAnswer()),
    });
    await weiter();
    await answer("Andere Person: Kontakt ist Ansprechpartner");
    await waitFor(() => expect(step()).toBe("Arbeiten"));
    expect(posts(srv)).toEqual([{
      mode: "replace", expectedContactId: "7001",
      person: { salutation: "Frau", firstName: "Erika", lastName: "Muster", street: "Probeweg 3", postalCode: "95000", city: "Teststadt", phone: "+49 9281 000001" },
    }]);
    expect(offer().Kundendaten).toMatchObject({
      bitrixContactId: "9001", customerNumber: "9001", hasContactPerson: "Ja", cp_salutation: "Herr", cp_name: "Max Muster",
      cp_phone: "0170 1234567", // typed: stays
      cp_email: "max@example.test", cp_street: "Probeweg 3", cp_postalCode: "95000", cp_city: "Teststadt", cp_state: "Bayern",
    });
    expect(offer().Kundendaten).toMatchObject({ firstName: "Erika", lastName: "Muster" });
    await waitFor(() => expect(srv.count("GET /api/deals/4711/customer")).toBe(2)); // asked again: the comparison follows Bitrix
  });

  it("„Nur Schreibweise korrigieren“: the SAME contact is renamed; the offer stays; then on", async () => {
    const { srv, step } = await open({ "POST /api/bitrix/deal/4711/main-contact": { body: { ok: true, contactId: "7001", created: false, mode: "rename" } } });
    const kdBefore = structuredClone(offer().Kundendaten);
    await weiter();
    await answer("Nur Schreibweise korrigieren");
    await waitFor(() => expect(step()).toBe("Arbeiten"));
    expect(posts(srv)).toEqual([{ mode: "rename", expectedContactId: "7001", person: expect.objectContaining({ firstName: "Erika", lastName: "Muster" }) }]);
    expect(offer().Kundendaten).toEqual(kdBefore);
  });

  it.each([
    ["several fitting contacts", { status: 409, body: { error: { code: "MAIN_CONTACT_AMBIGUOUS", message: "Mehrere passende Kontakte in Bitrix – bitte im Büro klären", requestId: "r" }, ambiguous: true } }, "Mehrere passende Kontakte in Bitrix – bitte im Büro klären"],
    ["Bitrix failed", { status: 502, body: { error: { code: "MAIN_CONTACT_FAILED", message: "Bitrix konnte den Kontakt nicht ändern.", requestId: "r" } } }, "Bitrix konnte den Kontakt nicht ändern. Sie können trotzdem weitermachen."],
    ["no connection", { status: 500, body: null }, "Bitrix konnte nicht geändert werden. Sie können trotzdem weitermachen."],
  ] as const)("%s: said in German, the buttons work again, „Trotzdem weiter“ goes on", async (_n, reply, text) => {
    const { step } = await open({ "POST /api/bitrix/deal/4711/main-contact": reply as Reply });
    await weiter();
    await answer("Nur Schreibweise korrigieren");
    expect(await within(dialog()).findByText(text)).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Nicht ändern" })).toBeEnabled();
    expect(step()).toBe("Kundendaten");
    await answer("Trotzdem weiter");
    await waitFor(() => expect(step()).toBe("Arbeiten"));
  });

  it("while Bitrix is changed the answers are disabled", async () => {
    let finish: (r: Response) => void = () => {};
    const { srv } = await open();
    const base = globalThis.fetch;
    const slow = (async (url: string, init?: RequestInit) => (String(url).includes("/main-contact") ? new Promise<Response>((r) => { finish = r; }) : base(url, init))) as typeof fetch;
    globalThis.fetch = slow;
    await weiter();
    await answer("Nur Schreibweise korrigieren");
    await waitFor(() => expect(within(dialog()).getByRole("button", { name: "Nicht ändern" })).toBeDisabled());
    expect(within(dialog()).getByRole("button", { name: "Andere Person: Kontakt ist Ansprechpartner" })).toBeDisabled();
    expect(within(dialog()).getByText("Bitrix wird geändert …")).toBeInTheDocument();
    finish(new Response(JSON.stringify({ ok: true, contactId: "7001", created: false, mode: "rename" }), { status: 200 }));
    await waitFor(() => expect(screen.queryByTestId("kd-main-contact")).toBeNull());
    expect(srv.calls.length).toBeGreaterThan(0);
  });
});
