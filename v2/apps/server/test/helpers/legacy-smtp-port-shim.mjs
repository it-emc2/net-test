// TEST-ONLY preload for the spawned legacy app (node --import). Never used outside the
// contract test. It changes only where outgoing connections go, nothing else:
//  - OC_TEST_SMTP_PORT: legacy email.js hard-codes SMTP port 587 → local SMTP sink port.
//  - OC_TEST_FETCH_REWRITE: JSON { "<origin>": "<replacement base>" } — legacy hard-codes public
//    service URLs (geocoders, routers); fetch() calls to those origins go to the local stub.
//  - OC_TEST_FAKE_PUPPETEER=1: "puppeteer" resolves to fake-puppeteer.mjs (no browser; the
//    "PDF" is a hash of the HTML, see fake-pdf.mjs), so signing PDFs are deterministic.
import { createRequire, register } from "node:module";
if (process.env.OC_TEST_FAKE_PUPPETEER === "1") {
  const fake = new URL("./fake-puppeteer.mjs", import.meta.url).href;
  const hooks = `export async function resolve(s, c, next) { return s === "puppeteer" ? { url: ${JSON.stringify(fake)}, shortCircuit: true } : next(s, c); }`;
  register("data:text/javascript," + encodeURIComponent(hooks), import.meta.url);
}
const port = Number(process.env.OC_TEST_SMTP_PORT);
if (port) {
  const nodemailer = createRequire(process.cwd() + "/package.json")("nodemailer");
  const orig = nodemailer.createTransport.bind(nodemailer);
  nodemailer.createTransport = (opts, defaults) =>
    orig(opts && typeof opts === "object" && opts.host === "127.0.0.1" ? { ...opts, port } : opts, defaults);
}
const rewrite = JSON.parse(process.env.OC_TEST_FETCH_REWRITE || "{}");
if (Object.keys(rewrite).length) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (const [origin, base] of Object.entries(rewrite)) if (url.startsWith(origin)) { url = base + url.slice(origin.length); break; }
    return realFetch(url, init);
  };
}
