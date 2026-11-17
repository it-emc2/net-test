// "Is this still the offer that was sent?" (ADR 023, decision C) — the comparison, and that the
// Post tab's own data (address check, PDFs added for the letter) is not part of the offer.
// A send recorded before 2026-11-17 carries a hash made when "postal" still counted: it must
// compare as before, by its own stored offer where it kept one.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { identityDifferences, offerIdentity } from "../src/modules/sends/identity.js";

const offer = (more: Record<string, unknown> = {}) => ({
  offerNumber: "ANG2026-1116-093000", activeOffer: "bu",
  Kundendaten: { firstName: "Erika", lastName: "Muster", street: "Musterweg 4", ansprechpartner: "ap@example.test" },
  duschwanne: { trayEnabled: true }, mail: { to: "kunde@example.test" },
  postal: { auftragId: "65418", recipient: { firstName: "Erika", lastName: "Muster", street: "Musterweg 4" }, attachments: [{ id: "abtretung", type: "static" }] },
  ...more,
});
const CONTENT = ["Inhalt (Positionen, Preise oder Kundendaten)"];
const withPdf = () => offer({ postal: { ...offer().postal, attachments: [...offer().postal.attachments, { id: "upload-1", type: "upload", filename: "Aufmass.pdf", size: 2048 }] } });
/** the hash as it was made before "postal" joined the workflow sections (key order and empties as the code cleans them) */
const hashedThen = (o: Record<string, any>) => {
  const sorted = (v: any): any => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  const { mail: _m, offerNumber: _n, activeOffer: _a, ...rest } = o, { ansprechpartner: _ap, ...kd } = rest.Kundendaten;
  return createHash("sha256").update(JSON.stringify(sorted({ ...rest, Kundendaten: kd }))).digest("hex");
};

describe("the offer that was sent", () => {
  it("a PDF added for the letter, a changed address on the Post tab or a deal number there do not change the offer", () => {
    const sent = offerIdentity(offer());
    expect(identityDifferences(sent, offerIdentity(withPdf()))).toEqual([]);
    expect(identityDifferences(sent, offerIdentity(offer({ postal: { auftragId: "70001", recipient: { street: "Andere Str. 5" } } })))).toEqual([]);
    expect(identityDifferences(sent, offerIdentity(offer({ postal: undefined })))).toEqual([]);
  });

  it("positions, prices and Kundendaten still do", () => {
    const sent = offerIdentity(offer());
    expect(identityDifferences(sent, offerIdentity(offer({ duschwanne: { trayEnabled: true, addFlooring: true } })))).toEqual(CONTENT);
    expect(identityDifferences(sent, offerIdentity(offer({ Kundendaten: { ...offer().Kundendaten, street: "Neue Str. 9" } })))).toEqual(CONTENT);
    expect(identityDifferences(sent, offerIdentity(offer({ Kundendaten: { ...offer().Kundendaten, ansprechpartner: "other@example.test" } })))).toEqual(["Ansprechpartner"]);
  });

  it("the hash of the earlier rules is what this test thinks it is", () => {
    // without this the two tests below would prove nothing
    expect(hashedThen(offer())).not.toBe(offerIdentity(offer()).contentHash);
    expect(hashedThen({ ...offer(), postal: undefined })).toBe(offerIdentity(offer()).contentHash);
  });

  it("a send recorded under the earlier rules that kept its offer: compared by today's rules", () => {
    const then = { ...offerIdentity(offer()), contentHash: hashedThen(offer()) };
    expect(identityDifferences(then, offerIdentity(offer()), { sent: offer(), now: offer() })).toEqual([]);
    expect(identityDifferences(then, offerIdentity(withPdf()), { sent: offer(), now: withPdf() })).toEqual([]);
    const changed = offer({ duschwanne: { trayEnabled: false } });
    expect(identityDifferences(then, offerIdentity(changed), { sent: offer(), now: changed })).toEqual(CONTENT);
  });

  it("a send recorded under the earlier rules that kept no offer (a letter): compared as it was then", () => {
    const then = { ...offerIdentity(offer()), contentHash: hashedThen(offer()) };
    expect(identityDifferences(then, offerIdentity(offer()), { now: offer() })).toEqual([]);
    expect(identityDifferences(then, offerIdentity(withPdf()), { now: withPdf() })).toEqual(CONTENT); // as strict as it was — never looser
    expect(identityDifferences(then, offerIdentity(offer()))).toEqual(CONTENT); // nothing to compare by: refused
  });
});
