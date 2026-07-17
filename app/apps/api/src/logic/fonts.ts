// Inline Open Sans (woff2, base64) so the PDF renders the brand font offline —
// headless Chromium has no Open Sans installed and we don't want a network
// dependency at render time. Read + encoded once, then cached in memory.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const WEIGHTS = [400, 600, 700];

function loadFontFaceCss(): string {
  const faces = WEIGHTS.map((w) => {
    const file = require.resolve(`@fontsource/open-sans/files/open-sans-latin-${w}-normal.woff2`);
    const b64 = readFileSync(file).toString("base64");
    return `@font-face{font-family:'Open Sans';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  });
  return `<style>${faces.join("")}</style>`;
}

let cached: string | null = null;
export function openSansStyle(): string {
  if (cached === null) cached = loadFontFaceCss();
  return cached;
}
