// "Angebot anpassen" — the rules of today's UI (src/public/OfferOverrides.js; reference:
// test/fixtures/versand-anpassungen.json, v2/scripts/capture-versand-anpassungen.cjs):
//  - three kinds of changes to one offer, applied by the server to DOCX, PDF, mail and signing:
//    wording replaced (from → to), a price adjustment per block (net, + or −), extra notes
//  - stored as `offerOverrides`, and only what says something: a replacement needs its old
//    wording, an adjustment an amount other than 0, a note a text. Nothing left → no
//    `offerOverrides` at all (old offers and their fingerprints stay as they are)
//  - changes of single positions (`lineEdits`, made on Kosten in today's UI) are kept as stored
//  - price adjustments and notes are not offered for Alltagshilfe (priced elsewhere, and its
//    document has no notes block)
type Fields = Record<string, unknown>;
export type Target = "services" | "material";
export interface TextRow { from: string; to: string }
export interface PriceRow { target: Target; amount: string }
export interface Rows { text: TextRow[]; price: PriceRow[]; notes: string[] }

export const TARGETS: readonly { value: Target; label: string }[] = [{ value: "services", label: "Arbeiten (Pos. 001)" }, { value: "material", label: "Material (Pos. 002)" }];
const TAX = 0.19; // for the hint only; the server uses its own rate
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});

const cleanText = (rows: readonly TextRow[]) => rows.map((r) => ({ from: String(r.from ?? "").trim(), to: String(r.to ?? "") })).filter((r) => r.from);
const cleanPrice = (rows: readonly PriceRow[]) => rows.map((r) => ({ target: r.target === "material" ? "material" as const : "services" as const, amountNet: r.amount === "" ? NaN : Number(r.amount) })).filter((r) => Number.isFinite(r.amountNet) && r.amountNet !== 0);
const cleanNotes = (rows: readonly string[]) => rows.map((t) => String(t ?? "").trim()).filter(Boolean);

/** the rows of an opened offer */
export function rowsOf(overrides: unknown): Rows {
  const o = obj(overrides);
  return {
    text: list(o.textReplacements).map((r) => ({ from: String(obj(r).from ?? ""), to: String(obj(r).to ?? "") })).filter((r) => r.from.trim()),
    price: list(o.priceAdjustments).map((r) => ({ target: obj(r).target === "material" ? "material" as const : "services" as const, amount: Number.isFinite(Number(obj(r).amountNet)) ? String(Number(obj(r).amountNet)) : "" })).filter((r) => r.amount !== "" && Number(r.amount) !== 0),
    notes: cleanNotes(list(o.extraHinweise) as string[]),
  };
}
/** Rows → what the offer stores; `undefined` when nothing is changed. */
export function stored(rows: Rows, before: unknown): Fields | undefined {
  const textReplacements = cleanText(rows.text), priceAdjustments = cleanPrice(rows.price), extraHinweise = cleanNotes(rows.notes), lineEdits = list(obj(before).lineEdits);
  if (!textReplacements.length && !priceAdjustments.length && !extraHinweise.length && !lineEdits.length) return undefined;
  return { ...(textReplacements.length ? { textReplacements } : {}), ...(priceAdjustments.length ? { priceAdjustments } : {}), ...(extraHinweise.length ? { extraHinweise } : {}), ...(lineEdits.length ? { lineEdits } : {}) };
}
/** "1 Text · 2 Preis · 1 Hinweis angepasst", "" when nothing is changed */
export function badge(overrides: unknown): string {
  const o = obj(overrides), t = list(o.textReplacements).length, p = list(o.priceAdjustments).length, h = list(o.extraHinweise).length, l = list(o.lineEdits).length;
  const parts = [t && `${t} Text`, p && `${p} Preis`, h && `${h} Hinweis${h > 1 ? "e" : ""}`, l && `${l} Position${l > 1 ? "en" : ""}`].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} angepasst` : "";
}
/** "+119,00 € brutto" beside a net amount, "" without one */
export function grossHint(amount: string): string {
  const n = amount === "" ? NaN : Number(amount);
  return Number.isFinite(n) && n ? `${(n * (1 + TAX)).toLocaleString("de-DE", { style: "currency", currency: "EUR", signDisplay: "exceptZero" })} brutto` : "";
}
/** price adjustments and notes are offered for the offers the server prices */
export const hasPriceAndNotes = (type: string | null): boolean => !["ah", "hms", "wd"].includes(String(type ?? "").toLowerCase());
