import { MapPin, AlertTriangle } from "lucide-react";
import type { AhTotals, SchedRow } from "./ahPricing";
import { ANFAHRT_PER_EINSATZ, STUNDENSATZ_HND, STUNDENSATZ_AB } from "./ahPricing";
import { formatEUR } from "@/lib/format";

const COL = { svc: "#7c3aed", trav: "#f59e0b", anf: "#0ea5e9", pausch: "#10b981" };

const hoursLabel = (h: number) => `${(Math.round(h * 100) / 100).toFixed(2).replace(".", ",")} h`;
// Rounded factor with a ≈ marker when rounding loses precision (matches legacy `fac`).
function fac(n: number): string {
  const r = Math.round(n * 100) / 100;
  return (Math.abs(n - r) > 1e-9 ? "≈ " : "") + r.toFixed(2).replace(".", ",");
}
function splitH(rows: SchedRow[]) {
  let s = 0;
  let t = 0;
  for (const r of rows) {
    const f = r.freq || 0;
    s += ((r.dauerMin || 0) / 60) * f;
    t += ((r.reiseRoundMin || 0) / 60) * f;
  }
  return { s, t };
}

export function AhKostenOverview({ totals }: { totals: AhTotals }) {
  const hasHnd = totals.totalMonatlichH > 0;
  const hasAb = totals.hasAb;

  if (!hasHnd && !hasAb) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/30 px-5 py-7 text-center">
        <div className="text-2xl">🧮</div>
        <p className="mt-1 font-semibold">Noch keine Kosten berechnet</p>
        <p className="text-sm text-muted-foreground">Füge oben eine Leistung hinzu, um die Kostenübersicht zu sehen.</p>
      </div>
    );
  }

  const sections: SectionCfg[] = [];
  if (hasHnd)
    sections.push({
      title: "Haushaltsnahe Dienstleistungen",
      rate: STUNDENSATZ_HND,
      sp: splitH(totals.schedRows),
      leistungen: totals.leistungenTotal,
      einsaetze: totals.totalEinsaetze,
      anfahrt: totals.anfahrtTotal,
      servicepauschale: totals.servicepauschale,
      base: totals.gesamtBase,
      sched: totals.schedRows,
    });
  if (hasAb)
    sections.push({
      title: "Alltagsbegleitung",
      rate: STUNDENSATZ_AB,
      sp: splitH(totals.abSchedRows),
      leistungen: totals.abLeistungenTotal,
      einsaetze: totals.abTotalEinsaetze,
      anfahrt: totals.abAnfahrtTotal,
      servicepauschale: 0,
      base: totals.abGesamtBase,
      sched: totals.abSchedRows,
    });

  const zd = totals.zone;
  const yearly = totals.gesamt * 12;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Gradient header + grand total */}
      <div className="bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary))]/80 px-5 py-4 text-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider opacity-85">Kosten-Übersicht</div>
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
                {zd ? (
                  <>
                    <MapPin className="size-3.5" /> Zone {zd.zone} · {zd.billMin} min Hinfahrt
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3.5" /> Keine Zone
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold leading-none">{formatEUR(totals.gesamt)}</div>
            <div className="mt-1 text-sm opacity-90">pro Monat · ≈ {formatEUR(yearly)} / Jahr</div>
            {!totals.isSelbstzahler && (
              <div className="mt-1.5 border-t border-white/30 pt-1.5 text-sm opacity-90">
                Eigenanteil: <b>{formatEUR(totals.eigenanteil)}</b> (Rest über Entlastungsbetrag § 45b)
              </div>
            )}
          </div>
        </div>
      </div>

      {sections.map((cfg, i) => (
        <Panel key={cfg.title} cfg={cfg} zd={zd} last={i === sections.length - 1} />
      ))}

      <div className="border-t bg-muted/30 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        <b>Hinweis zur Berechnung:</b> Monatliche Einsätze werden aus der Jahresfrequenz abgeleitet (z. B. 14-tägig = 26×/Jahr
        ÷ 12 = 2,1667×/Monat). Angezeigte Faktoren sind auf 2 Nachkommastellen gerundet. Reisezeit umfasst nur die Hinfahrt;
        die Rückfahrt wird nicht berechnet.
      </div>
    </div>
  );
}

interface SectionCfg {
  title: string;
  rate: number;
  sp: { s: number; t: number };
  leistungen: number;
  einsaetze: number;
  anfahrt: number;
  servicepauschale: number;
  base: number;
  sched: SchedRow[];
}

