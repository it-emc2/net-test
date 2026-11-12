// "Aus Zielpreis berechnen": the largest markup whose total stays just under a target price.
// The search is today's (script.js findBestAufschlagUnits / applyAutomatisch), unchanged: the
// price grows with the markup but not evenly (the server rounds per step), so it jumps to an
// estimate, brackets the goal and bisects. One unit = 0.0001 %.

/** Largest u with priceAt(u) <= goal, starting at the estimate u0; -1 if even u = 0 is over. */
export async function findBestMarkupUnits(priceAt: (u: number) => Promise<number>, u0: number, goal: number, slope: number): Promise<number> {
  const hit = (p: number) => Math.abs(p - goal) < 0.005;
  let lo = Math.max(0, u0);
  let p: number;
  if (slope > 0) {
    for (let i = 0; i < 3; i++) {
      p = await priceAt(lo);
      if (hit(p)) return lo;
      const next = Math.max(0, lo + Math.floor((goal - p) / slope));
      if (next === lo) break;
      lo = next;
    }
  }
  const step0 = slope > 0 ? Math.max(1, Math.floor(0.01 / slope)) : 1;
  let step = step0;
  while ((p = await priceAt(lo)) > goal) {
    if (lo === 0) return -1;
    lo = Math.max(0, lo - step);
    step *= 2;
  }
  if (hit(p)) return lo;
  step = step0;
  let hi = lo + step;
  while ((p = await priceAt(hi)) <= goal) {
    if (hit(p)) return hi;
    lo = hi;
    step *= 2;
    hi = lo + step;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    p = await priceAt(mid);
    if (hit(p)) return mid;
    if (p <= goal) lo = mid;
    else hi = mid;
  }
  return lo;
}

export const unitsText = (u: number): string => (u / 10000).toFixed(4);

/** "4.180" / "4.180,50" → 4180 / 4180.5; not a positive number → NaN */
export function parseTarget(raw: unknown): number {
  const n = parseFloat(String(raw ?? "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

export type TargetResult = { ok: true; percent: string } | { ok: false; message: string };

/**
 * `current`: the price shown now (total, markup amount, markup as a fraction, VAT).
 * `priceWith(aufschlag)`: the total the server computes for the offer with that markup ("37.1234%").
 */
export async function markupForTarget(
  rawTarget: unknown,
  current: { total?: unknown; markup?: unknown; markupPct?: unknown; vatOnNet?: unknown } | null | undefined,
  priceWith: (aufschlag: string) => Promise<number>,
): Promise<TargetResult> {
  if (!current) return { ok: false, message: "Bitte warten Sie, bis der Preis berechnet ist." };
  const total = Number(current.total), markup = Number(current.markup), pctNow = Number(current.markupPct), vat = Number(current.vatOnNet) || 0;
  if (!markup || markup <= 0) return { ok: false, message: "Kein Aufschlag-Betrag vorhanden – die Berechnung aus dem Zielpreis ist nicht möglich." };
  const target = parseTarget(rawTarget);
  if (!Number.isFinite(target)) return { ok: false, message: "Bitte einen gültigen Zielpreis eingeben." };
  const net = total - vat;
  const factor = net > 0 ? total / net : 1.19; // 1 + tax rate, taken from the server's own numbers
  const est = pctNow + (pctNow * (target - total)) / (factor * markup);
  const u0 = Number.isFinite(est) ? Math.floor(est * 1e6) : 0;
  const goal = Math.round(target * 100 - 1) / 100; // strictly under the target, as close as possible
  const cache = new Map<number, number>();
  const priceAt = async (u: number) => {
    if (!cache.has(u)) cache.set(u, await priceWith(`${unitsText(u)}%`));
    return cache.get(u)!;
  };
  const slope = pctNow > 0 ? ((factor * markup) / pctNow) * 1e-6 : 0;
  const best = await findBestMarkupUnits(priceAt, u0, goal, slope);
  if (best < 0) return { ok: false, message: "Der berechnete Aufschlag wäre negativ – der Zielpreis liegt unter den Selbstkosten." };
  return { ok: true, percent: unitsText(best) };
}
