// Eigenanteil for Kassenkunden: pill, breakdown, chip, drawer rows. Numbers come from the price.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { selfPayParts } from "../src/features/offer/EigenAnteil.js";
import { useOfferStore } from "../src/features/offer/index.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const price = (o: Record<string, unknown>) => ({ total: 4500, selfPayAmount: 320, subsidyAmount: 4180, subsidyAmount_max: 4180, prior: 0, subsidyKind: "4180 MAXIMAL", ...o });
const payer = (p: string) => act(() => { (useOfferStore.getState().patch as any)("Kundendaten", { payer: p }); });
async function open(p: Record<string, unknown>, who = "Kassenkunde") {
  fakeServer({ ...BASE, "POST /api/price": { body: price(p) } });
  renderApp(`/deal/${KEY}/bu/Optional`);
  await screen.findByRole("group", { name: "Schrittleiste" });
  payer(who);
}
beforeEach(() => {
  HTMLElement.prototype.showPopover ??= function () {}; HTMLElement.prototype.hidePopover ??= function () {};
});

describe("rule: price answers stay consistent", () => {
  it.each([
    [{ total: 4500, selfPayAmount: 320, subsidyAmount: 4180, subsidyAmount_max: 4180 }],
    [{ total: 4000, selfPayAmount: 0, subsidyAmount: 4180, subsidyAmount_max: 4180 }],
    [{ total: 9000, selfPayAmount: 1840, subsidyAmount: 8360, subsidyAmount_max: 7160, subsidyKind: "ZWEI PERSONEN MIT PFLEGEGRAD" }], // 1200 Wohnumfeld used
  ])("selfPay = max(0, total − subsidy) and prior = subsidy − subsidy_max (%o)", (p) => {
    const s = selfPayParts("Kassenkunde", p)!;
    expect(s.selfPay).toBe(Math.max(0, s.total - (s.subsidy - s.prior)));
  });
  it("only for Kassenkunden", () => expect(selfPayParts("Selbstzahler", price({}))).toBeNull());
});

describe("Eigenanteil", () => {
  it("Kassenkunde: pill with the amount; breakdown has the numbers", async () => {
    await open({});
    const pill = await screen.findByRole("button", { name: /^Gesamt 4\.500,00.*Eigenanteil 320,00.*Aufschlüsselung/ });
    expect(pill).toHaveTextContent("320,00");
    const pop = screen.getByLabelText("Eigenanteil Aufschlüsselung", { selector: "div" });
    expect(pop).toHaveTextContent("4.500,00");
    expect(pop).toHaveTextContent("−4.180,00");
    expect(pop).toHaveTextContent("davon schon genutzt");
  });
  it("Selbstzahler: nothing", async () => {
    await open({}, "Selbstzahler");
    await waitFor(() => expect(screen.getByText(/Gesamt/)).toBeInTheDocument());
    expect(screen.queryByText(/Eigenanteil/)).toBeNull();
    expect(screen.queryByText("Zuschuss wählen")).toBeNull();
  });
  it("0 € → '0,00 €' and the hint", async () => {
    await open({ total: 4000, selfPayAmount: 0 });
    expect(await screen.findByTestId("selfpay-amount")).toHaveTextContent("0,00");
    expect(screen.getByText("Komplett über Pflegekasse")).toBeInTheDocument();
  });
  it("no budget option → amber chip that leads to Kundendaten", async () => {
    await open({ subsidyAmount: 0, subsidyAmount_max: 0, selfPayAmount: 4500, subsidyKind: "" });
    const chip = await screen.findByRole("link", { name: "Zuschuss wählen" });
    expect(chip).toHaveAttribute("href", `/app/deal/${KEY}/bu/Kundendaten`.replace("/app", ""));
    expect(screen.queryByTestId("selfpay-amount")).toBeNull();
  });
  it("two persons → label; Wohnumfeld used → shown", async () => {
    await open({ subsidyAmount: 8360, subsidyAmount_max: 7160, subsidyKind: "ZWEI PERSONEN MIT PFLEGEGRAD", selfPayAmount: 0 });
    const pill = await screen.findByRole("button", { name: /Eigenanteil · 2 Pers\./ });
    expect(pill).toBeInTheDocument();
    expect(screen.getByLabelText("Eigenanteil Aufschlüsselung", { selector: "div" })).toHaveTextContent("1.200,00");
  });
  it("drawer: Eigenanteil row and the calculation line", async () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    await open({});
    await userEvent.click(await screen.findByRole("button", { name: "Schritte öffnen" }));
    const rows = within(await screen.findByRole("dialog", { name: "Schritte" })).getByTestId("selfpay-rows");
    expect(rows).toHaveTextContent("320,00");
    expect(rows).toHaveTextContent("4.500 − 4.180 Pflegekasse");
  });
});
