// Drift guard: every legacy endpoint (incl. ones main adds later) is either in v2 or listed
// here with the phase that ports it. A new legacy route fails this test until it is ported
// or assigned.
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script
import { missingInV2 } from "../../../scripts/route-parity.mjs";

const ASSIGNED: Record<string, string> = {
  // phase 5 — documents
  "GET /api/adobe-pdf/status": "5", "POST /api/adobe-pdf/batch": "5", "POST /api/adobe-pdf/document-merge": "5",
  "POST /api/adobe-pdf/docx": "5", "POST /api/adobe-pdf/pdf": "5",
  "POST /api/arbeitsbericht/docx": "5", "POST /api/arbeitsbericht/external/pdf": "5", "POST /api/arbeitsbericht/pdf": "5",
  "POST /arbeitsbericht/docx": "5", "POST /arbeitsbericht/external/pdf": "5", "POST /arbeitsbericht/pdf": "5",
  "POST /api/docx/pdf-preview": "5", "POST /api/docx/pdf-preview/pdf-preview": "5", "POST /pdf-preview/pdf-preview": "5",
  "POST /api/email/preview-product-image-pdf": "5", "POST /api/email/product-image-list": "5",
  "POST /docx-template": "5", "POST /docx-template/material-overview": "5", "POST /docx-template/pdf": "5",
  "POST /kalkulation/debug": "5", "POST /kalkulation/docx": "5", "POST /kalkulation/pdf": "5", "POST /kalkulation/pdf-v2": "5", "POST /kalkulation/preview": "5",
  "POST /latex-template/pdf": "5",
  "POST /pdf-template": "retire (always 500 in legacy)",
  // phase 6 — frontend
  "GET /login": "6", "GET /logic/aufschlag-rules.js": "6", "GET /logic/pricing-core.js": "6", "GET /logic/tray-search-core.js": "6",
};

describe("route parity with legacy", () => {
  it("every legacy route is ported or assigned to a phase", () => {
    const missing: string[] = missingInV2();
    expect(missing.filter((r) => !(r in ASSIGNED)), "new legacy routes — port or assign them").toEqual([]);
  });
  it("no stale assignments (ported routes leave the list)", () => {
    const missing = new Set<string>(missingInV2());
    expect(Object.keys(ASSIGNED).filter((r) => !missing.has(r))).toEqual([]);
  });
});
