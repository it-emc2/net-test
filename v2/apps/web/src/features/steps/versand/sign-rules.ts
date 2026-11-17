// Signing — the rules of today's UI (src/public/script.js initSignOnSite, initPostalSending's
// "sendSignedPost"; the add-on modules/web/addons/offer-record.js; reference:
// test/fixtures/versand-unterschrift.json, v2/scripts/capture-versand-unterschrift.cjs):
//  - "Vor Ort unterschreiben (iPad)", on both tabs: Kundendaten complete → for Badumbau the main
//    items → the offer gets a number and is saved under it (the signing view has no way back to
//    an offer that was not stored — without the save nothing is started) → the signing view is
//    asked for and opened; the tablet goes to the customer. Documents signed before are asked
//    about first. Started from the Post tab, the signature is remembered as "by post"
//  - "Unterschriebene Unterlagen per Post senden", on the Post tab once a signature started there
//    is complete: the signed offer is the letter, the other signed documents go with it — the
//    only way a customer without e-mail gets the signed copy. Address and deal number are checked
//    as for the offer's letter; it is a second letter for the deal by design
//  - the send guard of v2: the hand-over carries a `sendId` (it is recorded as "Unterschrift vor Ort")
//  - the link to sign online needs nothing here: the mail carries it by itself. Making a link by
//    hand was a developer tool (not rebuilt, owner decision 2026-11-16)
import { filingFailed, type Posted, type Recipient } from "./post-rules.js";

type Fields = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();

export const TEXT = {
  cancelled: "Abgebrochen.",
  opening: "Öffne Unterschriften-Ansicht …",
  notSaved: "Das Angebot konnte nicht gespeichert werden. Die Unterschrift wurde nicht gestartet – bitte versuchen Sie es erneut.",
  failed: "Fehler beim Öffnen der Unterschriften-Ansicht.",
  offerChanged: "Dieses Angebot wurde bereits versendet oder unterschrieben und kann nicht mehr geändert werden. Bitte erstellen Sie eine neue Version („Neue Version erstellen“).",
  loadingSigned: "Lade unterschriebene Unterlagen …",
  sendingSigned: "Sende unterschriebene Unterlagen an onlinebrief24 …",
  noNumber: "Keine Angebotsnummer – bitte zuerst das Angebot öffnen.",
} as const;
export interface Signing { link?: string; customerType?: string; documents?: unknown[] }
export const ready = (s: Signing): string => `Bereit zum Unterschreiben (${s.customerType ?? ""}, ${(s.documents ?? []).length} Dokument(e)). Tablet dem Kunden übergeben.`;
/** documents of this offer were signed before: a new signing view replaces the old link */
export const signedBefore = (warning: unknown) => ({ title: "Neuen Unterschrifts-Link erstellen?", message: str(warning), yes: "Ja, neuen Link erstellen", no: "Nein, alten Link behalten" });
/** what the request for the signing view carries */
export const request = (payload: Fields, offerNumber: string, type: string, deal: string, via: "mail" | "post", force: boolean, sendId: string): Fields =>
  ({ payload, offerNumber, offerType: type, dealId: deal, sendEmail: false, force, via: via === "post" ? "post" : "", sendId });

// ---- the signed documents by post ----
/** offered once a signature started from the Post tab is complete */
export const canPostSigned = (list: unknown): boolean => Array.isArray(list) && list.some((s) => (s as Fields)?.status === "completed" && (s as Fields)?.via === "post");
export interface SignedDoc { key?: string; filename: string; base64: string }
/** the signed offer is the letter, the rest goes with it */
export function signedParts(documents: readonly SignedDoc[]): { main: SignedDoc; rest: SignedDoc[] } | null {
  const main = documents.find((d) => d.key === "angebot") ?? documents[0];
  return main ? { main, rest: documents.filter((d) => d !== main) } : null;
}
export function signedLetter(a: { deal: string; recipient: Recipient; main: SignedDoc; rest: readonly SignedDoc[]; release: { confirmedBy: string } | null; offerNumber: string; sendId: string }): Fields {
  const r = a.recipient;
  return {
    forceResend: true, letterKind: "signed", auftragId: a.deal, // a second letter for the same deal by design (the offer went first)
    recipient: { name: `${r.firstName.trim()} ${r.lastName.trim()}`.trim(), street: r.street.trim(), zipCode: r.zipCode.trim(), city: r.city.trim(), country: r.country.trim() || "Deutschland" },
    document: { filename: a.main.filename, base64: a.main.base64 }, attachments: a.rest.map((d) => ({ type: "upload", filename: d.filename, base64: d.base64 })),
    dealIdOverride: a.release, meta: { offerNumber: a.offerNumber, dealId: a.deal }, sendId: a.sendId,
  };
}
export function signedSent(r: Posted): { ok: boolean; text: string; warn?: string } {
  const text = r.mode === "test" ? `Testmodus: unterschriebene Unterlagen liegen im onlinebrief24-Warenkorb (Auftrag ${r.printjobId || "-"}).` : `Unterschriebene Unterlagen per Post versendet. Auftrag: ${r.printjobId || "-"}`;
  if (r.bitrix?.ok !== false) return { ok: true, text };
  const warn = filingFailed(str(r.bitrix.error));
  return { ok: false, text: `${text} – ${warn}`, warn };
}
