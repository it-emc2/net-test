// U-061: with START_UI=react the server sends a bare "/" to this app, so every way to today's UI
// goes through CLASSIC_HOME ("/?classic=1" sets the session cookie oc_ui=classic), and the app
// clears that cookie when it starts (being back here makes it the start again).
import fs from "node:fs";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CLASSIC_HOME, forgetClassicChoice } from "../src/shared/lib/classic-ui.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const SRC = `${process.cwd().replace(/\/apps\/web$/, "")}/apps/web/src`;

describe("today's UI from the React app", () => {
  it("the one address of today's UI home is /?classic=1", () => {
    expect(CLASSIC_HOME).toBe("/?classic=1");
  });

  it("forgetClassicChoice clears the cookie oc_ui (path /), other cookies stay", () => {
    const doc = { cookie: "" };
    forgetClassicChoice(doc);
    expect(doc.cookie).toBe("oc_ui=; Path=/; Max-Age=0");
    document.cookie = "oc_ui=classic; Path=/";
    document.cookie = "other=1; Path=/";
    expect(document.cookie).toContain("oc_ui=classic");
    forgetClassicChoice();
    expect(document.cookie).not.toContain("oc_ui");
    expect(document.cookie).toContain("other=1");
    document.cookie = "other=; Path=/; Max-Age=0";
  });

  it("the app entry clears it on start, before the app renders", () => {
    const main = fs.readFileSync(`${SRC}/app/main.tsx`, "utf8");
    const call = main.indexOf("forgetClassicChoice();"), render = main.indexOf("createRoot(");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(render);
  });

  it("no link or jump in the app goes to a bare \"/\" (it would come back here)", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
    walk(SRC);
    const bad = files.filter((f) => /href="\/"|href=\{"\/"\}|location\.(assign|replace)\("\/"\)|location\.href\s*=\s*"\/"/.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  describe("links", () => {
    beforeEach(() => { // jsdom has no showModal/close: the component falls back to the open attribute
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
    });
    it("Hauptmenü: „Zur bisherigen Ansicht“ on the page and in the user menu", async () => {
      fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } } });
      renderApp("/");
      await screen.findAllByRole("link", { name: /Zur bisherigen Ansicht/ });
      // the user menu is a popover (not visible to role queries in jsdom): all anchors with that text
      const all = Array.from(document.querySelectorAll("a")).filter((a) => /Zur bisherigen Ansicht/.test(a.textContent ?? ""));
      expect(all.length).toBe(2);
      for (const a of all) expect(a).toHaveAttribute("href", CLASSIC_HOME);
    });
    it("in an offer: „Versionen“ in the header and in the step drawer", async () => {
      fakeServer({ ...BASE });
      renderApp("/deal/65462/bu/Kundendaten");
      expect(await screen.findByRole("link", { name: "Versionen" })).toHaveAttribute("href", CLASSIC_HOME);
      await userEvent.click(screen.getByRole("button", { name: "Schritte öffnen" }));
      const drawer = await screen.findByRole("dialog", { name: "Schritte" });
      expect(within(drawer).getByRole("link", { name: "Versionen" })).toHaveAttribute("href", CLASSIC_HOME);
    });
  });
});
