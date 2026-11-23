// Alltagshilfe · Kosten (UX-CHANGES U-051): read-only. One card per booked service with today's table
// (Leistungen, Anfahrtspauschale, subtotal) and the details without a click, then THE total block of
// Leistungen and Finanzierung (Summary.tsx). All figures: @oc/pricing ahOfferTotals (kosten-rules.ts).
// The table stacks on a narrow screen (label on its own line, then „8,13 h × 40,56 € = 330,00 €“).
import { AlertTriangle } from "lucide-react";
import { Link, useLocation } from "react-router";
import { euro } from "../../../shared/lib/format.js";
import { Card, CardTitle, cn } from "../../../shared/ui/index.js";
import { useAhPrice } from "../../offer/index.js";
import { kostenServices, type KostenRow, type KostenService } from "./kosten-rules.js";
import { AhSummary } from "./Summary.js";

const ROW = "grid grid-cols-[auto_auto_1fr] items-baseline gap-x-2 gap-y-0.5 border-b border-control py-2 sm:grid-cols-[1fr_5.5rem_6rem_6.5rem] sm:gap-x-3";
const HEAD = "text-[0.85rem] font-semibold text-muted-foreground";

function Line({ r }: { r: KostenRow }) {
  return (
    <div className={ROW} role="row" data-testid="ah-kosten-line" data-line={r.key}>
      <span role="cell" className="col-span-3 sm:col-span-1" data-part="label">
        {r.label}{r.hint ? <>{" "}<span className="text-[0.9rem] text-muted-foreground" data-part="hint">{r.hint}</span></> : null}
      </span>
      <span role="cell" className="text-muted-foreground tabular-nums sm:text-right" data-part="qty">{r.qty}</span>
      <span role="cell" className={cn("text-muted-foreground tabular-nums sm:text-right", r.times && "max-sm:before:mr-2 max-sm:before:content-['×']")} data-part="unit">{r.unit}</span>
      <span role="cell" className="text-right font-semibold tabular-nums max-sm:before:mr-2 max-sm:before:font-normal max-sm:before:text-muted-foreground max-sm:before:content-['=']" data-part="total">{r.total}</span>
    </div>
  );
}

function ServiceCard({ s }: { s: KostenService }) {
  return (
    <Card data-testid="ah-kosten-service" data-kind={s.kind} className="gap-2">
      <h3 className="m-0 text-[1.15rem] font-semibold" data-part="title">{s.title}</h3>
      <div role="table" aria-label={s.title}>
        <div className="hidden grid-cols-[1fr_5.5rem_6rem_6.5rem] gap-x-3 border-b border-control pb-1.5 sm:grid" role="row">
          <span role="columnheader" className={HEAD}>Position</span>
          <span role="columnheader" className={cn(HEAD, "text-right")}>Menge</span>
          <span role="columnheader" className={cn(HEAD, "text-right")}>Einzelpreis</span>
          <span role="columnheader" className={cn(HEAD, "text-right")}>Gesamt</span>
        </div>
        {s.rows.map((r) => <Line key={r.key} r={r} />)}
      </div>
      <p className="m-0 flex items-baseline justify-between gap-4 pt-1 text-[1.1rem] font-bold tabular-nums" data-part="subtotal">
        <span>{s.subtotal.label}</span><span>{s.subtotal.value}</span>
      </p>
      <div className="grid gap-0.5" data-part="details">
        {s.details.map((d, i) => (
          <p key={i} className={cn("m-0 text-[0.95rem]", d.kind === "no-zone" ? "flex items-center gap-1.5 font-semibold text-warning-strong" : "text-muted-foreground")} data-part={d.kind}>
            {d.kind === "no-zone" ? <AlertTriangle aria-hidden className="size-4 shrink-0" /> : null}{d.text}
          </p>
        ))}
        {s.footnote ? <p className="m-0 text-[0.95rem] text-muted-foreground" data-part="footnote">{s.footnote}</p> : null}
      </div>
    </Card>
  );
}

export function AhKosten() {
  const price = useAhPrice();
  const { pathname, search } = useLocation();
  if (!price) return null;
  const services = kostenServices(price, euro);
  if (!services.length) {
    return (
      <Card data-testid="ah-kosten" aria-labelledby="ah-kosten-title">
        <CardTitle id="ah-kosten-title">Kosten</CardTitle>
        <p className="m-0 text-muted-foreground" data-part="empty">
          Noch keine Leistung konfiguriert. <Link to={`${pathname.replace(/\/Kosten$/, "/ah")}${search}`} className="font-semibold text-foreground underline underline-offset-2">Zu den Leistungen</Link>
        </p>
      </Card>
    );
  }
  return (
    <div className="grid gap-3" data-testid="ah-kosten">
      <h2 id="ah-kosten-title" className="sr-only">Kosten</h2>
      {services.map((s) => <ServiceCard key={s.kind} s={s} />)}
      <AhSummary price={price} />
    </div>
  );
}
