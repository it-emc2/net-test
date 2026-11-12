// Pure builders of the offer email flow — ports of the helpers in legacy src/routes/email.js
// and src/lib/offerChanges.js. Proven identical by the send-offer contract test (same mail,
// same Bitrix comment) and test/email.test.ts.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Legacy default signer when the payload names no Ansprechpartner. */
export const DEFAULT_CONTACT_NAME = "Stefan Wolfrum";

export const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");
const eur = (n: number) => Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR", signDisplay: "always" });
const POSITION: Record<string, string> = { services: "Arbeiten (Pos. 001)", material: "Material (Pos. 002)" };

/** What was changed by hand on the offer (OC overrides, uploaded DOCX). [] = sent as generated. */
export function describeOfferChanges({ overrides, editedDocx, user }: { overrides?: any; editedDocx?: { name: string; sha256: string } | null; user?: string } = {}): string[] {
  const lines: string[] = [];
  for (const r of overrides?.textReplacements || []) lines.push(`• Wortlaut: „${r.from}“ → „${r.to}“`);
  for (const r of overrides?.priceAdjustments || []) {
    const net = Number(r.amountNet);
    lines.push(`• Preis ${POSITION[r.target] || r.target}: ${eur(net)} netto (${eur(net * 1.19)} brutto)`);
  }
  // single positions changed on the Kosten page (same text as legacy offerChanges.js)
  for (const e of overrides?.lineEdits || []) {
    const name = String(e?.origLabel || e?.id || "").replace(/^\s*-\s*/, "").trim();
    const hasPrice = e?.unitPriceNet !== null && e?.unitPriceNet !== undefined && e?.unitPriceNet !== "" && Number.isFinite(Number(e.unitPriceNet));
    if (hasPrice) {
      const fmt = (n: unknown) => Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
      const was = Number.isFinite(Number(e?.origUnitPriceNet)) ? ` statt ${fmt(e.origUnitPriceNet)}` : "";
      lines.push(`• Preis „${name}“: ${fmt(e.unitPriceNet)} netto je Einheit${was}${e?.reason ? ` – Grund: ${e.reason}` : ""}`);
    }
    if (String(e?.label ?? "").trim()) lines.push(`• Beschreibung „${name}“ → „${String(e.label).trim()}“`);
  }
  for (const t of overrides?.extraHinweise || []) lines.push(`• Zusätzlicher Hinweis: ${t}`);
  if (editedDocx) lines.push(`• ⚠️ Handbearbeitete DOCX hochgeladen: ${editedDocx.name} (SHA-256 ${String(editedDocx.sha256).slice(0, 12)})`);
  if (!lines.length) return [];
  return [`✏️ Angebot angepasst${user ? ` (von ${user})` : ""}:`, ...lines];
}

export function getBitrixTargetFromPayload(payload: any = {}): { entityType: "deal" | "contact"; entityId: string } | null {
  const kd = payload?.Kundendaten || {};
  const dealId = String(payload?.bitrixDealId || payload?.Zusammenfassung?.dealId || payload?.dealId || kd?.dealId || "").trim();
  const contactId = String(payload?.bitrixContactId || kd?.bitrixContactId || kd?.customerNumber || "").trim();
  if (dealId) return { entityType: "deal", entityId: dealId };
  if (contactId) return { entityType: "contact", entityId: contactId };
  return null;
}

