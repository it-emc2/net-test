// The AH total block of Leistungen and Finanzierung (the same block on both pages; rules.ts summaryOf).
import type { AhOfferTotals } from "@oc/pricing";
import { euro } from "../../../shared/lib/format.js";
import { Card, cn } from "../../../shared/ui/index.js";
import { summaryOf } from "./rules.js";

export function AhSummary({ price, big, "data-testid": testId = "ah-summary" }: { price: AhOfferTotals; big?: boolean; "data-testid"?: string }) {
  const s = summaryOf(price, euro);
  return (
    <Card data-testid={testId} className="gap-2">
      <dl className="m-0 grid gap-2 tabular-nums">
        {s.lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4" data-part="line">
            <dt>{l.label}</dt><dd className="m-0 whitespace-nowrap">{l.minus ? `− ${euro(l.value)}` : euro(l.value)}</dd>
          </div>
        ))}
        <div className={cn("flex items-baseline justify-between gap-4 border-t border-border pt-2 font-bold", big ? "text-[1.5rem]" : "text-[1.15rem]")} data-part="total">
          <dt className={big ? "text-[1.15rem]" : undefined}>{s.total.label}</dt><dd className="m-0 whitespace-nowrap">{euro(s.total.value)}</dd>
        </div>
      </dl>
      {s.notes.map((n) => <p key={n.kind} className="m-0 text-[0.95rem] text-muted-foreground" data-part={`note-${n.kind}`}>{n.text}</p>)}
    </Card>
  );
}
