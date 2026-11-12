const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
/** 1234.5 → "1.234,50 €"; anything that is not a number → "–" */
export const euro = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? EUR.format(v) : "–");

/** today as the offer stores it: YYYY-MM-DD (local day) */
export const todayIso = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