export function buildBitrixEmailComment(a: { offerNumber?: string; to?: string; subject?: string; body?: string; attachmentNames?: string[]; bitrixOnly?: boolean; changes?: string[] }, now = new Date()): string {
  const dt = now.toLocaleString("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const safe = (v: unknown) => String(v ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawBody = safe(a.body || "").trim();
  const maxLen = 20000;
  const bodyOut = rawBody.length > maxLen ? `${rawBody.slice(0, maxLen)}\n…(gekürzt)…` : rawBody;
  const changes = a.changes ?? [];
  return [
    a.bitrixOnly ? "📎 Dokumente von OC in Bitrix abgelegt (kein E-Mail-Versand)" : "📧 Email automatisch von OC gesendet",
    a.offerNumber ? `Angebot: ${safe(a.offerNumber).trim()}` : null,
    `Datum/Zeit: ${dt}`,
    a.bitrixOnly ? null : `Empfänger: ${safe(a.to).trim() || "-"}`,
    `Betreff: ${safe(a.subject).trim() || "-"}`,
    `Anhänge: ${Array.isArray(a.attachmentNames) && a.attachmentNames.length ? a.attachmentNames.join(", ") : "-"}`,
    ...(changes.length ? ["", ...changes] : []),
    "",
    "Inhalt:",
    bodyOut || "-",
  ].filter(Boolean).join("\n");
}

export const safeOfferFilename = (raw: unknown) => `${String(raw || "Angebot").replace(/[^\w\-]+/g, "_")}.pdf`;

/** Plain-text body + signature; AH (Soziale Dienste UG) has its own contact block. */
export function buildEmailTextBody(body: unknown, contactName = DEFAULT_CONTACT_NAME, isAh = false): string {
  const trimmed = String(body || "").trim();
  const footer = isAh
    ? [
        "emc2 Attila Landgrafe",
        "Waldstraße 5",
        "95032 Hof",
        "Deutschland",
        "",
        "Tel.: 09281 5915900",
        "Fax.: 09281 5915909",
        "Email: kontakt@e-m-c-2.de",
        "Web: emczwei.de",
        "Hof/Saale",
        "Steuer-Nr.: 223/147/40118",
        "Geschäftsführer: Attila Landgrafe",
      ]
    : [
        "EmC2 Attila Landgrafe",
        "Waldstr. 5 / 95032 Hof",
        "",
        "Tel.: +49 9281 5915900",
        "Fax: +49 9281 5915909",
        "Mail: service@e-m-c-2.de",
        "Web: www.emczwei.de",
      ];
  const signature = ["", "--", "Freundliche Grüße", "", contactName, "", "Ihr Team von emc2", "", ...footer].join("\n");
  return `${trimmed}${signature}`;
}

interface Preset { id: string; filename: string }
const AH_PRESETS: Preset[] = [
  { id: "flyer_ah", filename: "Flyer_Alltagshilfe_EmC2 Soziale Dienste.pdf" },
  { id: "barrierefrei", filename: "emc2_Barrierefreies_Wohnen.pdf" },
  { id: "agb_ah", filename: "AGB_Alltagshilfe_EmC2 Soziale Dienste UG.pdf" },
  { id: "zusatzblatt_ah", filename: "Zusatzblatt für Krankenkasse Alltagshilfe_EmC2 Soziale Dienste UG.pdf" },
  { id: "abtretung_ah", filename: "Abtretungserklärung_SGB_45b_EmC2 Soziale Dienste UG.pdf" },
  { id: "vollmacht", filename: "Vollmacht_SGB_45b_EmC2 Soziale Dienste UG.pdf" },
];
const DEFAULT_PRESETS: Preset[] = [
  { id: "abtretung", filename: "Abtretungserklärung.pdf" },
  { id: "barrierefrei", filename: "emc2_Barrierefreies_Wohnen.pdf" },
  { id: "vollmacht", filename: "Vollmacht.pdf" },
];

/** Always-attached documents unless excluded in the UI; AH Selbstzahler never gets Abtretung/Vollmacht. */
export function getPresetAttachments(assetsDir: string, exclude: Set<string>, isSelbstzahler: boolean, offerType: unknown) {
  const isAh = String(offerType || "").toLowerCase() === "ah";
  const payerExcluded = isAh && isSelbstzahler ? new Set(["abtretung_ah", "vollmacht"]) : new Set<string>();
  return (isAh ? AH_PRESETS : DEFAULT_PRESETS)
    .filter((p) => !exclude.has(p.id) && !payerExcluded.has(p.id))
    .map((p) => ({ filename: p.filename, path: join(assetsDir, "Email", p.filename) }))
    .filter((p) => existsSync(p.path));
}
