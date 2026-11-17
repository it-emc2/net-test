// "Angebot per Post senden" — the rules of today's UI (src/public/script.js initPostalSending and
// the send guard of v2, modules/web/addons/send-guard.js; reference: test/fixtures/versand-post.json,
// v2/scripts/capture-versand-post.cjs):
//  - the address: first name, last name, street, PLZ, town, country — an empty field is filled
//    from Kundendaten (country: "Deutschland"), a filled one is never overwritten. The printer
//    reads the address out of the PDF, so an incomplete one is warned about and stops the send
//  - the letter: the offer PDF is the letter itself; Abtretung and Vollmacht go with it as the
//    ticks under "Mitgesendete Unterlagen" say (the flyer never goes by post); own PDFs can be
//    added. Taking Abtretung or Vollmacht out here unticks it for mail and signing too
//  - the send: address complete → a deal number, or the release by the user's own password (the
//    letter is then not filed in Bitrix) → for Badumbau the main items → in live mode the binding
//    question (who gets what; mode unknown counts as live) → the offer PDF → the documents for
//    Bitrix (best effort: one that cannot be made is named in the Bitrix comment, the letter
//    still goes) → the request. One tap, at most one letter: after a letter went out the button
//    stays locked for this offer
//  - the send guard of v2 (ADR 023): a `sendId` and the offer go along; an offer sent before is
//    asked about and posted as the exact document sent then; a changed one is refused, or the
//    original is posted on request
//  - afterwards: "Versendet per Post" is stored, the offer is saved under its number, and the
//    dialog offers the move of the deal
import { attachments } from "./mail-rules.js";
import { atLocal } from "./send-rules.js";

type Fields = Record<string, unknown>;
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const str = (v: unknown) => String(v ?? "").trim();

export const ADDRESS = ["firstName", "lastName", "street", "zipCode", "city", "country"] as const;
export type AddressField = (typeof ADDRESS)[number];
export type Recipient = Record<AddressField, string>;
export const LABEL: Record<AddressField, string> = { firstName: "Vorname", lastName: "Nachname", street: "Straße", zipCode: "PLZ", city: "Ort", country: "Land" };
export const PLACEHOLDER: Record<AddressField, string> = { firstName: "Max", lastName: "Mustermann", street: "Musterstraße 1", zipCode: "95032", city: "Hof", country: "DE" };
/** where Kundendaten keeps what an empty field is filled from */
const SOURCE: Record<AddressField, string> = { firstName: "firstName", lastName: "lastName", street: "street", zipCode: "postalCode", city: "city", country: "country" };

export const recipientOf = (offer: Fields): Recipient => { const r = obj(obj(offer.postal).recipient); return Object.fromEntries(ADDRESS.map((f) => [f, String(r[f] ?? "")])) as Recipient; };
/** the address with its empty fields filled from Kundendaten */
export function filled(offer: Fields): Recipient {
  const r = recipientOf(offer), kd = obj(offer.Kundendaten);
  return Object.fromEntries(ADDRESS.map((f) => [f, r[f].trim() ? r[f] : str(kd[SOURCE[f]]) || (f === "country" ? "Deutschland" : "")])) as Recipient;
}
/** what Kundendaten says about the address — when it changes, empty fields are filled again */
export const sourceKey = (offer: Fields): string => { const kd = obj(offer.Kundendaten); return ADDRESS.map((f) => str(kd[SOURCE[f]])).join("\u0001"); };
/** the fields the letter cannot do without, by their label (the country is not named in the warning) */
export const missing = (r: Recipient): string[] => ADDRESS.filter((f) => f !== "country" && !r[f].trim()).map((f) => LABEL[f]);
export const warning = (r: Recipient): string => { const m = missing(r); return m.length ? `Es fehlt: ${m.join(", ")}.` : ""; };
/** the fields that stop the send */
export const invalid = (r: Recipient): AddressField[] => ADDRESS.filter((f) => !r[f].trim());

// ---- what the letter holds ----
export interface Enclosed { id: string; type: "static" | "upload"; filename: string; label: string; size: number }
const BY_POST = ["abtretung", "vollmacht"]; // the flyer is for the mail only
/** Abtretung and Vollmacht as ticked (and not taken out of the mail's list) */
export const statics = (offer: Fields, removed: readonly string[] = []): Enclosed[] =>
  attachments({ ...offer, activeOffer: str(offer.activeOffer).toLowerCase() === "ah" ? "bu" : offer.activeOffer }, removed).filter((a) => BY_POST.includes(a.id)).map((a) => ({ id: a.id, type: "static", filename: a.name, label: "Default", size: 0 }));
export const isPdf = (f: { name?: string; type?: string }): boolean => /\.pdf$/i.test(f.name || "") || f.type === "application/pdf";
export function uploadSize(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n <= 0) return "Default";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
/** what the offer keeps about the letter */
export function postalOf(offer: Fields, recipient: Recipient, enclosed: readonly Enclosed[]): Fields {
  const was = obj(offer.postal);
  return { ...("enabled" in was ? { enabled: was.enabled } : {}), auftragId: str(offer.auftragId ?? obj(offer.mail).auftragId), recipient: Object.fromEntries(ADDRESS.map((f) => [f, recipient[f].trim()])), attachments: enclosed.map((e) => ({ ...e })) };
}

