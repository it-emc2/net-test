// Eigenanteil for Kassenkunden (parity with today's bottom bar, `updateSummaryWidgetSelfPay`).
// Display only: every number comes from the price answer (pricing core: subsidy by budget option,
// minus the used Wohnumfeld amount, selfPay = max(0, total − subsidy)).
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { euro } from "../../shared/lib/format.js";
import { cn } from "../../shared/ui/index.js";
import { useOfferField } from "./model/store.js";
import { usePrice } from "./model/usePrice.js";

export interface SelfPay { total: number; subsidy: number; prior: number; selfPay: number; hasOption: boolean; twoPersons: boolean }
type Num = number | null | undefined;
/** null unless a Kassenkunde: what the price answer says about the subsidy */
export function selfPayParts(payer: unknown, p: Record<string, Num | string> | null): SelfPay | null {
  if (payer !== "Kassenkunde" || !p || typeof p.total !== "number") return null;
  const subsidy = Number(p.subsidyAmount) || 0, max = Number(p.subsidyAmount_max ?? subsidy) || 0;
  return {
    total: p.total, subsidy, prior: Math.max(0, subsidy - max), selfPay: Number(p.selfPayAmount) || 0,
    hasOption: subsidy > 0, twoPersons: /ZWEI|8360|2 PERSONEN/i.test(String(p.subsidyKind ?? "")),
  };
}
export function useSelfPay(): SelfPay | null {
  const payer = useOfferField<string>("Kundendaten", "payer");
  return selfPayParts(payer, usePrice().data as Record<string, Num | string> | null);
}

const label = (s: SelfPay) => (s.twoPersons ? "Eigenanteil · 2 Personen" : "Eigenanteil");
const n = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 }); // 4.500 · 4.180,50
const calc = (s: SelfPay) => `${n(s.total)} − ${n(s.subsidy)} Pflegekasse${s.prior ? ` + ${n(s.prior)} Wohnumfeld` : ""}`; // selfPay = total − (subsidy − used)

/** step bar: the pill (tap → breakdown) or, without a subsidy option, the chip that leads to Kundendaten */
export function SelfPayPill({ base }: { base: string }) {
  const s = useSelfPay();
  if (!s) return null;
  if (!s.hasOption) return (
    <Link to={`${base}/Kundendaten`} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-amber-500 bg-amber-500/10 px-3 text-[0.9rem] font-semibold text-amber-700 no-underline dark:text-amber-400">
      <TriangleAlert aria-hidden className="size-4" />Zuschuss wählen
    </Link>
  );
  return (
    <>
      <button
        type="button" popoverTarget="selfpay-breakdown" aria-haspopup="true" aria-label={`${label(s)} ${euro(s.selfPay)} – Aufschlüsselung`}
        className="grid min-h-11 shrink-0 cursor-pointer content-center rounded-xl border border-success/50 bg-success/15 px-3 py-0.5 text-left leading-tight text-foreground"
      >
        <span className="text-[0.75rem] text-muted-foreground">{label(s)}</span>
        <strong className="text-base font-medium tabular-nums" data-testid="selfpay-amount">{euro(s.selfPay)}</strong>
      </button>
      <div id="selfpay-breakdown" popover="auto" aria-label="Eigenanteil Aufschlüsselung" className="fixed inset-auto right-3 top-32 m-0 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-4 whitespace-nowrap text-card-foreground shadow-xl">
        <dl className="m-0 grid tabular-nums grid-cols-[1fr_auto] gap-x-4 gap-y-2">
          <dt>Gesamt</dt><dd className="m-0 text-right">{euro(s.total)}</dd>
          <dt>Zuschuss Pflegekasse</dt><dd className="m-0 text-right">−{euro(s.subsidy)}</dd>
          <dt className={cn(!s.prior && "text-muted-foreground")}>bereits genutzt (Wohnumfeld)</dt><dd className={cn("m-0 text-right", !s.prior && "text-muted-foreground")}>{s.prior ? `+${euro(s.prior)}` : euro(0)}</dd>
          <dt className="mt-1 border-t border-border pt-2 font-bold">{label(s)}</dt><dd className="m-0 mt-1 border-t border-border pt-2 text-right font-bold">{euro(s.selfPay)}</dd>
        </dl>
        {s.selfPay === 0 ? <p className="m-0 mt-2 text-[0.85rem] text-muted-foreground">Komplett über Pflegekasse</p> : null}
      </div>
    </>
  );
}

/** drawer / sidebar rows: Eigenanteil in bold green and the calculation line */
export function SelfPayRows({ base }: { base: string }) {
  const s = useSelfPay();
  if (!s) return null;
  if (!s.hasOption) return <SelfPayPill base={base} />;
  return (
    <div className="grid gap-0.5" data-testid="selfpay-rows">
      <p className="m-0 flex justify-between gap-3"><span>{label(s)}</span><strong className="text-success">{euro(s.selfPay)}</strong></p>
      <p className="m-0 text-[0.8rem] text-muted-foreground">{calc(s)}{s.selfPay === 0 ? " · Komplett über Pflegekasse" : ""}</p>
    </div>
  );
}
