// AH budget mode: fitAhToBudget (ah-fit.ts). Properties over many generated offers + worked examples.
import { describe, expect, it } from "vitest";
import { ahDauer, ahRowCap, ahRowMaxMinutes, AH_CONSTANTS, AH_FREQ, computeAhPricing, fitAhToBudget, parseDurationMinutes, type AhPricingInput, type AhService } from "../src/index.js";

const CONFIG = { entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000 };
const HND = "Haushaltsnahedienstleistungen", AB = "Alltagsbegleitung";
const svc = (type: string, rows: [string, string][], combinedVisit = false): AhService => ({ type, schedules: rows.map(([dauer, regelmaessigkeit]) => ({ dauer, regelmaessigkeit })), tasks: [], combinedVisit });
const input = (services: AhService[], zone: number | null = 2, zwei = false): AhPricingInput => ({
  services, zone: zone ? { zone, billMin: (zone - 1) * 10 + 10 } : null, payer: "Kassenkunde", entlastungsbetragNutzen: true, zweiPersonen: zwei,
  verhinderungspflegeMonat: 0, umwidmungBeantragt: false, umwidmungBetrag: 0, config: CONFIG,
});
const mins = (s: AhService[]) => s.map((x) => x.schedules!.map((r) => parseDurationMinutes(r.dauer)));
const price = (i: AhPricingInput, s: AhService[]) => computeAhPricing({ ...i, services: s }).allBase;
const rate = (t: string | undefined) => (t === HND ? AH_CONSTANTS.STUNDENSATZ_HND : AH_CONSTANTS.STUNDENSATZ_AB);

// deterministic pseudo-random offers
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const RH = Object.keys(AH_FREQ);
const DUR = ["0:15", "0:30", "0:45", "1:00", "1:30", "2:00", "3:00", "4:00"];
const CASES = Array.from({ length: 300 }, () => {
  const services: AhService[] = [];
  const both = rnd() < 0.5, hnd = both || rnd() < 0.5;
  if (both || !hnd) services.push(svc(AB, Array.from({ length: rnd() < 0.15 ? 2 : 1 }, () => [pick(DUR), pick(RH)] as [string, string]), rnd() < 0.5));
  if (hnd) services.push(svc(HND, Array.from({ length: rnd() < 0.15 ? 2 : 1 }, () => [pick(DUR), pick(RH)] as [string, string])));
  return input(services, pick([null, 1, 2, 3, 5]), rnd() < 0.2);
});
// rows that cost the same per minute: one service, two time rows with the same rhythm
const SAME = Array.from({ length: 120 }, () => { const r = pick(RH); return input([svc(pick([HND, AB]), [[pick(DUR), r], [pick(DUR), r]])], pick([null, 1, 2, 3]), rnd() < 0.5); });
const budgetOf = (i: AhPricingInput) => CONFIG.entlastungsbetragMonat * (i.zweiPersonen ? 2 : 1);

