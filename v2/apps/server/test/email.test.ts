// Differential tests: v2 email HTML template + offer-change lines vs the LEGACY modules
// (src/lib/emailTemplate.js, src/lib/offerChanges.js) on the same inputs.
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildEmailHtml, renderBodyHtmlFromText } from "../src/modules/email/template.js";
import { buildEmailTextBody, describeOfferChanges, getBitrixTargetFromPayload, safeOfferFilename } from "../src/modules/email/builders.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
let L: any, LC: any;
beforeAll(async () => {
  L = await import(ROOT + "src/lib/emailTemplate.js");
  LC = await import(ROOT + "src/lib/offerChanges.js");
});

const BODIES = [
  "", "Hallo", "Sehr geehrte Frau X,\r\n\r\nanbei.\r\n\r\n- a\n* b\n• c\n\n1. eins\n2. zwei\nText danach",
  "Mail: a.b@example.invalid und https://oc.test/sign/abc sowie www.emczwei.de <b>&\"'",
  "Keine Möglichkeit, die Dokumente auszudrucken? https://x.test/sign/0123\n\nZeile 1\nZeile 2",
  "  \n\n  - nur Liste  \n\n\n",
];

describe("email template = legacy", () => {
  it.each(BODIES.map((b, i) => [i, b] as const))("body %i", (_i, body) => {
    expect(renderBodyHtmlFromText(body)).toBe(L.renderBodyHtmlFromText(body));
    for (const opts of [{}, { signatureCid: "cid-1", contactName: "Vorname Test", isAh: false }, { signatureCid: null, contactName: "", isAh: true }, { contactName: "<x&y>", isAh: true }]) {
      expect(buildEmailHtml(body, opts)).toBe(L.buildEmailHtml(body, opts));
    }
  });

  it("offer-change lines = legacy", () => {
    const cases = [
      {}, { overrides: {} },
      { overrides: { textReplacements: [{ from: "a", to: "b" }], priceAdjustments: [{ target: "services", amountNet: 100 }, { target: "material", amountNet: -12.5 }, { target: "x", amountNet: 0 }], extraHinweise: ["H1"] }, user: "u@test.local" },
      { editedDocx: { name: "A.docx", sha256: "abcdef0123456789" } },
    ];
    for (const c of cases) expect(describeOfferChanges(c as any)).toEqual(LC.describeOfferChanges(c));
  });

  it("text body, filename, Bitrix target", () => {
    expect(buildEmailTextBody(" Hallo \n", "Vorname Test", true)).toContain("\n--\nFreundliche Grüße\n\nVorname Test\n");
    expect(safeOfferFilename("ANG 2026/1")).toBe("ANG_2026_1.pdf");
    expect(safeOfferFilename("")).toBe("Angebot.pdf");
    expect(getBitrixTargetFromPayload({ Kundendaten: { customerNumber: "77" } })).toEqual({ entityType: "contact", entityId: "77" });
    expect(getBitrixTargetFromPayload({ dealId: " 5 ", bitrixContactId: "7" })).toEqual({ entityType: "deal", entityId: "5" });
    expect(getBitrixTargetFromPayload({})).toBeNull();
  });
});
