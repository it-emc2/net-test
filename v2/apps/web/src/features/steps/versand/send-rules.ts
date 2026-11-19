// Sending the offer — the rules of today's UI (src/public/EmailManager.js send(), angebotscheck.js
// confirmHauptpunkte; reference: test/fixtures/versand-senden.json, v2/scripts/capture-versand-senden.cjs):
//  - before sending: Kundendaten and markup complete, a deal number, a recipient, and for Badumbau one confirmation per main item that is not in the offer
//    (a winwall plate counts as a panel); plus one confirmation when a winwall row has no valid decor
//    number — those plates are missing in price and offer (main 81f73fc7, 68b454a9). Never a block.
//  - the documents for Bitrix are made first (DOCX of the offer, Hassmann CSV, Kalkulation, the
//    carts and the note on online orders); a missing optional cart never stops the send, any
//    other missing document does — no partial set goes out
//  - one request carries mail, offer and files; the server makes the PDF, mails and files it
//  - afterwards: the dialog with the move of the deal to "ANG verschickt"
//  - the send guard of v2 (ADR 023): a `sendId`, no time limit, and if the connection drops the
//    send is followed on the server until it is finished
import { anyWvPanels, selectionOf, type Price } from "../angebotscheck/rules.js";
import { isOn as curtainOn } from "../duschvorhang/rules.js";

type Fields = Record<string, unknown>;
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => String(v ?? "").trim();

// ---- main items (Badumbau): each one not in the offer is confirmed by hand before sending ----
export interface MainItem { key: string; page: string; question: string }
interface Env { daLines: number; daOldPicks: number; curtainLines: number; optionalLines: number; wvPanels: number }
const MAIN: readonly (MainItem & { selected: (o: Fields, env: Env) => boolean })[] = [
  { key: "duschwanne", page: "Duschwanne", question: "Es wurde keine Duschwanne ausgewählt.", selected: (o) => obj(o.duschwanne).trayEnabled === true },
  { key: "fussboden", page: "Fussboden", question: "Es wurde kein Fußboden ausgewählt.", selected: (o) => !!(obj(o.duschwanne).addFlooring || obj(o.duschwanne).addWallCladding) },
  { key: "wandverkleidung", page: "Wandverkleidung", question: "Es wurde keine Wandverkleidungsplatte ausgewählt.", selected: (o, e) => obj(o.wandverkleidung).wvEnabled === true && e.wvPanels > 0 },
  { key: "duschabtrennung", page: "DuschabtrennungNeu", question: "Es wurde keine Duschabtrennung ausgewählt.", selected: (_o, e) => e.daLines > 0 || e.daOldPicks > 0 },
  { key: "duschvorhang", page: "Duschvorhang", question: "Es wurde kein Duschvorhang ausgewählt.", selected: (_o, e) => e.curtainLines > 0 },
  { key: "optional", page: "Optional", question: "Es wurden keine optionalen Produkte ausgewählt (z. B. Haltegriffe, Waschtisch, WC, Badewanne).",
    selected: (o, e) => e.optionalLines > 0 || !!(obj(o.duschwanne).chosenBathtubProductId || obj(o.duschwanne).chosenScreenProductId) },
];
const lines = (group: unknown) => list(obj(group).lines);
/** what the offer alone does not tell: the two configurators and the priced lines */
function envOf(offer: Fields, price: Price | null | undefined): Env {
  const da = obj(offer.duschabtrennung), dv = obj(offer.duschvorhang);
  const daLines = selectionOf(offer, price).daLines(), curtain = curtainOn(da, dv) ? list(obj(dv.configurator).lines) as Fields[] : [];
  const daIds = new Set(daLines.map((l) => str(l?.articleNumber))), curtainIds = new Set(curtain.map((l) => str(l?.articleNumber)));
  // picks of the older Duschabtrennung page share quickAdd with the configurator and curtain lines
  const daOldPicks = (list(da.quickAdd) as Fields[]).filter((q) => !daIds.has(str(q?.productId)) && !curtainIds.has(str(q?.productId))).length;
  return { daLines: daLines.length, daOldPicks, curtainLines: curtain.length, optionalLines: lines(price?.optionalDisplayUI).length, wvPanels: anyWvPanels(obj(price?.materialsDisplayUI ?? price?.materials)) };
}
/** winwall rows with a typed decor that is no decor number ("23013"): priced as nothing, left out of PDF and offer */
export function invalidDecorRows(offer: Fields): MainItem[] {
  const wv = obj(offer.wandverkleidung);
  if (!wv.wvEnabled) return [];
  try {
    const bad = (list(JSON.parse(String(wv.wvWwRows || "[]"))) as Fields[]).some((r) => !r?.code && Number(r?.qty) > 0);
    return bad ? [{ key: "wvDekorUngueltig", page: "Wandverkleidung", question: "In der Wandverkleidung gibt es Platten-Zeilen mit ungültiger Dekor-Nummer – diese Platten fehlen im Preis und im Angebot." }] : [];
  } catch { return []; }
}
/** the main items not in this offer (Badumbau only), then the winwall rows without a valid decor (any offer, as today) */
export function missingMain(offer: Fields, price: Price | null | undefined): MainItem[] {
  const main = str(offer.activeOffer).toLowerCase() !== "bu" ? [] : (() => { const env = envOf(offer, price); return MAIN.filter((m) => { try { return !m.selected(offer, env); } catch { return false; } }).map(({ selected: _s, ...m }) => m); })();
  return [...main, ...invalidDecorRows(offer)];
}

