// Kosten (Kosten-Details; ADR 026, phase 4): the internal overview of every position of the
// offer with quantity, unit price and total, and the ladder of the sums — for checking the
// calculation. Everything comes from the price (rules.ts); the page stores nothing.
// Built for Badumbau, Badewannentür, Handlauf (as today's page groups it, rules.ts), Badelift, Winterdienst and Hausmeister-Service (the
// server's empty shell: all sections empty, zeros) and, as its own
// read-only page, Alltagshilfe (ah/Kosten.tsx, U-051).
// Kundenmodus (C7): the whole page is internal (sums before markup, the markup, today's purchase
// prices) — a calm note takes its place. Alltagshilfe's page shows the customer's own prices and stays.
import { useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { Button, Card, CardTitle, cn } from "../../../shared/ui/index.js";
import { Internal } from "../../../shared/ui/internal.js";
import { toast } from "../../../shared/ui/toaster.js";
import { LegacyLink, useOfferStore, useOfferType, usePrice } from "../../offer/index.js";
import { AhKosten } from "../ah/Kosten.js";
import { sections, sums, type Price, type Row, type Section } from "./rules.js";

const NUM = "grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[0.8rem] font-bold";
const HEAD = "text-[0.85rem] font-semibold text-muted-foreground";

function Lines({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="m-0 text-muted-foreground" data-part="empty">Keine Positionen</p>;
  return (
    // the table scrolls inside its section on a narrow screen; the page itself never does
    <div className="overflow-x-auto">
      <div className="grid min-w-[520px] grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-1.5" role="table">
        <div className="contents" role="row">
          <span role="columnheader" className={HEAD}>Bezeichnung</span><span role="columnheader" className={cn(HEAD, "text-right")}>Menge</span>
          <span role="columnheader" className={cn(HEAD, "text-right")}>Einzelpreis</span><span role="columnheader" className={cn(HEAD, "text-right")}>Gesamt</span>
        </div>
        {rows.map((r, i) => ("subtitle" in r ? (
          <div key={`s${i}`} className="col-span-4 mt-2 font-bold" data-part="subtitle">{r.subtitle}</div>
        ) : r.task ? (
          <div key={`t${i}`} className="col-span-4 flex items-start gap-2 text-muted-foreground" data-testid="kosten-task">
            <Wrench aria-hidden className="mt-1 size-4 shrink-0" /><span><span data-part="label">{r.label}</span> · in Arbeitszeit enthalten</span>
          </div>
        ) : (
          <div key={`${r.id}-${i}`} className="contents" role="row" data-testid="kosten-line" data-line-id={r.id}>
            <span role="cell" className="whitespace-pre-line">
              <span data-part="label">{r.label}</span>
              {r.note ? <Internal> <span data-part="note" className="text-muted-foreground">{r.note}</span></Internal> : null}
              {r.tags.map((t) => <span key={t.text} data-part="tag" title={t.title} className={cn("ml-2 inline-block rounded-full border px-2 py-0.5 text-[0.8rem]", t.kind === "up" && "border-[#f0c7c2] bg-[#fbeae8] font-semibold text-[#a5261c]", t.kind === "down" && "border-[#bfe3cf] bg-[#e8f5ee] font-semibold text-[#1e8449]", t.kind === "plain" && "border-border text-muted-foreground")}>{t.text}</span>)}
            </span>
            <span role="cell" className="text-right tabular-nums" data-part="qty">{r.qty}</span>
            <span role="cell" className="text-right tabular-nums" data-part="unit">{r.unit}</span>
            <span role="cell" className="text-right tabular-nums" data-part="total">{r.total}</span>
          </div>
        )))}
      </div>
    </div>
  );
}

function Block({ section }: { section: Section }) {
  return (
    <section className="grid gap-2" data-testid="kosten-section">
      <h3 className="m-0 flex items-center gap-2 border-b-2 border-primary pb-1 text-[1.1rem] font-semibold">{section.num ? <span data-part="num" className={NUM}>{section.num}</span> : null}<span data-part="title">{section.title}</span></h3>
      <Lines rows={section.rows} />
      {section.footer ? <p className="m-0 border-t border-border pt-2 text-right" data-part="footer">{section.footer.replace(/: .*$/, ":")} <b>{section.footer.replace(/^.*: /, "")}</b></p> : null}
      {section.note ? <p className={cn("m-0 rounded-lg border p-3 text-[0.9rem] font-semibold", section.note.up ? "border-[#f0c7c2] bg-[#fbeae8] text-[#a5261c]" : "border-[#bfe3cf] bg-[#e8f5ee] text-[#1e8449]")} data-part="note">{section.note.text}</p> : null}
    </section>
  );
}

export function Kosten() {
  const type = useOfferType();
  const { dealId = "" } = useParams();
  const price = usePrice();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const offer = useOfferStore((s) => s.offer) as Record<string, any> | null;
  const ctx = { type, offer };
  if (type === "ah") return <AhKosten />;
  if (type !== "bu" && type !== "bwt" && type !== "hl" && type !== "bl" && type !== "wd" && type !== "hms") {
    return (
      <Card>
        <CardTitle>Kosten</CardTitle>
        <p className="m-0">Dieser Schritt wird noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
        <LegacyLink dealId={dealId} step="Kosten">In der bisherigen Ansicht öffnen</LegacyLink>
      </Card>
    );
  }
  const data = price.data as Price | null;
  /** asks the server for the price again (supplier or price-list prices may have changed) */
  const again = async () => {
    setBusy(true);
    try { await client.invalidateQueries({ queryKey: ["price"] }); toast.success("Preis neu berechnet."); }
    catch { toast.error("Preis neu berechnen fehlgeschlagen. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  };
  return (
    <Internal notice testId="kosten-hidden">
    <Card aria-labelledby="kosten-title">
      <CardTitle id="kosten-title">Kosten-Details</CardTitle>
      <p className="m-0 text-muted-foreground">Interne Übersicht aller gewählten Positionen mit Mengen, Einzel- und Gesamtpreisen. Dient zum Prüfen der Abrechnung.</p>
      {!data ? <p className="m-0 text-muted-foreground" role="status">{price.error ? "Keine Daten" : "Berechne …"}</p> : (
        <>
          {sections(data, ctx).map((s) => <Block key={s.title} section={s} />)}
          <section className="grid gap-2" data-testid="kosten-sums">
            <h3 className="m-0 border-b-2 border-primary pb-1 text-[1.1rem] font-semibold">Summen</h3>
            <dl className="m-0 grid gap-2">
              {sums(data, ctx).map((r, i) => ("note" in r && r.note !== undefined ? (
                <p key={i} className="m-0 text-[0.9rem] text-muted-foreground" data-part="note">{r.note}</p>
              ) : (
                <div key={r.label} data-part="row" data-rule={r.rule ? "true" : undefined} data-total={r.total ? "true" : undefined} className={cn("flex items-baseline justify-between gap-4", r.rule && "border-t border-border pt-2", r.total && "text-[1.15rem] font-bold")}>
                  <dt className="flex items-center gap-2">{r.num ? <span data-part="num" className={NUM}>{r.num}</span> : null}<span data-part="label">{r.label}</span></dt>
                  <dd className="m-0 font-semibold tabular-nums" data-part="value">{r.value}</dd>
                </div>
              )))}
            </dl>
            <div><Button variant="outline" disabled={busy || price.pending} onClick={() => { void again(); }}>Preis neu berechnen</Button></div>
          </section>
        </>
      )}
    </Card>
    </Internal>
  );
}
