// Maps a configurator payload + computed pricing into the AngebotData the
// HTML template consumes — the new-app equivalent of the legacy docx `mapData`.
// Scope: Badumbau (bu). Kept per-offer-key so bwt/hl/… can slot in later
// without touching the template.
import config from "../services/config.js";
import type {
  AngebotData,
  AngebotMaterialLine,
  AngebotBonusRow,
  AngebotTotal,
  AngebotPaymentTerm,
} from "./angebotTemplate.js";

type Any = Record<string, any>;

// ---- formatting helpers -------------------------------------------------
function fmtCurrency(n: unknown): string {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}${s} €`; // U+2212 minus, matches the original offers
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDateDE(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
// Accept ISO, DD.MM.YYYY, or empty → today.
function parseDate(v: unknown): Date {
  const s = String(v || "").trim();
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return new Date(Number(de[3]), Number(de[2]) - 1, Number(de[1]));
  const d = s ? new Date(s) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}
function addWeeks(d: Date, weeks: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + weeks * 7);
  return r;
}
const stripBullet = (s: unknown): string => String(s || "").replace(/^\s*-\s*/, "").trim();

// ---- greeting (mirrors legacy _greetOne) --------------------------------
function greetingLine(salutation: string, lastName: string): string {
  const l = (lastName || "").trim();
  if (salutation === "Frau") return `Sehr geehrte Frau ${l}`.trim();
  if (salutation === "Herr") return `Sehr geehrter Herr ${l}`.trim();
  if (salutation === "Familie") return `Sehr geehrte Familie ${l}`.trim();
  return "Sehr geehrte Damen und Herren";
}

// ---- services split: primary ("Auszuführende Arbeiten") vs "Enthält je Einheit"
const GOES_INCLUDED =
  /fahrzeugbereitstellung|bereitstellung.*werkzeug|ber.?umung der baustelle|kilometerpauschale|facharbeiter/i;
function splitServiceLines(computed: Any): { primary: string[]; included: string[] } {
  const lines: Any[] = computed?.servicesDisplayDocx?.lines || computed?.services?.lines || [];
  const primary: string[] = [];
  const included: string[] = [];
  for (const l of lines) {
    if (!l || l.docxHide) continue;
    const text = stripBullet(l.label);
    if (!text) continue;
    (GOES_INCLUDED.test(text) ? included : primary).push(text);
  }
  return { primary, included };
}

// ---- materials grouped by category --------------------------------------
function materialLines(computed: Any): AngebotMaterialLine[] {
  const lines: Any[] = computed?.materialsDisplayDocx?.lines || computed?.materials?.lines || [];
  const out: AngebotMaterialLine[] = [];
  let lastCat: string | null = null;
  for (const l of lines) {
    if (!l || l.docxHide) continue;
    const cat = l.category || null;
    if (cat && cat !== lastCat) {
      out.push({ text: cat, sub: true });
      lastCat = cat;
    }
    const text = stripBullet(l.label) || `${l.qty ?? ""} ${l.unit || "Stk"} ${l.name || l.productId || ""}`.trim();
    if (text) out.push({ text });
  }
  return out;
}

// ---- bonus rows (grab gratis + Bestandskundenbonus) ---------------------
function bonusRows(computed: Any): AngebotBonusRow[] {
  const flags: Any = computed?.flags || computed?.bonusFlags || {};
  const rows: AngebotBonusRow[] = [];
  let pos = 3;
  if (flags.bonus_Haltegriff && computed?.grabCounts?.freeId) {
    rows.push({
      pos: String(pos++).padStart(3, "0"),
      menge: "1 Stk",
      label: "Aktion: Haltegriff GRATIS – 1 Haltegriff gratis im Wert von 175 € inkl. Lieferung und Montage",
      einzel: "0,00 €",
      gesamt: "0,00 €",
    });
  }
  if (flags.bonus_neu) {
    rows.push({
      pos: String(pos++).padStart(3, "0"),
      menge: "1 Stk",
      label: "Bestandskundenbonus – Rabatt von 300 € ab einem Gesamtwert von 3.000 €",
      einzel: "−252,10 €",
      gesamt: "−252,10 €",
    });
  }
  return rows;
}

// ---- totals -------------------------------------------------------------
function totalsRows(computed: Any): { totals: AngebotTotal[]; hasSubsidy: boolean } {
  const net = Number(computed?.netAfterRabatt_and_Bonus) || 0;
  const vat = Number(computed?.vatOnNet) || 0;
  const total = Number(computed?.total) || 0;
  const subsidy = Number(computed?.subsidyAmount_max ?? computed?.subsidyAmount) || 0;
  const selfPay = Number(computed?.selfPayAmount) || 0;
  const hasSubsidy = subsidy > 0;

  const totals: AngebotTotal[] = [
    { label: "Nettobetrag", value: fmtCurrency(net) },
    { label: "zzgl. 19 % MwSt.", value: fmtCurrency(vat) },
    { label: "Gesamtsumme", value: fmtCurrency(total), strong: !hasSubsidy },
  ];
  if (hasSubsidy) {
    totals.push({ label: "Zuschuss Pflegekasse", value: fmtCurrency(-subsidy) });
    totals.push({ label: "Selbstkostenanteil", value: fmtCurrency(selfPay), strong: true });
  }
  return { totals, hasSubsidy };
}

// ---- payment terms ------------------------------------------------------
const SEPARATE_RECHNUNG =
  "Für die (An-)Zahlung wird eine separate Rechnung erstellt. Die Zahlung bitte erst nach Erhalt dieser Rechnung unter Angabe der Rechnungsnummer im Verwendungszweck durchführen.";
function paymentSection(
  computed: Any,
  selectedIdx: number,
): { title: string; terms: AngebotPaymentTerm[] } {
  const payer = String(computed?.payer || "").toUpperCase(); // "KK" | "SZ" | ""
  const selfPay = Number(computed?.selfPayAmount) || 0;
  const threshold = config.get("KK_PAYMENT_THRESHOLD", 2000);
  const opt = (text: string, i: number): AngebotPaymentTerm => ({ text, checked: i === selectedIdx });

  // Kassenkunde with a self-pay share.
  if (payer === "KK" && selfPay > 0) {
    const terms: AngebotPaymentTerm[] =
      selfPay >= threshold
        ? [opt("50 % sofort und 50 % nach Fertigstellung, ohne Abzug", 0), opt("100 % sofort abzüglich 2 % Skonto", 1)]
        : [{ text: "100 % sofort abzüglich 2 % Skonto", plain: true }];
    terms.push({ text: SEPARATE_RECHNUNG, plain: true });
    return { title: "Zahlungsbedingungen für den Selbstkostenanteil (bitte ankreuzen):", terms };
  }

  // Selbstzahler (and default when payer not yet chosen).
  // ponytail: default to the SZ block when payer is blank — a BU offer always
  // needs payment terms; switch to KK once the payer is set.
  return {
    title: "Wählen Sie aus folgenden Zahlungsbedingungen (bitte ankreuzen):",
    terms: [
      opt("20 % Anzahlung – ohne Abzug", 0),
      opt("30 % Anzahlung abzüglich 1 % Skonto vom Anzahlungsbetrag", 1),
      opt("40 % Anzahlung abzüglich 2 % Skonto vom Anzahlungsbetrag", 2),
      { text: SEPARATE_RECHNUNG, plain: true },
    ],
  };
}

// ---- main ---------------------------------------------------------------
export function buildAngebotData(payload: Any, computed: Any): AngebotData {
  const b: Any = payload?.Kundendaten || {};
  const date = parseDate(b.date);
  const validity = addWeeks(date, config.get("OFFER_VALIDITY_WEEKS", 8));
  const validityStr = fmtDateDE(validity);

  const { primary, included } = splitServiceLines(computed);
  const { totals, hasSubsidy } = totalsRows(computed);
  const selectedIdx = Number.isFinite(Number(b.selectedPaymentTermIdx)) ? Number(b.selectedPaymentTermIdx) : -1;
  const pay = paymentSection(computed, selectedIdx);

  const payer = String(computed?.payer || "").toUpperCase();
  const regie = payer === "KK" ? 69.5 : payer === "SZ" ? 59.5 : Number(computed?.services?.laborRate) || 0;

  const ebRaw = b?.ebenerdig ?? payload?.duschwanne?.ebenerdigNote ?? payload?.duschwanne?.ebenerdigeMontage;
  const ebenerdig = ebRaw === true || ebRaw === 1 || /^(1|on|true|ja)$/i.test(String(ebRaw || ""));

  return {
    anrede: b.salutation || "",
    vorname: b.firstName || "",
    nachname: b.lastName || "",
    adresse: b.street || "",
    plz: b.postalCode || "",
    stadt: b.city || "",
    angebotsnummer: payload?.offerNumber || `ANG-${fmtDateDE(date)}`,
    datum: fmtDateDE(date),
    gueltigBis: validityStr,
    ansprechpartner: (b.emc2_contact || "").trim(),
    kundennummer: b.customerNumber || b.bitrixContactId || "",
    greeting: greetingLine(b.salutation, b.lastName),

    serviceUnitPrice: fmtCurrency(computed?.services?.sum),
    serviceTotal: fmtCurrency(computed?.services?.sum),
    primaryServiceLines: primary,
    includedServiceLines: included,

    // BU shows material incl. markup (material_plus_aufschlag), matching legacy.
    materialsUnitPrice: fmtCurrency(computed?.material_plus_aufschlag),
    materialsTotal: fmtCurrency(computed?.material_plus_aufschlag),
    materialsLines: materialLines(computed),

    bonusRows: bonusRows(computed),
    totals,
    ebenerdigHinweis: ebenerdig,
    regieRate: regie ? `${regie.toFixed(2).replace(".", ",")} €` : "",
    hasSubsidy,
    subsidyText: hasSubsidy
      ? "Der Selbstkostenanteil ergibt sich aus dem Gesamtbetrag abzüglich des Pflegekassen-Zuschusses und wird bei Auftragsbestätigung vorab fällig."
      : "",
    paymentTitle: pay.title,
    paymentTerms: pay.terms,
    validityDate: validityStr,
  };
}
