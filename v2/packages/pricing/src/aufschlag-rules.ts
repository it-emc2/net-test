// 1:1 TypeScript port of legacy src/logic/aufschlag-rules.js (synced with main@42150092).
// Drift guard: test/sync-with-legacy.test.ts.
// Mindest-Aufschlag je Kundenart + Farbzonen des Reglers (rein, ohne DOM; von script.js per import() geladen).
// Die beiden Mindestwerte stehen nur hier. Bewusst keine Admin-Variable: die 21 Admin-Werte sind Preislogik,
// dies ist eine Prüfregel — bei Bedarf hier an cfg.get(...) hängen.
export const AUFSCHLAG_MIN = { Kassenkunde: 50, Selbstzahler: 35 };
export const AUFSCHLAG_MIN_DEFAULT = 35; // Kundenart noch nicht gewählt
export const AUFSCHLAG_ZONE_COLOR = { low: "#ef4444", mid: "#f97316", warm: "#facc15", high: "#22c55e" };

export const aufschlagMin = (payer: any) => (AUFSCHLAG_MIN as any)[payer] ?? AUFSCHLAG_MIN_DEFAULT;
export const isBelowAufschlagMin = (pct: any, payer: any) => Number.isFinite(pct) && pct < aufschlagMin(payer);

/** low = unter Mindestwert (rot) · mid = Mindestwert bis 60 (orange) · warm = 60–70 (gelb) · high = über 70 (grün). */
export function aufschlagZone(pct: any, payer: any) {
  if (!Number.isFinite(pct)) return "mid";
  if (pct < aufschlagMin(payer)) return "low";
  if (pct < 60) return "mid";
  return pct <= 70 ? "warm" : "high";
}

/** Begründung nötig: unter Mindestwert und noch leer. */
export const aufschlagReasonMissing = (pct: any, payer: any, reason: any) =>
  isBelowAufschlagMin(pct, payer) && !String(reason ?? "").trim();