function Panel({ cfg, zd, last }: { cfg: SectionCfg; zd: AhTotals["zone"]; last: boolean }) {
  const serviceCost = cfg.sp.s * cfg.rate;
  const travelCost = cfg.sp.t * cfg.rate;
  const segs = [
    { v: serviceCost, c: COL.svc, l: "Leistungszeit" },
    { v: travelCost, c: COL.trav, l: "Fahrtzeit" },
    { v: cfg.anfahrt, c: COL.anf, l: "Anfahrt" },
    ...(cfg.servicepauschale ? [{ v: cfg.servicepauschale, c: COL.pausch, l: "Servicepauschale" }] : []),
  ];
  const total = segs.reduce((a, s) => a + s.v, 0) || 1;
  const sectionTotal = cfg.base + cfg.servicepauschale;
  const fahrtSub = zd ? `(Zone ${zd.zone} · ${zd.billMin} min / Einsatz)` : "";

  return (
    <div className={last ? "px-5 py-4" : "border-b px-5 py-4"}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: COL.svc }} />
          <span className="font-bold">{cfg.title}</span>
          <span className="rounded-full border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {formatEUR(cfg.rate)} / Std.
          </span>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold leading-tight">{formatEUR(sectionTotal)}</div>
          <div className="text-xs text-muted-foreground">pro Monat</div>
        </div>
      </div>

      {/* Segment bar */}
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
        {segs
          .filter((s) => s.v > 0)
          .map((s) => (
            <div key={s.l} title={`${s.l}: ${formatEUR(s.v)}`} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segs
          .filter((s) => s.v > 0)
          .map((s) => (
            <span key={s.l} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.c }} />
              <span className="text-foreground">{s.l}</span> {formatEUR(s.v)}
            </span>
          ))}
      </div>

      {/* Math */}
      <div className="mt-3 text-sm">
        <MathRow label="Zeit vor Ort, pro Monat" value={hoursLabel(cfg.sp.s)} />
        <MathRow label="Fahrtzeit, pro Monat" sub={fahrtSub} value={hoursLabel(cfg.sp.t)} />
        <MathRow label="Gesamtzeit pro Monat" value={hoursLabel(cfg.sp.s + cfg.sp.t)} top strong />
        <MathRow
          label="Gesamtzeit"
          sub={`(${hoursLabel(cfg.sp.s + cfg.sp.t)}) × ${formatEUR(cfg.rate)}`}
          value={formatEUR(cfg.leistungen)}
          top
        />
        <MathRow
          label="Anfahrtspauschale"
          sub={`${fac(cfg.einsaetze)} Einsätze × ${formatEUR(ANFAHRT_PER_EINSATZ)}`}
          value={formatEUR(cfg.anfahrt)}
        />
        {cfg.servicepauschale > 0 && (
          <MathRow label="Servicepauschale" sub="(inkl. MwSt.)" value={formatEUR(cfg.servicepauschale)} />
        )}
        <MathRow label="Zwischensumme" value={formatEUR(sectionTotal)} top strong />
      </div>

      {cfg.sched.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground">Rechenweg pro Einsatz anzeigen</summary>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-semibold">Rhythmus</th>
                <th className="px-2 py-1.5 text-right font-semibold">Leistung</th>
                <th className="px-2 py-1.5 text-right font-semibold">Hinfahrt</th>
                <th className="px-2 py-1.5 text-right font-semibold">/ Einsatz</th>
                <th className="px-2 py-1.5 text-right font-semibold">× / Monat</th>
              </tr>
            </thead>
            <tbody>
              {cfg.sched.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1.5 text-muted-foreground">{r.regelmaessigkeit || "—"}</td>
                  <td className="px-2 py-1.5 text-right">{r.dauerMin} min</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: COL.trav }}>+ {r.reiseRoundMin} min</td>
                  <td className="px-2 py-1.5 text-right font-semibold">= {r.perVisitMin} min</td>
                  <td className="px-2 py-1.5 text-right font-semibold" style={{ color: COL.svc }}>× {fac(r.freq)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function MathRow({ label, sub, value, top, strong }: { label: string; sub?: string; value: string; top?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${top ? "mt-0.5 border-t" : ""}`}>
      <span className={strong ? "font-bold" : "text-muted-foreground"}>
        {label}
        {sub && <span className="ml-1 text-xs font-normal text-muted-foreground">{sub}</span>}
      </span>
      <span className={`whitespace-nowrap ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
