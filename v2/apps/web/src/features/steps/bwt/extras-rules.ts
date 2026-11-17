// Badewannentür, slice 2 — the free items (Freier Posten), as today's UI stores them
// (test/fixtures/bwt-extras.json, v2/scripts/capture-bwt-extras.cjs).
//  - the rows are typed text; nothing is reformatted or filtered while typing (price "799.5",
//    "ab 12,5 €", quantity "2.5" stay as typed)
//  - `bwt.quickAdd` lists the rows that are not completely empty, as
//    { kind: "bwt-extra", label (trimmed), productId (trimmed), qty (number, 0 when empty), price (number) };
//    removed when there is none. Price: "1.234,56" / "799,00 €" / "799.5" → number, 2 decimals, 0 when not above 0
//  - the pricing core prices a row only with quantity above 0 and price above 0 (id empty → "BWT_CUSTOM")
//  - FIXED vs. today: leaving the price with a price above 0 and no quantity sets the quantity to 1 (today's
//    wiring for it never reaches this page, so such a row was silently left out of the price)
//  - FIXED vs. today: "+" and the trash can do nothing in today's UI (their handler is wired to the
//    Duschabtrennung section only; one row only). Here they work as meant:
//  - "+" adds a row only when the last row has a price above 0 and an article id (focus goes to the
//    missing field; the name is not required); a new row gets the focus on its price
//  - the trash can clears the only row, else removes the row
type Fields = Record<string, unknown>;
export interface Row { name: string; price: string; qty: string; id: string }
export const EMPTY_ROW: Row = { name: "", price: "", qty: "", id: "" };

/** today's `parseMoneyEuro` */
export function parseMoney(v: unknown): number {
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.-]/g, "").replace(/\s+/g, "");
  const comma = s.includes(","), dot = s.includes(".");
  if (comma && dot) s = s.replace(/\./g, "").replace(",", ".");
  else if (comma) s = s.replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** the rows to show: the ones being edited, else the stored ones (a price as "799,5") */
export function rowsOf(b: Fields, remembered: unknown): Row[] {
  if (Array.isArray(remembered) && remembered.length) return remembered as Row[];
  const stored = Array.isArray(b.quickAdd) ? (b.quickAdd as Fields[]) : [];
  if (!stored.length) return [{ ...EMPTY_ROW }];
  return stored.map((q) => ({
    name: String(q.label ?? ""), id: String(q.productId ?? ""), qty: q.qty == null || q.qty === "" ? "" : String(q.qty),
    price: typeof q.price === "number" ? String(q.price).replace(".", ",") : String(q.price ?? ""),
  }));
}

/** `quickAdd` for the rows — undefined when no row has anything in it */
export function storedRows(rows: readonly Row[]): unknown[] | undefined {
  const out = rows.flatMap((r) => {
    const label = r.name.trim(), productId = r.id.trim(), qty = Number(r.qty || 0) || 0, priceRaw = r.price.trim();
    if (!label && !productId && !priceRaw && qty <= 0) return [];
    return [{ kind: "bwt-extra", label, productId, qty, price: parseMoney(priceRaw) }];
  });
  return out.length ? out : undefined;
}

/** "+": the rows with one more, or the field of the last row that is still missing */
export function addRow(rows: readonly Row[]): { rows: Row[]; missing?: keyof Row } {
  const last = rows[rows.length - 1]!;
  if (parseMoney(last.price) <= 0) return { rows: [...rows], missing: "price" };
  if (!last.id.trim()) return { rows: [...rows], missing: "id" };
  return { rows: [...rows, { ...EMPTY_ROW }] };
}
export const removeRow = (rows: readonly Row[], i: number): Row[] => (rows.length <= 1 ? [{ ...EMPTY_ROW }] : rows.filter((_, at) => at !== i));