describe("fitAhToBudget — properties", () => {
  it("result ≤ budget; no row below 5 minutes; nothing fits → base kept", () => {
    let fitted = 0;
    for (const i of CASES) {
      const r = fitAhToBudget(i, budgetOf(i));
      if (r.fits) { fitted++; expect(r.total).toBeLessThanOrEqual(budgetOf(i)); expect(Math.min(...mins(r.services).flat())).toBeGreaterThanOrEqual(5); }
      else expect(mins(r.services)).toEqual(mins(i.services));
      expect(r.total).toBe(price(i, r.services));
    }
    expect(fitted).toBeGreaterThan(200);
  });

  it("adding 5 minutes to any row would exceed the budget — or the row is at its cap", () => {
    for (const i of CASES) {
      const r = fitAhToBudget(i, budgetOf(i));
      if (!r.fits) continue;
      r.services.forEach((s, a) => s.schedules!.forEach((row, b) => {
        const m = parseDurationMinutes(row.dauer), f = AH_FREQ[String(row.regelmaessigkeit)];
        if (!f) return;
        const cap = Math.min(480, ahRowCap(f, rate(s.type), budgetOf(i), i.zone ? i.zone.billMin / 60 : 0));
        if (m + 5 > cap) return;
        const more = structuredClone(r.services);
        more[a]!.schedules![b]!.dauer = ahDauer(m + 5);
        expect(price(i, more), JSON.stringify(r.services)).toBeGreaterThan(budgetOf(i));
      }));
    }
  });

  it("idempotent: fitting a fitted offer changes nothing", () => {
    for (const i of CASES) {
      const r = fitAhToBudget(i, budgetOf(i));
      if (!r.fits) continue;
      expect(fitAhToBudget({ ...i, services: r.services }, budgetOf(i)).services).toEqual(r.services);
    }
  });

  it("keeps the ratio between the rows within rounding", () => {
    let checked = 0;
    for (const i of [...CASES, ...SAME]) {
      const r = fitAhToBudget(i, budgetOf(i));
      if (!r.fits) continue;
      const travelH = i.zone ? i.zone.billMin / 60 : 0;
      // rows that are neither at 5 minutes nor at their cap: one factor k explains all of them —
      // after ∈ (base·k − 5n, base·k + 5) (rounded down to 5 min, plus filled steps); rows of equal cost per minute only
      const rows = i.services.flatMap((s, a) => s.schedules!.map((x, b) => ({ s, x, after: parseDurationMinutes(r.services[a]!.schedules![b]!.dauer) })))
        .filter(({ s, x, after }) => { const f = AH_FREQ[String(x.regelmaessigkeit)]; return f && after > 5 && after < Math.min(480, ahRowCap(f, rate(s.type), budgetOf(i), travelH)); })
        .filter(({ s, x }, _n, all) => all.every((o) => o.s.type === s.type && o.x.regelmaessigkeit === x.regelmaessigkeit)) // same cost per minute
        .map(({ x, after }) => ({ base: parseDurationMinutes(x.dauer), after }));
      if (rows.length < 2) continue;
      checked++;
      const TOL = 5 * rows.length;
      const lower = Math.max(...rows.map((q) => (q.after - TOL) / q.base)), upper = Math.min(...rows.map((q) => (q.after + 5) / q.base));
      // (one shared k: every row within one 5-minute step of base·k)
      expect(lower, JSON.stringify(rows)).toBeLessThan(upper);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("input is not changed; rows without a priced rhythm (Einmalig, empty) stay as they are", () => {
    const i = input([svc(HND, [["2:00", "Wöchentlich"], ["3:00", "Einmalig"], ["1:00", ""]])]);
    const copy = structuredClone(i);
    const r = fitAhToBudget(i, 131);
    expect(i).toEqual(copy);
    expect(r.services[0]!.schedules!.slice(1)).toEqual(copy.services[0]!.schedules!.slice(1));
  });

  it("base durations decide the ratio, not the current ones", () => {
    const i = input([svc(AB, [["0:05", "Wöchentlich"]]), svc(HND, [["0:05", "Wöchentlich"]])], 1);
    const a = mins(fitAhToBudget(i, 262, [[60], [120]]).services).flat();
    expect(a[1]! / a[0]!).toBeGreaterThan(1.5);
    expect(a[1]! / a[0]!).toBeLessThan(3);
  });
});

describe("fitAhToBudget — worked examples (131 €, zone 2 = 20 min travel)", () => {
  it("HnD 14-tägig 2:00 → 0:55 per visit: 2,17 × (7,96 + 1:15 h × 40,56) = 127,10 €", () => {
    const r = fitAhToBudget(input([svc(HND, [["2:00", "14-tägig"]])]), 131);
    expect([r.services[0]!.schedules![0]!.dauer, r.total]).toEqual(["0:55", 127.1]);
  });
  it("AB monthly 1:00 in the same visit + HnD 14-tägig 2:00 → 0:20 + 0:45 = 130,13 €", () => {
    const r = fitAhToBudget(input([svc(AB, [["1:00", "Monatlich"]], true), svc(HND, [["2:00", "14-tägig"]])]), 131);
    expect([r.services.map((s) => s.schedules![0]!.dauer), r.total]).toEqual([["0:20", "0:45"], 130.13]);
  });
  it("the same with separate visits → 0:15 + 0:30 = 129,38 €", () => {
    const r = fitAhToBudget(input([svc(AB, [["1:00", "Monatlich"]]), svc(HND, [["2:00", "14-tägig"]])]), 131);
    expect([r.services.map((s) => s.schedules![0]!.dauer), r.total]).toEqual([["0:15", "0:30"], 129.38]);
  });
  it("too much: weekly AB + weekly HnD, zone 5, separate visits → does not fit, base kept", () => {
    const r = fitAhToBudget(input([svc(AB, [["1:00", "Wöchentlich"]]), svc(HND, [["1:00", "Wöchentlich"]])], 5), 131);
    expect([r.fits, r.services.map((s) => s.schedules![0]!.dauer)]).toEqual([false, ["1:00", "1:00"]]);
  });
});

describe("fitAhToBudget — rows set by hand (owner 2026-11-23)", () => {
  const two = (ab: string, hnd: string, zone = 2) => input([svc(AB, [[ab, "Monatlich"]], true), svc(HND, [[hnd, "14-tägig"]])], zone);
  const fixedAb = { fixed: [[true], [false]] };
  it("a hand-set row keeps its value when it fits; the automatic row fills the remainder", () => {
    const i = two("0:30", "2:00");
    const r = fitAhToBudget(i, 131, [], fixedAb);
    expect(r.fits).toBe(true);
    expect(r.services[0]!.schedules![0]!.dauer).toBe("0:30");
    expect(r.total).toBeLessThanOrEqual(131);
    const hnd = parseDurationMinutes(r.services[1]!.schedules![0]!.dauer);
    const more = structuredClone(r.services); more[1]!.schedules![0]!.dauer = ahDauer(hnd + 5);
    expect(price(i, more)).toBeGreaterThan(131); // maximal
    // lowering the hand-set row raises the automatic one
    const lower = fitAhToBudget(two("0:15", "2:00"), 131, [], fixedAb);
    expect(parseDurationMinutes(lower.services[1]!.schedules![0]!.dauer)).toBeGreaterThan(hnd);
  });
  it("hand-set rows are scaled down only when over budget, never raised; minimum 5, multiples of 5", () => {
    const over = fitAhToBudget(two("3:00", "1:00"), 131, [], { fixed: [[true], [true]] });
    const m = mins(over.services).flat();
    expect(over.fits).toBe(true);
    expect(over.total).toBeLessThanOrEqual(131);
    expect(m[0]).toBeLessThan(180); expect(m[1]).toBeLessThanOrEqual(60);
    m.forEach((x) => { expect(x % 5).toBe(0); expect(x).toBeGreaterThanOrEqual(5); });
    const under = fitAhToBudget(two("0:15", "0:15"), 131, [], { fixed: [[true], [true]] });
    expect(mins(under.services).flat()).toEqual([15, 15]); // room left, but nothing is raised
  });
  it("never above the budget; idempotent; nothing fits → own values", () => {
    for (const i of CASES) {
      const fixed = i.services.map((s, a) => s.schedules!.map((_r, b) => (a + b) % 2 === 0));
      const r = fitAhToBudget(i, budgetOf(i), [], { fixed });
      if (!r.fits) { expect(mins(r.services)).toEqual(mins(i.services)); continue; }
      expect(r.total).toBeLessThanOrEqual(budgetOf(i));
      mins(r.services).flat().forEach((x) => expect(x % 5).toBe(0));
      expect(fitAhToBudget({ ...i, services: r.services }, budgetOf(i), [], { fixed }).services).toEqual(r.services);
    }
  });
  it("ahRowMaxMinutes: the largest duration that still fits, automatic rows giving way to 5 minutes", () => {
    const i = two("0:30", "0:45");
    const max = ahRowMaxMinutes(i, 131, 0, 0, fixedAb);
    const at = (m: number) => { const s = structuredClone(i.services); s[0]!.schedules![0]!.dauer = ahDauer(m); s[1]!.schedules![0]!.dauer = "0:05"; return price(i, s); };
    expect(max % 5).toBe(0);
    expect(at(max)).toBeLessThanOrEqual(131);
    expect(at(max + 5)).toBeGreaterThan(131);
    // the other row set by hand too: it keeps its 0:45 → less room
    expect(ahRowMaxMinutes(i, 131, 0, 0, { fixed: [[true], [true]] })).toBeLessThan(max);
    expect(ahRowMaxMinutes(input([svc(HND, [["1:00", "Wöchentlich"]])], 5), 131, 0, 0)).toBe(0);
  });
});
