// TEST-ONLY stand-in for "puppeteer" in the spawned legacy app (see legacy-smtp-port-shim.mjs).
// No browser is launched; page.pdf() returns fakePdf(html).
import { fakePdf } from "./fake-pdf.mjs";
const browser = {
  connected: true,
  async newPage() {
    let html = "";
    return { async setContent(h) { html = h; }, async pdf() { return fakePdf(html); }, async close() {} };
  },
  async close() {},
};
export default { launch: async () => browser };
