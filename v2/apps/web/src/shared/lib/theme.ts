// Colours follow today's UI: an accent per offer type and the light/dark switch. Both UIs
// share the browser's storage, so the mode chosen in today's UI ("emc2.mode") applies here too.
const OFFER_THEME: Record<string, string> = { bu: "wohnen", bwt: "gesundheit", ah: "pflege", hl: "pflege" };

/** the accent of an offer type; without an offer (Hauptmenü) the default purple */
export function applyOfferTheme(offerType: string | null): void {
  const theme = offerType ? OFFER_THEME[offerType] : undefined;
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function applyStoredMode(): void {
  let mode: string | null = null;
  try { mode = localStorage.getItem("emc2.mode"); } catch { /* storage blocked → light */ }
  document.documentElement.dataset.mode = mode === "dark" ? "dark" : "light";
}
