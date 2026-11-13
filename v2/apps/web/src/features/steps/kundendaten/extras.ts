// Wohnumfeld (amounts of the subsidy already used) and the internal list — the rules of today's
// UI, recorded in test/fixtures/kundendaten-extras.json:
//  - `Kundendaten.wohnumfeld` holds the amounts only while the answer is "Ja" (and the payer is
//    a Kassenkunde); otherwise it is { done: false, amount: 0, entries: [] }. The rows themselves
//    stay as they were entered and are there again when the answer is "Ja" again.
//  - an amount that is not a positive number counts as 0; the text is stored trimmed
//  - the internal list is `Kundendaten["internalTodos[]"]`; with no entry the key is not stored
type Fields = Record<string, unknown>;
export interface AmountRow { amount: string; fuerWas: string }

export const NO_MEASURES = { done: false, amount: 0, entries: [] as { amount: number; fuerWas: string }[] };
export const EMPTY_ROW: AmountRow = { amount: "", fuerWas: "" };

const amountOf = (raw: string) => {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** what is stored for these rows */
export function storedWohnumfeld(done: unknown, rows: readonly AmountRow[]) {
  if (done !== "Ja") return { ...NO_MEASURES, entries: [] };
  const entries = rows.map((r) => ({ amount: amountOf(r.amount), fuerWas: r.fuerWas.trim() }));
  return { done: true, amount: entries.reduce((sum, e) => sum + e.amount, 0), entries };
}

/** the rows on the page: what was entered while the offer is open, else what is stored, else one empty row */
export function amountRows(kd: Fields, remembered: unknown): AmountRow[] {
  if (Array.isArray(remembered) && remembered.length) return remembered as AmountRow[];
  const stored = (kd.wohnumfeld as { entries?: { amount?: unknown; fuerWas?: unknown }[] } | undefined)?.entries;
  if (Array.isArray(stored) && stored.length) return stored.map((e) => ({ amount: e.amount ? String(e.amount) : "", fuerWas: String(e.fuerWas ?? "") }));
  return [EMPTY_ROW];
}

/** "Bereits verbraucht": the sum of the rows as entered */
export function usedText(rows: readonly AmountRow[]): string {
  return rows.reduce((sum, r) => sum + (Number(String(r.amount || "").replace(",", ".")) || 0), 0).toLocaleString("de-DE") + " €";
}

export const TODOS = "internalTodos[]";
/** the internal list as stored (older offers may hold it as `internalTodos`, or as one text) */
export function todosOf(kd: Fields): string[] {
  const v = kd[TODOS] ?? kd.internalTodos;
  return Array.isArray(v) ? v.map((x) => String(x ?? "")) : v ? [String(v)] : [];
}
export const todoCount = (n: number) => (n === 1 ? "1 Eintrag" : `${n} Einträge`);
