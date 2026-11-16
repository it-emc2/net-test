// Checkliste Badumbau (ADR 026, phase 4): the required items before an offer is done. Two follow
// from the offer (Angebotscheck, sent) and are shown ticked or open; two are ticked by hand and
// stored with the offer. The rules are rules.ts.
import { Check as Tick, Lock } from "lucide-react";
import { Card, CardTitle, cn } from "../../../shared/ui/index.js";
import { useOfferStore, usePrice } from "../../offer/index.js";
import type { Price } from "../angebotscheck/rules.js";
import { checklist, ticked, type Item } from "./rules.js";

const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, unknown>;

function Row({ item }: { item: Item }) {
  const id = `chk-${item.id}`;
  return (
    <label htmlFor={id} data-testid="chk-item" data-item={item.id} data-missing={item.checked ? undefined : "true"}
      className={cn("flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 py-2.5", item.auto ? "cursor-default" : "cursor-pointer",
        item.checked ? "border-[#bfe3cf] bg-[#e8f5ee]" : "border-[#f0c7c2] bg-[#fbeae8]")}>
      <input id={id} type="checkbox" className="size-6 shrink-0 accent-[var(--primary)]" checked={item.checked} disabled={item.auto}
        onChange={(e) => { if (item.key) useOfferStore.getState().patch("zusammenfassung" as never, ticked(offerNow(), item.key, e.target.checked) as never); }} />
      <span className="grid flex-1 gap-0.5">
        <span className="font-semibold"><span data-part="label">{item.label}</span><span aria-hidden className="text-[#a5261c]"> *</span><span className="sr-only"> (Pflichtpunkt{item.checked ? "" : ", offen"})</span></span>
        {item.note ? <small className="text-[0.9rem] text-muted-foreground" data-part="note">{item.note}</small> : null}
      </span>
      {item.auto ? <span className="flex items-center gap-1 text-[0.85rem] text-muted-foreground" title="Wird automatisch gesetzt"><Lock aria-hidden className="size-4" />automatisch</span> : null}
    </label>
  );
}

export function Checkliste() {
  const offer = useOfferStore((s) => s.offer) as Record<string, unknown> | null;
  const price = usePrice();
  const view = checklist(offer, price.data as Price | null);
  return (
    <Card aria-labelledby="chk-title">
      <CardTitle id="chk-title">Checkliste Badumbau</CardTitle>
      <p className="m-0 text-muted-foreground">Bitte alle Punkte abhaken, sobald sie erledigt oder geprüft wurden.</p>
      <p role="status" data-testid="chk-summary" data-complete={view.complete ? "true" : "false"}
        className={cn("m-0 flex items-center gap-2 rounded-lg border px-3 py-3 font-semibold", view.complete ? "border-[#bfe3cf] bg-[#e8f5ee] text-[#1e8449]" : "border-[#f0c7c2] bg-[#fbeae8] text-[#a5261c]")}>
        {view.complete ? <Tick aria-hidden className="size-5" /> : null}<span data-part="text">{view.summary.replace(/^✅\s*/, "")}</span>
      </p>
      {view.groups.map((g) => (
        <section key={g.title} className="grid gap-2" data-testid="chk-group" aria-label={g.title}>
          <h3 className="m-0 text-[1.05rem] font-semibold">{g.title}</h3>
          {g.items.map((i) => <Row key={i.id} item={i} />)}
        </section>
      ))}
    </Card>
  );
}
