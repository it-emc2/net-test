import crypto from "crypto";

const eur = (n) =>
  Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR", signDisplay: "always" });
const POSITION = { services: "Arbeiten (Pos. 001)", material: "Material (Pos. 002)" };

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// What the user changed by hand on this offer, for the Bitrix timeline and the EmailLog:
// OC overrides (wording/price, payload.offerOverrides) and/or an uploaded edited DOCX.
// Empty array = the offer went out as OC generated it.
export function describeOfferChanges({ overrides, editedDocx, user } = {}) {
  const lines = [];
  for (const r of overrides?.textReplacements || []) lines.push(`• Wortlaut: „${r.from}“ → „${r.to}“`);
  for (const r of overrides?.priceAdjustments || []) {
    const net = Number(r.amountNet);
    lines.push(
      `• Preis ${POSITION[r.target] || r.target}: ${eur(net)} netto (${eur(net * 1.19)} brutto)`,
    );
  }
  // single positions changed on the Kosten page
  for (const e of overrides?.lineEdits || []) {
    const name = String(e?.origLabel || e?.id || "").replace(/^\s*-\s*/, "").trim();
    const hasPrice = e?.unitPriceNet !== null && e?.unitPriceNet !== undefined && e?.unitPriceNet !== "" && Number.isFinite(Number(e.unitPriceNet));
    if (hasPrice) {
      const fmt = (n) => Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
      const was = Number.isFinite(Number(e?.origUnitPriceNet)) ? ` statt ${fmt(e.origUnitPriceNet)}` : "";
      lines.push(`• Preis „${name}“: ${fmt(e.unitPriceNet)} netto je Einheit${was}${e?.reason ? ` – Grund: ${e.reason}` : ""}`);
    }
    if (String(e?.label ?? "").trim()) lines.push(`• Beschreibung „${name}“ → „${String(e.label).trim()}“`);
  }
  for (const t of overrides?.extraHinweise || []) lines.push(`• Zusätzlicher Hinweis: ${t}`);
  if (editedDocx) {
    lines.push(
      `• ⚠️ Handbearbeitete DOCX hochgeladen: ${editedDocx.name} (SHA-256 ${String(editedDocx.sha256).slice(0, 12)})`,
    );
  }
  if (!lines.length) return [];
  return [`✏️ Angebot angepasst${user ? ` (von ${user})` : ""}:`, ...lines];
}