// ---- texts ----
export const TEXT = {
  addressIncomplete: "Bitte zuerst die vollständige Postadresse ausfüllen.",
  noDeal: "Ohne Auftrag/Deal-ID wird der Brief nicht in Bitrix dokumentiert. Freigabe mit Passwort erforderlich.",
  noRelease: "Abgebrochen — bitte Auftrag/Deal-ID eintragen.",
  cancelled: "Versand abgebrochen.",
  notAgain: "Versand abgebrochen – Brief wurde bereits versendet.",
  makingPdf: "Erzeuge Angebots-PDF …",
  sending: "Sende Brief an onlinebrief24 …",
  hint: "Die Angebots-PDF ist der Brief selbst – Anschrift, Betreff und Anschreiben stehen darin. Alles Weitere wird als Anlage beigelegt.",
  sentTitle: "Brief übergeben",
} as const;
export const ignored = (name: string) => `"${name}" wurde ignoriert – nur PDF-Anhänge sind erlaubt.`;
export interface Posted { mode?: string; printjobId?: string | number; attachmentCount?: number; attachmentNames?: string[]; bitrix?: { ok?: boolean; error?: string } | null; sendId?: string }
export const sentText = (r: Posted): string => (r.mode === "test"
  ? `Testmodus: Auftrag ${r.printjobId || "-"} liegt im onlinebrief24-Warenkorb · Anlagen: ${r.attachmentCount || 0}`
  : `Postversand erfolgreich gestartet. Auftrag: ${r.printjobId || "-"} · Anlagen: ${r.attachmentCount || 0}`);
export const filingFailed = (error: string): string =>
  `Der Brief wurde versendet, die Ablage in Bitrix hat nicht geklappt${error ? ` (${error})` : ""}. Bitte legen Sie die Unterlagen im Deal ab oder geben Sie dem Innendienst Bescheid – nicht erneut senden.`;

/** the binding question: who gets what */
export function liveQuestion(r: Recipient, documents: readonly string[], offerNumber: string) {
  return {
    recipient: [`${r.firstName.trim()} ${r.lastName.trim()}`.trim(), r.street.trim(), `${r.zipCode.trim()} ${r.city.trim()}`.trim()].filter(Boolean),
    heading: `Sendung (${documents.length} ${documents.length === 1 ? "Dokument" : "Dokumente"})`, documents: [...documents], offer: `Angebot: ${offerNumber}`,
  };
}
export const withBalance = (line: string, b: { ok?: boolean | null; balance?: unknown; currency?: unknown } | null | undefined): string =>
  (b?.ok && b.balance !== undefined && b.balance !== null ? `${line} · Guthaben: ${String(b.balance)} ${String(b.currency || "EUR")}` : line);
/** "a letter was already sent for this deal" — asked before a second one goes out */
export const alreadySent = (c: Fields) => ({
  title: "Noch einen Brief senden?",
  message: `Für diesen Deal wurde am ${atLocal(c.lastSentAt)} schon ein Brief gesendet (${str(c.lastOfferNumber) || "-"}, onlinebrief24 ${str(c.lastPrintjobId) || "-"}).`,
  yes: "Ja, zweiten Brief senden", no: "Nein, nicht senden",
});

// ---- the request ----
export function letter(a: { deal: string; recipient: Recipient; document: { filename: string; base64: string }; attachments: unknown[]; bitrixDocs: unknown[]; docWarnings: string[]; internalNote: string; release: { confirmedBy: string } | null; offerNumber: string; sendId: string; payload: Fields }): Fields {
  const r = a.recipient;
  return {
    forceResend: false, auftragId: a.deal,
    recipient: { name: `${r.firstName.trim()} ${r.lastName.trim()}`.trim(), street: r.street.trim(), zipCode: r.zipCode.trim(), city: r.city.trim(), country: r.country.trim() || "Deutschland" },
    document: a.document, attachments: a.attachments, bitrixDocs: a.bitrixDocs, docWarnings: a.docWarnings, internalNote: a.internalNote, dealIdOverride: a.release,
    meta: { offerNumber: a.offerNumber, dealId: a.deal }, sendId: a.sendId, payload: a.payload,
  };
}

// ---- an offer sent before (send guard) ----
const CHANNEL: Record<string, string> = { email: "per E-Mail", bitrix: "nur in Bitrix abgelegt", post: "per Post", onsite: "vor Ort" };
const when = (d: unknown): string => { const t = new Date(String(d ?? "")); return Number.isNaN(t.getTime()) ? "" : t.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
/** the last time this offer reached the customer (filing in Bitrix alone does not count) */
export const priorSend = (sends: readonly Fields[] | null | undefined): Fields | null => (sends ?? []).find((s) => s.status === "done" && s.channel !== "bitrix") ?? null;
export const priorQuestion = (offerNumber: string, p: Fields) => ({
  title: "Angebot wurde bereits versendet",
  message: `Angebot ${offerNumber} wurde am ${when(p.finishedAt || p.startedAt)} ${CHANNEL[str(p.channel)] || ""}${p.to ? ` an ${str(p.to)}` : ""} versendet${p.ansprechpartner ? ` (Ansprechpartner: ${str(p.ansprechpartner)})` : ""}. Jetzt per Post senden? Verschickt wird genau das damals versendete Dokument – vorher wird geprüft, dass das geöffnete Angebot unverändert ist.`,
  yes: "Per Post senden", no: "Abbrechen",
});
export const changedQuestion = (c: Fields) => ({
  title: "Das geöffnete Angebot weicht vom versendeten ab",
  message: `Unterschied: ${(Array.isArray(c.differences) ? c.differences : []).join(", ") || "Inhalt"}. Sie können das Original vom ${when(obj(c.sent).at)} unverändert per Post senden. Für das geänderte Angebot erstellen Sie bitte eine neue Version.`,
  yes: "Original per Post senden", no: "Abbrechen",
});
