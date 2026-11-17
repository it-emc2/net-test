// The two upload boxes of Kundendaten: "Freigabe der Kasse" and "Bestätigung des Vermieters"
// (today: script.js initDealUploads, docs/kasse-freigabe-upload.md). Recorded from today's UI in
// test/fixtures/kundendaten-uploads.json. The rules:
//  - a chosen file goes to the Bitrix deal at once (POST /api/bitrix/deal/:id/upload/:type with
//    { filename, base64 }): into the deal's file field and as a timeline note. It is not part of
//    the offer — nothing about the file is stored in it.
//  - "Freigabe der Kasse": for a Kassenkunde, not for Alltagshilfe (it sits in the Wohnumfeld part)
//  - "Bestätigung des Vermieters": Badumbau, Badewannentür and Handlauf, while "Genehmigung des
//    Vermieters erforderlich?" is Ja — whoever pays
//  - needs the deal number (digits only): without it the box says so and nothing is sent
//  - more than 15 MB: the box says so and nothing is sent. The file type is not checked (the
//    file chooser offers pictures and PDFs; another file goes up as it is — as today)
//  - while it runs the box cannot be tapped; afterwards it names every file uploaded since the
//    offer was opened, or the server's message. A failure never stops anything else on the step.
//  - `kept: false` in the answer: Bitrix replaced the field's files instead of adding — said in the box
//  - a landlord's confirmation that went up answers "Genehmigung des Vermieters liegt vor?" with
//    Ja. That question is asked and stored only for a rented home; for any other living situation
//    the Ja waits and is stored once "Miete" is chosen (as today, where the hidden answer is ticked)
export type UploadKind = "kasse" | "vermieter";
export type BoxState = "" | "busy" | "ok" | "err";
export interface Box { state: BoxState; title: string; hint: string }
/** what a box remembers while the offer is open (not part of the offer) */
export interface UploadMemory { done: string[]; box?: Box }
export type Uploads = Partial<Record<UploadKind, UploadMemory>>;

export const ACCEPT = "image/*,application/pdf,.pdf";
export const MAX_BYTES = 15 * 1024 * 1024;
export const UPLOADS: Record<UploadKind, { label: string; hint: string }> = {
  kasse: { label: "Freigabe der Kasse", hint: "Bestätigung der Kasse für Wohnumfeldverb. Maßnahmen – wird beim Auftrag in Bitrix24 abgelegt." },
  vermieter: { label: "Bestätigung des Vermieters", hint: "Bestätigung vom Vermieter für Umbauten – wird beim Auftrag in Bitrix24 abgelegt." },
};

export const showKasse = (type: string | null | undefined, payer: unknown): boolean => payer === "Kassenkunde" && type !== "ah";
export const showVermieter = (type: string | null | undefined, needed: unknown): boolean => (type === "bu" || type === "bwt" || type === "hl") && needed === "Ja";

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
/** The deal the file goes to: the offer's deal number, else the deal the offer was opened under
 *  (today's page fills its deal field from it). "" when there is none (an offer without a deal). */
export function dealNumber(offer: Record<string, unknown> | null | undefined, openedUnder: string | null | undefined): string {
  const own = str(offer?.auftragId) || str((offer?.mail as Record<string, unknown> | undefined)?.auftragId);
  const deal = own || str(openedUnder);
  return /^\d+$/.test(deal) ? deal : own;
}

export const idle = (kind: UploadKind): Box => ({ state: "", title: "Foto aufnehmen / Datei hochladen", hint: UPLOADS[kind].hint });
/** why a chosen file is not sent — null when it can go */
export function refusal(deal: string, bytes: number): Box | null {
  if (!/^\d+$/.test(deal)) return { state: "err", title: "Auftrag ID fehlt", hint: "Bitte zuerst eine Auftrag ID eintragen und erneut wählen." };
  if (bytes > MAX_BYTES) return { state: "err", title: "Datei zu groß", hint: "Maximal 15 MB. Bitte erneut wählen." };
  return null;
}
export const running = (name: string): Box => ({ state: "busy", title: "Wird hochgeladen …", hint: name });
export const uploaded = (done: readonly string[], kept: boolean): Box => ({
  state: "ok", title: "✓ In Bitrix24 hochgeladen",
  hint: `${done.join(", ")} – tippen für weitere Datei${kept ? "" : " (Hinweis: Feld enthält nur die neueste Datei, frühere siehe Timeline)"}`,
});
export const failed = (message: string): Box => ({ state: "err", title: "Upload fehlgeschlagen", hint: `${message.replace(/\.$/, "")} – tippen zum erneuten Versuch` });
/** the name the file gets in Bitrix (a photo taken on the spot may come without one) */
export const fileName = (kind: UploadKind, name: string): string => name || `${kind}.jpg`;

/** "liegt vor" after a landlord's confirmation went up, or after the living situation was chosen
 *  while one is waiting: Ja for a rented home, nothing otherwise. */
export const landlordAnswer = (living: unknown, confirmed: boolean): { vermieterGenehmigung?: "Ja" } =>
  confirmed && living === "Miete" ? { vermieterGenehmigung: "Ja" } : {};

/** the file's content as base64 (without the "data:…," head) */
export const toBase64 = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(r.error ?? new Error("Datei konnte nicht gelesen werden"));
  r.readAsDataURL(file);
});