// ---- the documents for Bitrix ----
export interface Job { path: string; name: string; label: string; optional?: true }
const SERVICES_ONLY = ["ah", "hms", "wd"];
export const safeNumber = (nr: string): string => (nr || "Angebot").replace(/[^A-Za-z0-9_-]+/g, "_");
/** what is made for the deal's timeline before the send — the offer DOCX not when an edited one goes out */
export function bitrixJobs(type: string, offerNumber: string, editedDocx: boolean): Job[] {
  const n = safeNumber(offerNumber), services = SERVICES_ONLY.includes(type);
  const all: (Job & { product?: true })[] = [
    { path: "/docx-template", name: `${n}.docx`, label: "Angebot-DOCX" },
    { path: "/material-overview/hassmann-cart", name: `Hassmann_Warenkorb_${n}.csv`, label: "Hassmann-Warenkorb (CSV)", product: true },
    { path: "/kalkulation/pdf-v2", name: `Kalkulation_${n}.pdf`, label: "Kalkulation-PDF" },
    { path: "/material-overview/badolux-cart?format=csv", name: `Badolux_Warenkorb_${n}.csv`, label: "Badolux-Warenkorb (CSV)", optional: true },
    { path: "/material-overview/badolux-cart?format=json", name: `Badolux_Warenkorb_${n}.json`, label: "Badolux-Warenkorb (JSON)", optional: true },
    { path: "/material-overview/winwall-cart?format=csv", name: `winwall_Warenkorb_${n}.csv`, label: "winwall-Warenkorb (CSV)", optional: true },
    { path: "/material-overview/winwall-cart?format=json", name: `winwall_Warenkorb_${n}.json`, label: "winwall-Warenkorb (JSON)", optional: true },
    { path: "/material-overview/online-orders", name: `Bestellhinweise_Online-Handel_${n}.txt`, label: "Bestellhinweise Online-Handel", product: true },
  ];
  return all.filter((j) => !(editedDocx && j.path === "/docx-template") && !(services && j.product)).map(({ product: _p, ...j }) => j);
}

