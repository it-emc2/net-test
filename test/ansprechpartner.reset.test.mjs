// Regression check: form.reset() (startOfferFlow) wipes #emc2_contact, which is
// what the offer PDF prints as "Ansprechpartner". syncAnsprechpartner() must
// re-fill it from the dropdown. Run: node test/ansprechpartner.reset.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const USERS = [{ email: "a@x.de", name: "T. R." }];

const dom = new JSDOM(
  `<select id="homeAnsprechpartner"></select>
   <form id="form-Kundendaten">
     <input id="emc2_contact" name="emc2_contact" />
     <input type="hidden" id="ansprechpartnerEmail" name="ansprechpartner" />
   </form>`,
  { runScripts: "outside-only", url: "http://localhost/" },
);
const { window } = dom;
window.fetch = (url) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve(url.includes("/api/users") ? USERS : { user: USERS[0] }),
  });
global.window = window;
global.document = window.document;

window.eval(fs.readFileSync(new URL("../src/public/ansprechpartner.js", import.meta.url), "utf8"));
await new Promise((r) => setTimeout(r, 0));

const name = window.document.getElementById("emc2_contact");
assert.equal(name.value, "T. R.", "prefill from logged-in user");

window.document.getElementById("form-Kundendaten").reset();
assert.equal(name.value, "", "reset wipes the name (the bug)");

window.syncAnsprechpartner();
assert.equal(name.value, "T. R.", "sync re-fills after reset");

console.log("ok");
