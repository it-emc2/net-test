// Dokumentenstudio — the rules of today's UI (reference: test/fixtures/versand-dokumente.json,
// v2/scripts/capture-versand-dokumente.cjs):
//  - three cards: Angebot (DOCX, PDF, preview), Hassmann Warenkorb (CSV, preview; not for
//    Alltagshilfe, Hausmeister-Service, Winterdienst: services only), Kalkulation (DOCX, PDF, preview, new version)
//  - every button first asks whether Kundendaten and the markup are complete (as "Weiter" does)
//  - DOCX and PDF of offer and Kalkulation give the offer a NEW number (`offerNumber`) — also
//    when the entries turn out to be incomplete; the new version of the Kalkulation, the CSV and
//    the previews do not
//  - after a PDF was made the offer is saved under its number (`POST /api/offers`), then the
//    file is handed over; DOCX and CSV save nothing
//  - the preview shows one document at a time (PDF in a frame, CSV as text) and is made again
//    when the offer changes while it is open
export type ActionId = "downloadDocx" | "downloadDocxAsPdf" | "previewOfferPdf" | "downloadHassmannCart" | "previewHassmannCart" | "downloadKalkulationDocx" | "downloadKalkulation" | "previewKalkulation" | "downloadKalkulationV2";
export type PreviewKey = "offer" | "kalkulation" | "hassmann";
export interface Download { kind: "download"; path: string; fallback: string; stamp: boolean; save: boolean; csv?: true; failed: string }
export interface OpenPreview { kind: "preview"; key: PreviewKey }
export interface Button { id: ActionId; label: string; look: "docx" | "pdf" | "preview" | "new" }
export interface DocCard { badge: string; format: string; title: string; text: string; buttons: Button[] }

const PREVIEW_LABEL = "Vorschau anzeigen";
const CARDS: readonly (DocCard & { notFor?: readonly string[] })[] = [
  { badge: "Angebot", format: "DOCX + PDF", title: "Angebot", text: "Angebot als bearbeitbare DOCX-Datei oder als kundenfähiges PDF herunterladen",
    buttons: [{ id: "downloadDocx", label: "DOCX", look: "docx" }, { id: "downloadDocxAsPdf", label: "PDF", look: "pdf" }, { id: "previewOfferPdf", label: PREVIEW_LABEL, look: "preview" }] },
  { badge: "Export", format: "CSV", title: "Hassmann Warenkorb", text: "CSV für Hassmann aus der Materialliste exportieren", notFor: ["ah", "hms", "wd"], // services only: no material list (today: data-offer="bu,bwt,hl,bl")
    buttons: [{ id: "downloadHassmannCart", label: "CSV herunterladen", look: "docx" }, { id: "previewHassmannCart", label: PREVIEW_LABEL, look: "preview" }] },
  { badge: "Intern", format: "DOCX + PDF", title: "Kalkulation", text: "Interne Kalkulation als bearbeitbare Datei oder als PDF anzeigen",
    buttons: [{ id: "downloadKalkulationDocx", label: "DOCX", look: "docx" }, { id: "downloadKalkulation", label: "PDF", look: "pdf" }, { id: "previewKalkulation", label: PREVIEW_LABEL, look: "preview" }, { id: "downloadKalkulationV2", label: "Neue Version", look: "new" }] },
];
export const cardsOf = (type: string | null): DocCard[] => CARDS.filter((c) => !c.notFor?.includes(String(type))).map(({ notFor: _n, ...c }) => c);

export const ACTIONS: Record<ActionId, Download | OpenPreview> = {
  downloadDocx: { kind: "download", path: "/docx-template", fallback: "Angebot.docx", stamp: true, save: false, failed: "Das Angebot (DOCX) konnte nicht erstellt werden." },
  downloadDocxAsPdf: { kind: "download", path: "/docx-template/pdf", fallback: "Angebot.pdf", stamp: true, save: true, failed: "Das Angebot (PDF) konnte nicht erstellt werden." },
  previewOfferPdf: { kind: "preview", key: "offer" },
  downloadHassmannCart: { kind: "download", path: "/material-overview/hassmann-cart", fallback: "Hassmann_Warenkorb.csv", stamp: false, save: false, csv: true, failed: "Hassmann Warenkorb konnte nicht erstellt werden." },
  previewHassmannCart: { kind: "preview", key: "hassmann" },
  downloadKalkulationDocx: { kind: "download", path: "/kalkulation/docx", fallback: "Kalkulation.docx", stamp: true, save: false, failed: "Die Kalkulation (DOCX) konnte nicht erstellt werden." },
  downloadKalkulation: { kind: "download", path: "/kalkulation/pdf", fallback: "Kalkulation.pdf", stamp: true, save: true, failed: "Die Kalkulation (PDF) konnte nicht erstellt werden." },
  previewKalkulation: { kind: "preview", key: "kalkulation" },
  downloadKalkulationV2: { kind: "download", path: "/kalkulation/pdf-v2", fallback: "Kalkulation.pdf", stamp: false, save: true, failed: "Die Kalkulation (neue Version) konnte nicht erstellt werden." },
};

export interface PreviewDoc { key: PreviewKey; tab: string; title: string; path: string; fallback: string; mode: "pdf" | "text"; accept: string; empty?: string }
export const PREVIEWS: readonly PreviewDoc[] = [
  { key: "offer", tab: "Angebot", title: "Angebot Vorschau", path: "/api/docx/pdf-preview", fallback: "Angebot.pdf", mode: "pdf", accept: "application/pdf" },
  { key: "kalkulation", tab: "Kalkulation", title: "Kalkulation Vorschau", path: "/kalkulation/pdf", fallback: "Kalkulation.pdf", mode: "pdf", accept: "application/pdf" },
  { key: "hassmann", tab: "Hassmann CSV", title: "Hassmann Warenkorb Vorschau", path: "/material-overview/hassmann-cart", fallback: "Hassmann_Warenkorb.csv", mode: "text", accept: "text/csv, text/plain", empty: "Keine CSV-Daten verfügbar." },
];

/** a new offer number: ANG<year>-<month><day>-<hour><minute><second>, local time */
export function newOfferNumber(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `ANG${now.getFullYear()}-${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}
/** the CSV is named after the offer number */
export const csvName = (offerNumber: string): string => `Hassmann_Warenkorb_${offerNumber.replace(/[^A-Za-z0-9_-]+/g, "_")}.csv`;
