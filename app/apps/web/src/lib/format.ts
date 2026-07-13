const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatEUR(value: number, currency = "EUR"): string {
  if (currency && currency !== "EUR") {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
  }
  return eur.format(value);
}

/** Prettify a Vigor category slug for display, e.g. "haltegriffe-clivia-plus" → "Haltegriffe Clivia Plus". */
export function categoryLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