// ---- files ----
export const isDocx = (name: string): boolean => /\.docx$/i.test(name);
export function fileSize(bytes: number): string {
  const n = Number(bytes) || 0;
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
/** the same file chosen twice is kept once */
export function addFiles(have: readonly File[], added: readonly File[]): File[] {
  const seen = new Set<string>(), key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
  return [...have, ...added].filter((f) => (seen.has(key(f)) ? false : (seen.add(key(f)), true)));
}

// ---- texts ----
export const TEXT = {
  noDeal: "Bitte tragen Sie die Lead ID / Auftrag ID ein, bevor Sie die E-Mail senden.",
  noRecipient: "Bitte tragen Sie die E-Mail-Adresse des Empfängers ein.",
  notDocx: "Die geänderte Datei muss eine .docx sein.",
  cancelled: "Versand abgebrochen.",
  notAgain: "Nicht erneut gesendet.",
  timeout: "Zeitüberschreitung — der Server antwortet nicht. Bitte nicht neu laden, kurz warten und Bitrix prüfen, ob die Mail trotzdem verschickt wurde, bevor erneut gesendet wird.",
  tooLong: "Der Versand dauert ungewöhnlich lange. Bitte prüfen Sie in Bitrix, ob die E-Mail verschickt wurde, bevor Sie erneut senden.",
  stillRunning: "Die Verbindung war kurz weg – der Versand läuft auf dem Server weiter. Bitte warten Sie.",
  offerChanged: "Dieses Angebot wurde bereits versendet und kann nicht mehr geändert werden. Bitte erstellen Sie eine neue Version („Neue Version erstellen“) und senden Sie diese.",
  handEdited: "Handbearbeitetes Angebot: Die E-Mail enthält keinen Link zur Online-Unterschrift.",
} as const;
export const started = "Sende-Vorgang gestartet …";
export const sending = (edited: boolean): string => (edited ? "Konvertiere geänderte DOCX zu PDF & sende E-Mail …" : "Erzeuge Angebots-PDF & sende E-Mail …");
export const done = (names: readonly string[]) => `E-Mail gesendet — Anhänge: ${names.join(", ") || "-"}`;
export function filingFailed(error: string): string {
  const why = error ? ` (${error})` : "";
  return `E-Mail wurde gesendet, die Ablage in Bitrix hat nicht geklappt${why}. Bitte legen Sie Angebot und Anhänge im Deal ab oder geben Sie dem Innendienst Bescheid – nicht erneut senden.`;
}
export const sentTitle = "E-Mail gesendet";
export const atLocal = (iso: unknown): string => { const d = new Date(String(iso ?? "")); return Number.isNaN(d.getTime()) ? "kürzlich" : d.toLocaleString("de-DE"); };

// ---- the answer of the server ----
/** v2 answers { error: { code, message }, detail? }; today's routes { error, code, detail } — both
 *  read; the detail first (it says what went wrong, e.g. the mail server's answer), as today */
export function errorOf(body: unknown): { code: string; message: string } {
  const b = obj(body), e = b.error;
  if (e && typeof e === "object") return { code: str(obj(e).code), message: str(b.detail) || str(obj(e).message) };
  return { code: str(b.code ?? b.errorCode), message: str(b.detail) || str(e) };
}

// ---- the move of the deal to "ANG verschickt" ----
export interface SentResult { attachmentNames?: string[]; bitrixComment?: { ok?: boolean; error?: string } | null; offerTotal?: number; selfPayAmount?: number; sendId?: string; signingLink?: string }
/** what the move of the deal carries: the offer's own total, never one typed by hand */
export function movePayload(offer: Fields, result: SentResult, offerNumber: string, materialCodes = ""): Fields {
  const kd = obj(offer.Kundendaten), type = str(offer.activeOffer).toLowerCase(), amount = Number(result.offerTotal) > 0 ? Number(result.offerTotal) : 0;
  const kasse = kd.payer === "Kassenkunde", out: Fields = { opportunity: amount, finalTotal: amount, workDays: Number(obj(offer.Arbeitszeit).workDays) || 0, offerType: type, offerNumber };
  if (kasse && Number(result.selfPayAmount) > 0) out.selfPayAmount = Number(result.selfPayAmount);
  if (kasse && kd.kk_rechnungskopie === "ja") out.invoiceCopy = kd.kk_rechnungskopie_art === "email" ? "email" : "post";
  if (type === "ah") out.payload = JSON.stringify(offer);
  if (materialCodes) out.materialCodes = materialCodes;
  return out;
}
/** "WV-WW · DW-SL" — the supplier codes of the price */
export function materialCodes(price: unknown): string {
  const c = obj(obj(price).supplierCodes);
  return [...new Set([c.wv, c.fb, c.dw].map(str).filter(Boolean))].join(" · ");
}
