// The customer signing page (/sign/<token>) — rules of today's page src/public/signpage/app.js,
// without React and without the DOM. The page itself: SignPage.tsx; the inventory of every state:
// docs/rewrite/MODULARIZATION-PLAN.md ("Signing page").
//
// Today's rules, kept:
//   - the token is the path segment after /sign/ (trailing slashes dropped); none → "Ungültiger Link."
//   - GET /api/signing/<token> → the documents; a completed request, or every document signed →
//     the thank-you card; else the first document not signed yet opens; "Zurück" / "Weiter" move
//     between the first document and the furthest one reached (maxIndex), shown only for 2+ documents
//   - progress "Dokument i von n", plus " – <label>" for a second person's document (key …_p2) or a
//     label naming "Person 1"
//   - 410 with `expired` → the expired card ("Neuen Link anfordern", or the thanks when asked before)
//   - the submit: payment term (when the document offers one) → required fields (Vollmacht,
//     Abtretung) → the signature → the second signature (Zusatzblatt, once a Bevollmächtigte/r is
//     named) → POST {signatureImage, extraFields, editedFields}; the answer `completed` (or status
//     "completed") ends at the thank-you card, else the next document not signed yet opens
//   - every message text below is today's text
export const TEXT = {
  title: "Online-Unterschrift",
  loading: "Dokument wird geladen …",
  invalidLink: "Ungültiger Link.",
  linkFallback: "Der Link ist ungültig oder abgelaufen.",
  docFailed: "Dokument konnte nicht geladen werden.",
  backToOc: "← Zurück zum Konfigurator",
  prev: "← Zurück",
  next: "Weiter →",
  done: ["Vielen Dank!", "Alle Dokumente wurden unterschrieben und an uns übermittelt. Sie erhalten in Kürze eine Kopie per E-Mail."],
  expiredHeading: "Dieser Link ist abgelaufen",
  expiredIntro: "Kein Problem – fordern Sie mit einem Klick einen neuen Link an. Wir senden ihn Ihnen per E-Mail zu.",
  requestNewLink: "Neuen Link anfordern",
  requesting: "Wird gesendet …",
  requested: "Vielen Dank! Ihre Anfrage ist bei uns eingegangen. Wir senden Ihnen in Kürze einen neuen Link per E-Mail.",
  requestFailed: "Anfrage fehlgeschlagen. Bitte rufen Sie uns an.",
  submit: "Unterschreiben & weiter",
  submitting: "Wird übermittelt …",
  submitFailed: "Übermittlung fehlgeschlagen.",
  choosePayment: "Bitte wählen Sie eine Zahlungsbedingung aus.",
  fillAll: "Bitte füllen Sie alle Felder aus: ",
  signHere: "Bitte unterschreiben Sie im Feld.",
  secondSigner: "Bitte lassen Sie den/die Bevollmächtigte/n unterschreiben.",
  clear: "Löschen",
  copy: "Kopieren",
  copied: "Kopiert!",
  paste: "Einfügen",
  pasted: "Eingefügt!",
  typeInstead: "Namen tippen statt zeichnen",
  drawInstead: "Doch lieber zeichnen",
  upload: "Bild hochladen",
  copyFirst: "Bitte zuerst unterschreiben, bevor Sie kopieren.",
  nothingCopied: "Es wurde noch keine Unterschrift kopiert.",
  typeLabel: "Ihr vollständiger Name",
  typePlaceholder: "Vor- und Nachname",
  uploadLabel: "Bild Ihrer Unterschrift (JPG oder PNG)",
  previewAlt: "Vorschau der hochgeladenen Unterschrift",
  notAnImage: "Bitte wählen Sie eine Bilddatei (JPG oder PNG).",
  tooBig: "Die Datei ist zu groß (max. 10 MB).",
  unreadable: "Die Datei konnte nicht gelesen werden.",
  imageFailed: "Das Bild konnte nicht geladen werden.",
  editing: "✓ Fertig",
  edit: "✎ Bearbeiten",
  // new (U-068): what today's page shows as the browser's own error text
  offline: "Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
  padLabel: "Unterschriftsfeld: mit dem Finger, dem Stift oder der Maus unterschreiben",
  padLabel2: "Unterschriftsfeld der/des Bevollmächtigten",
} as const;

