// What "a new offer from this one" resets — ONE rule for "Neue Version erstellen" (web:
// features/steps/versand/version.ts) and for a new variant (server: deal-drafts/variants.ts,
// ADR 027 A). Both keep everything else of the offer as it is.
//  - the date is set anew (today), and the contact person becomes the signed-in user (as today)
//  - it counts as not sent: `zusammenfassung.versand` is emptied
//  - the offer number: "Neue Version" gives a new one at once (the web app registers it);
//    a variant starts WITHOUT one and gets its own at the first send, like any new offer
// The device-only state that "Neue Version" also drops (messages of the last send, the letter
// button's lock, a chosen edited Word file) is not part of the offer and stays in the web app.

type Fields = Record<string, unknown>;
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});

/**
 * The section changes of a new offer, in the shape of the web store's `patchAll`
 * (`undefined` removes a field). `contact`: the contact person's fields (`emc2_contact`,
 * `ansprechpartner`) when known, else the contact stays.
 */
export function newOfferPatch(today: string, contact: Fields = {}): { Kundendaten: Fields; zusammenfassung: Fields } {
  return { Kundendaten: { date: today, ...contact }, zusammenfassung: { versand: undefined } };
}

/** The payload of a new variant: a deep copy of `payload` with `newOfferPatch` applied and no offer number. */
export function variantCopyPayload(payload: unknown, today: string, contact: Fields = {}): Fields {
  const copy = structuredClone(obj(payload));
  delete copy.offerNumber;
  for (const [section, fields] of Object.entries(newOfferPatch(today, contact))) {
    const next: Fields = { ...obj(copy[section]) };
    for (const [k, v] of Object.entries(fields)) { if (v === undefined) delete next[k]; else next[k] = v; }
    copy[section] = next;
  }
  return copy;
}
