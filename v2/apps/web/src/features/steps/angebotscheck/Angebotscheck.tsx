// Angebotscheck (ADR 026, phase 4): does the selection fit the offer? One row per rule that
// applies — also the ones that pass — grouped as the offer is; a row leads to the step that
// fixes it. The rules are rules.ts. Stored here: "Nicht nötig" and the answers to the Rückbau
// questions ("Ja" ticks the removal task on Arbeiten). Badumbau only (the only flow with this step).
import { ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button, Card, CardTitle, Check, cn } from "../../../shared/ui/index.js";
import { Internal } from "../../../shared/ui/internal.js";
import { STEPS, useOfferStore, usePrice } from "../../offer/index.js";
import { arbeitenChanges, toggleTask } from "../arbeiten/rules.js";
import { STATUS_TEXT, acknowledged, check, type Price, type Row, type Status } from "./rules.js";

const DOT: Record<Status, string> = { gruen: "bg-[#22c55e]", gelb: "bg-[#f59e0b]", rot: "bg-[#ef4444]" };
const EDGE: Record<Status, string> = { gruen: "border-l-[#22c55e]", gelb: "border-l-[#f59e0b]", rot: "border-l-[#ef4444]" };
const BADGE: Record<Status, string> = { gruen: "border-[#bfe3cf] bg-[#e8f5ee] text-[#1e8449]", gelb: "border-[#f3dfb0] bg-[#fdf6e3] text-[#8a6100]", rot: "border-[#f0c7c2] bg-[#fbeae8] text-[#a5261c]" };
const Dot = ({ status }: { status: Status }) => <span aria-hidden className={cn("mt-1.5 size-3 shrink-0 rounded-full", DOT[status])} />;

const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** "Nicht nötig" ticked or taken back */
const acknowledge = (id: string, on: boolean) => useOfferStore.getState().patch("zusammenfassung" as never, acknowledged(offerNow(), id, on) as never);
/** a Rückbau question answered: Ja ticks the removal task (as if by hand), Nein is remembered */
function answer(task: string, yes: boolean) {
  const o = offerNow(), dw = o.duschwanne ?? {};
  useOfferStore.getState().patchAll({ ...arbeitenChanges(o, toggleTask(dw, task, yes)), zusammenfassung: acknowledged(o, `rueckbau-${task}`, !yes) });
}
/** the step a row leads to, spelled as the route is */
const stepOf = (target: string) => STEPS.bu.find((s) => s.toLowerCase() === target.toLowerCase()) ?? target;

function RowLine({ row, base }: { row: Row; base: string }) {
  return (
    <div className="grid gap-2 sm:flex sm:items-stretch" data-testid="check-row" data-status={row.status} data-row={row.id}>
      <Link to={`${base}/${stepOf(row.target)}`} data-target={row.target} title={`Zu „${row.target}“ springen`}
        className={cn("flex min-h-12 flex-1 items-start gap-3 rounded-lg border border-border border-l-4 bg-card px-3 py-2.5 text-foreground no-underline hover:bg-muted", EDGE[row.status])}>
        <Dot status={row.status} />
        <span className="grid flex-1 gap-0.5">
          <span className="sr-only">{STATUS_TEXT[row.status]}: </span>
          <span className="font-semibold" data-part="title">{row.title}</span>
          <Internal when={!!row.internal}>{row.details.map((d) => <span key={d} className="text-[0.9rem] text-muted-foreground" data-part="detail">{d}</span>)}</Internal>
        </span>
        <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      </Link>
      {row.question ? (
        <div className="flex gap-2" role="group" aria-label={row.title}>
          {(["ja", "nein"] as const).map((a) => (
            <Button key={a} variant={row.question!.answer === a ? "default" : "outline"} aria-pressed={row.question!.answer === a} className="min-w-16" onClick={() => answer(row.question!.task, a === "ja")}>{a === "ja" ? "Ja" : "Nein"}</Button>
          ))}
        </div>
      ) : row.ack !== undefined ? (
        <div className="flex items-center"><Check id={`ack-${row.id}`} checked={row.ack} onChange={(on) => acknowledge(row.id, on)}>Nicht nötig<span className="sr-only">: {row.title}</span></Check></div>
      ) : null}
    </div>
  );
}

export function Angebotscheck() {
  const { dealId = "", type = "bu" } = useParams();
  const offer = useOfferStore((s) => s.offer) as Record<string, unknown> | null;
  const price = usePrice();
  const result = check(offer, price.data as Price | null);
  const shown = result.groups.filter((g) => g.rows.length);
  return (
    <Card aria-labelledby="check-title">
      <CardTitle id="check-title">Angebotscheck</CardTitle>
      <p className="m-0 text-muted-foreground">Regelbasierte Prüfung: passt die Auswahl zum Angebot?</p>
      <p role="status" data-testid="check-head" data-status={result.status} className={cn("m-0 flex items-center gap-3 rounded-lg border border-border border-l-4 bg-card px-3 py-3 text-[1.05rem] font-semibold", EDGE[result.status])}>
        <span aria-hidden className={cn("size-3.5 shrink-0 rounded-full", DOT[result.status])} />
        <span>Gesamtstatus: {STATUS_TEXT[result.status]}</span>
        {price.pending ? <span className="font-normal text-muted-foreground">· Preis wird berechnet …</span> : null}
      </p>
      {shown.map((g) => (
        <section key={g.key} className="grid gap-2" data-testid="check-group" data-status={g.status} aria-label={g.title}>
          <h3 className="m-0 flex flex-wrap items-center justify-between gap-2 text-[1.05rem] font-semibold">
            <span data-part="title">{g.title}</span>
            <span className="flex gap-1.5">
              {g.counts.map((c) => <span key={c.status} data-part="count" data-status={c.status} title={STATUS_TEXT[c.status]} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.85rem] font-semibold", BADGE[c.status])}><span aria-hidden className={cn("size-2 rounded-full", DOT[c.status])} /><span className="sr-only">{STATUS_TEXT[c.status]}: </span>{c.count}</span>)}
            </span>
          </h3>
          <div className="grid gap-2">{g.rows.map((r) => <RowLine key={r.id} row={r} base={`/deal/${dealId}/${type}`} />)}</div>
        </section>
      ))}
      {shown.length ? null : <p className="m-0 text-muted-foreground">Noch nichts zu prüfen.</p>}
    </Card>
  );
}