export interface SignDoc { key: string; label?: string | undefined; status: string }
export interface SignRequest { offerNumber?: string | null; completed?: boolean; status?: string; documents: SignDoc[] }

/** the token of the page's address (today: everything after "/sign/", trailing slashes dropped) */
export function tokenFromPath(pathname: string): string {
  const rest = pathname.split("/sign/")[1] ?? "";
  try { return decodeURIComponent(rest.replace(/\/+$/, "")); } catch { return ""; }
}

/** the first document from `from` on that is not signed (docs.length when there is none) */
export function nextOpen(docs: readonly SignDoc[], from: number): number {
  let i = from;
  while (i < docs.length && docs[i]!.status === "signed") i++;
  return i;
}

export function progressText(docs: readonly SignDoc[], index: number): string {
  const doc = docs[index];
  if (!doc) return "";
  const named = /_p2$/.test(doc.key) || /Person 1/.test(doc.label || "");
  return `Dokument ${index + 1} von ${docs.length}` + (named ? ` – ${doc.label}` : "");
}

/** Vollmacht / Abtretung: every field shown is mandatory (the server checks the same, signing/fields.ts) */
export const REQUIRED_FIELDS: Record<string, readonly (readonly [string, string])[]> = {
  vollmacht: [
    ["lastName", "Nachname"], ["firstName", "Vorname"], ["street", "Straße"], ["postalCode", "PLZ"], ["city", "Ort"],
    ["phone", "Telefon"], ["geburtsdatum", "Geburtsdatum"], ["kassenkundeName", "Krankenkasse"], ["kk_versichertennr", "KVNR"],
  ],
  abtretung: [
    ["lastName", "Nachname"], ["firstName", "Vorname"], ["geburtsdatum", "Geburtstag"], ["kk_versichertennr", "Vers.-Nr."],
    ["street", "Straße"], ["postalCode", "PLZ"], ["city", "Ort"], ["phone", "Telefon"], ["pflegegrad", "Pflegegrad"],
    ["kk_pflegegradSeit", "Pflegegrad seit"], ["kassenkundeName", "Name der Pflegekasse"], ["kk_krankenkasseAdresse", "Adresse der Pflegekasse"],
  ],
};
REQUIRED_FIELDS.abtretung_ah = REQUIRED_FIELDS.abtretung!;

/** the labels of the required fields left empty, in the document's order ([] = complete) */
export function missingFields(key: string, edited: Record<string, string>): string[] {
  const required = REQUIRED_FIELDS[key.replace(/_p2$/, "")];
  if (!required) return [];
  return required.filter(([f]) => !String(edited[f] || "").trim()).map(([, label]) => label);
}

/** German names of the document's fields, for screen readers (the forms label some fields only by their key) */
export const FIELD_NAMES: Record<string, string> = {
  lastName: "Nachname", firstName: "Vorname", street: "Straße", postalCode: "PLZ", city: "Ort", phone: "Telefon", email: "E-Mail",
  geburtsdatum: "Geburtsdatum", kassenkundeName: "Name der Kasse", kk_versichertennr: "Versichertennummer", kk_pflegegradSeit: "Pflegegrad seit",
  kk_krankenkasseAdresse: "Adresse der Pflegekasse", bevollmaechtigterName: "Name der/des Bevollmächtigten", bevollmaechtigterTelefon: "Telefon der/des Bevollmächtigten",
  rechnungEmailAdresse: "E-Mail-Adresse für die Rechnungskopie",
};

/** an answer of the signing routes as today's page reads it: v2's error object or a plain text */
export function errorText(body: unknown): string | null {
  const e = (body as { error?: unknown } | null)?.error;
  if (typeof e === "string") return e || null;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message || null;
  return null;
}

/** an uploaded file before it is read: today's checks and texts (null = fine) */
export function fileProblem(file: { type: string; size: number } | null | undefined): string | null {
  if (!file || !/^image\//.test(file.type)) return TEXT.notAnImage;
  if (file.size > 10 * 1024 * 1024) return TEXT.tooBig;
  return null;
}
