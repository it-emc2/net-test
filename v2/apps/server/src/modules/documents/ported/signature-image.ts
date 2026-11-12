// @ts-nocheck
// GENERATED verbatim copy of src/lib/signatureImage.js — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
// Strict check for a submitted signature image (Audit S-10).
//
// The signing page sends a PNG data URL (drawn, typed or an uploaded photo
// scaled to ≤ 800 px). It ends up inside the HTML that server-side Chromium
// renders into the signed PDF, so anything else must be rejected before it is
// stored: only base64 characters after the prefix, a size cap, and the PNG
// file signature after decoding.

const PREFIX = "data:image/png;base64,";
const DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
// A drawn signature is a few hundred KB at most; an uploaded photo scaled to
// 800 px wide stays well below this. The route itself accepts 10 MB of JSON.
export const MAX_SIGNATURE_DATA_URL_LENGTH = 5 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isValidSignatureDataUrl(value) {
  if (typeof value !== "string") return false;
  if (value.length > MAX_SIGNATURE_DATA_URL_LENGTH) return false;
  if (!DATA_URL_RE.test(value)) return false;
  const head = Buffer.from(value.slice(PREFIX.length, PREFIX.length + 16), "base64");
  return head.length >= PNG_MAGIC.length && head.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}
