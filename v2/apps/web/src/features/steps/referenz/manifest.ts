// The photo index is the file of today's UI (src/public/referenz-manifest.js, generated from the
// folders under src/public/assets/referenz by scripts/build-referenz-manifest.mjs). It is bundled
// from there into the lazy chunk of the two steps — one source for both UIs, nothing copied.
// The photos themselves are served by the server under /assets/referenz (see rules.ts).
// @ts-expect-error a generated plain-JS file without types; rules.ts says what it holds
import { REFERENZ } from "../../../../../../../src/public/referenz-manifest.js";
import type { Manifest } from "./rules.js";

export const MANIFEST = REFERENZ as unknown as Manifest;
