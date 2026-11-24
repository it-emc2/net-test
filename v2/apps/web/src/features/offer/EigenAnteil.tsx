// Eigenanteil for Kassenkunden (parity with today's bottom bar, `updateSummaryWidgetSelfPay`).
// Display only: every number comes from the price answer (pricing core: subsidy by budget option,
// minus the used Wohnumfeld amount, selfPay = max(0, total − subsidy)).
import { ChevronDown, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
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
  if ((p as Record<string, unknown>)._clientSideOffer === true) return null; // Winterdienst / Hausmeister-Service: the server's empty shell, no price (today: „–“)
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

const label = (s: SelfPay, short = false) => (s.twoPersons ? `Eigenanteil · 2 ${short ? "Pers." : "Personen"}` : "Eigenanteil");
const n = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 }); // 4.500 · 4.180,50
const calc = (s: SelfPay) => `${n(s.total)} − ${n(s.subsidy)} Pflegekasse${s.prior ? ` + ${n(s.prior)} Wohnumfeld` : ""}`; // selfPay = total − (subsidy − used)
const GREEN = "text-green-800 dark:text-green-300";
const BOX = "flex h-11 shrink-0 items-stretch overflow-hidden rounded-lg border border-input bg-card text-left leading-tight";

/** step bar, Kassenkunde: ONE money button — Gesamt | Eigenanteil | ⌄ (tap → breakdown). Without a
 *  subsidy option the tinted part is the amber chip that leads to Kundendaten. Others: `fallback`. */
export function BarMoney({ base, fallback, className }: { base: string; fallback: ReactNode; className?: string }) {
  const s = useSelfPay();
  if (!s) return <>{fallback}</>;
  const gesamt = (
    <span className="grid content-center px-3 max-[479px]:px-2">
      <span className="text-[0.75rem] text-foreground/75">Gesamt</span>
      <span className="text-[0.95rem] font-medium tabular-nums text-foreground/80">{euro(s.total)}</span>
    </span>
  );
  if (!s.hasOption) return (
    <div className={cn(BOX, className)}>{gesamt}
      <Link to={`${base}/Kundendaten`} className="flex flex-1 items-center gap-1.5 border-l border-amber-500 bg-amber-500/15 px-3 text-[0.9rem] max-[479px]:min-w-12 max-[479px]:justify-center max-[479px]:px-0 font-semibold text-amber-800 no-underline dark:text-amber-300">
        <TriangleAlert aria-hidden className="size-4" /><span className="max-[479px]:sr-only">Zuschuss wählen</span>
      </Link>
    </div>
  );
  return (
    <>
      <button type="button" popoverTarget="selfpay-breakdown" aria-haspopup="true" aria-label={`Gesamt ${euro(s.total)}, ${label(s, true)} ${euro(s.selfPay)} – Aufschlüsselung`} className={cn(BOX, "cursor-pointer p-0", className)}>
        {gesamt}
        <span className="grid flex-1 content-center border-l border-success/50 bg-success/15 px-3 max-[479px]:px-2">
          <span className={cn("text-[0.75rem]", GREEN)}>Eigenanteil{s.twoPersons ? <span className="max-[479px]:hidden"> · 2 Pers.</span> : null}</span>
          <strong data-testid="selfpay-amount" className={cn("text-[0.95rem] font-medium tabular-nums", GREEN)}>{euro(s.selfPay)}</strong>
        </span>
        <span aria-hidden className="grid place-items-center border-l border-input px-2 text-foreground/75 max-[479px]:hidden"><ChevronDown className="size-4" /></span>
      </button>
      <div id="selfpay-breakdown" popover="auto" aria-label="Eigenanteil Aufschlüsselung" className="fixed inset-auto right-3 top-32 m-0 w-[min(340px,calc(100vw-24px))] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl">
        <dl className="m-0 grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-2 tabular-nums">
          <dt className="text-foreground/75">Gesamt</dt><dd className="m-0 whitespace-nowrap text-right">{euro(s.total)}</dd>
          <dt className="text-foreground/75">Zuschuss Pflegekasse</dt><dd className="m-0 whitespace-nowrap text-right">−{euro(s.subsidy)}</dd>
          <dt className="text-[0.9rem] text-foreground/75">davon schon genutzt</dt><dd className={cn("m-0 whitespace-nowrap text-right text-[0.9rem]", !s.prior && "text-foreground/75")}>{euro(s.prior)}</dd>
        </dl>
        <div className="mt-3 rounded-lg bg-success/15 px-3 py-2.5">
          <p className="m-0 flex items-baseline justify-between gap-4 font-medium"><span>{label(s)} Kunde</span><span className={cn("whitespace-nowrap text-[1.25rem] tabular-nums", GREEN)}>{euro(s.selfPay)}</span></p>
          {s.selfPay === 0 ? <p className="m-0 mt-0.5 text-[0.85rem] text-foreground/75">Komplett über Pflegekasse</p> : null}
        </div>
      </div>
    </>
  );
}

/** drawer / sidebar: the same receipt in small — Eigenanteil block and the calculation line */
export function SelfPayRows({ base }: { base: string }) {
  const s = useSelfPay();
  if (!s) return null;
  if (!s.hasOption) return <Link to={`${base}/Kundendaten`} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-500/15 px-3 text-[0.9rem] font-semibold text-amber-800 no-underline dark:text-amber-300"><TriangleAlert aria-hidden className="size-4" />Zuschuss wählen</Link>;
  return (
    <div className="rounded-lg bg-success/15 px-3 py-2" data-testid="selfpay-rows">
      <p className="m-0 flex items-baseline justify-between gap-3 font-medium"><span>{label(s)}</span><span className={cn("whitespace-nowrap text-[1.1rem] tabular-nums", GREEN)}>{euro(s.selfPay)}</span></p>
      <p className="m-0 text-[0.8rem] text-foreground/75">{calc(s)}{s.selfPay === 0 ? " · Komplett über Pflegekasse" : ""}</p>
    </div>
  );
}
