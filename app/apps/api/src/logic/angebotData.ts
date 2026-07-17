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

// Payer code from the payload (same mapping computeServiceCosts uses).
function payerCode(payload: Any): "KK" | "SZ" | "" {
  const p = String(payload?.Kundendaten?.payer || "");
  if (p === "Kassenkunde") return "KK";
  if (p === "Selbstzahler") return "SZ";
  return "";
}

// ---- greeting (mirrors legacy _greetOne / two-person composition) -------
function greetOne(salutation: string, lastName: string): string {
  const l = (lastName || "").trim();
  if (salutation === "Frau") return `Sehr geehrte Frau ${l}`.trim();
  if (salutation === "Herr") return `Sehr geehrter Herr ${l}`.trim();
  if (salutation === "Familie") return `Sehr geehrte Familie ${l}`.trim();
  return "Sehr geehrte Damen und Herren";
}
function greetFrag(salutation: string, lastName: string): string {
  const l = (lastName || "").trim();
  if (salutation === "Frau") return `sehr geehrte Frau ${l}`.trim();
  if (salutation === "Herr") return `sehr geehrter Herr ${l}`.trim();
  if (salutation === "Familie") return `sehr geehrte Familie ${l}`.trim();
  return "sehr geehrte Damen und Herren";
}
function greetingLine(b: Any, isTwo: boolean): string {
  if (isTwo) {
    const two = `${greetFrag(b.salutation, b.lastName)}, ${greetFrag(b.partnerSalutation, b.partnerLastName)}`;
    return two.charAt(0).toUpperCase() + two.slice(1);
  }
  return greetOne(b.salutation, b.lastName);
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
  payer: "KK" | "SZ" | "",
  computed: Any,
  selectedIdx: number,
): { title: string; terms: AngebotPaymentTerm[] } {
  const selfPay = Number(computed?.selfPayAmount) || 0;
  const threshold = config.get("KK_PAYMENT_THRESHOLD", 2000);
  const opt = (text: string, i: number): AngebotPaymentTerm => ({ text, checked: i === selectedIdx });

  // Kassenkunde: payment block ONLY when a self-pay share (Eigenanteil) remains.
  // Eigenanteil = 0 → no payment block at all. ≥ threshold → two options to
  // tick; < threshold → the single 100 %-Skonto line (no ankreuzen). Mirrors V3.
  if (payer === "KK") {
    if (selfPay <= 0) return { title: "", terms: [] };
    const terms: AngebotPaymentTerm[] =
      selfPay >= threshold
        ? [opt("50 % sofort und 50 % nach Fertigstellung, ohne Abzug", 0), opt("100 % sofort abzüglich 2 % Skonto", 1)]
        : [{ text: "100 % sofort abzüglich 2 % Skonto", plain: true }];
    terms.push({ text: SEPARATE_RECHNUNG, plain: true });
    return {
      title:
        selfPay >= threshold
          ? "Zahlungsbedingungen für den Selbstkostenanteil (bitte ankreuzen):"
          : "Zahlungsbedingungen für den Selbstkostenanteil:",
      terms,
    };
  }

  // Selbstzahler: 20/30/40 % Anzahlung options.
  if (payer === "SZ") {
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

  // Payer not chosen yet → no payment block (matches V3).
  return { title: "", terms: [] };
}

// Signature initials for the Ansprechpartner. Org data-protection rule:
// only Signaturkürzel on documents, never a full personal name. "Sabine Klein"
// → "S. K."; falls back to the email local part's first letter.
export function signatureInitials(user: { firstName?: string; lastName?: string; name?: string; email?: string } | null | undefined): string {
  if (!user) return "";
  const parts = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || String(user.name || "").trim();
  const words = parts.split(/\s+/).filter(Boolean);
  if (words.length) return words.map((w) => `${w[0]!.toUpperCase()}.`).join(" ");
  const local = String(user.email || "").split("@")[0] || "";
  return local ? `${local[0]!.toUpperCase()}.` : "";
}

// ---- main ---------------------------------------------------------------
export function buildAngebotData(payload: Any, computed: Any, opts: { ansprechpartner?: string } = {}): AngebotData {
  const b: Any = payload?.Kundendaten || {};
  const date = parseDate(b.date);
  const validity = addWeeks(date, config.get("OFFER_VALIDITY_WEEKS", 8));
  const validityStr = fmtDateDE(validity);

  const payer = payerCode(payload);
  const partnerName = [b.partnerFirstName, b.partnerLastName].filter(Boolean).join(" ").trim();
  const isTwo = !!b.twoPersons && !!partnerName;
  const { primary, included } = splitServiceLines(computed);
  const { totals, hasSubsidy } = totalsRows(computed);
  const selectedIdx = Number.isFinite(Number(b.selectedPaymentTermIdx)) ? Number(b.selectedPaymentTermIdx) : -1;
  const pay = paymentSection(payer, computed, selectedIdx);

  const regie = payer === "KK" ? 69.5 : payer === "SZ" ? 59.5 : Number(computed?.services?.laborRate) || 0;

  const ebRaw = b?.ebenerdig ?? payload?.duschwanne?.ebenerdigNote ?? payload?.duschwanne?.ebenerdigeMontage;
  const ebenerdig = ebRaw === true || ebRaw === 1 || /^(1|on|true|ja)$/i.test(String(ebRaw || ""));

  return {
    anrede: b.salutation || "",
    vorname: b.firstName || "",
    nachname: b.lastName || "",
    anrede2: isTwo ? b.partnerSalutation || "" : undefined,
    vorname2: isTwo ? b.partnerFirstName || "" : undefined,
    nachname2: isTwo ? b.partnerLastName || "" : undefined,
    adresse: b.street || "",
    plz: b.postalCode || "",
    stadt: b.city || "",
    angebotsnummer: payload?.offerNumber || `ANG-${fmtDateDE(date)}`,
    datum: fmtDateDE(date),
    gueltigBis: validityStr,
    // Logged-in user's signature initials (org rule: no full names on docs).
    // Falls back to any emc2_contact already in the payload.
    ansprechpartner: (opts.ansprechpartner || b.emc2_contact || "").trim(),
    kundennummer: b.customerNumber || b.bitrixContactId || "",
    greeting: greetingLine(b, isTwo),

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
