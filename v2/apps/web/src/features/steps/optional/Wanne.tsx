// Optionale Produkte → Wanne: the wizard of today's picker (wanne-rules.ts), its drawings
// (wanne-sketch.ts) and the products of the catalogue. The answers are remembered while the offer
// is open; the pick is stored as today (see wanne-rules.ts).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { act } from "./store.js";
import {
  answer, applySelection, chipTapped, clearFrom, crumbsOf, fromSelection, resultsOf, selectedId, stageSpec, stepOf, summaryOf,
  type Block, type Card, type ChipRow, type WItem, type WState,
} from "./wanne-rules.js";
import { easeInOut, wanneSketchSVG, type WanneSpec } from "./wanne-sketch.js";

type Fields = Record<string, unknown>;
const KEY = "optional-wanne"; // the answers of the wizard, remembered while the offer is open
export const catalogQuery = { queryKey: ["bathtub-catalog"], staleTime: 10 * 60_000, retry: false, queryFn: ({ signal }: { signal: AbortSignal }) => call("bathtubCatalog", { signal }).then((d) => d.items as unknown as WItem[]) };

const Drawing = ({ spec, small = true }: { spec: WanneSpec; small?: boolean }) => (
  // our own SVG markup (wanne-sketch.ts)
  <span aria-hidden className="block overflow-hidden rounded-lg bg-[#f5f5f7]" dangerouslySetInnerHTML={{ __html: wanneSketchSVG(spec, { small }) }} />
);

/** The large drawing: door and screen open on a tap (and with the mouse over it); reduced motion: no movement. */
function Stage({ spec }: { spec: WanneSpec }) {
  const [open, setOpen] = useState(0);
  const anim = useRef({ cur: 0, target: 0, raf: 0, last: 0 });
  const go = (to: number) => {
    const a = anim.current;
    a.target = to;
    if (typeof requestAnimationFrame !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) { a.cur = to; setOpen(to); return; }
    const step = (t: number) => {
      const dt = a.last ? Math.min(64, t - a.last) : 16;
      a.last = t;
      const d = a.target - a.cur;
      a.cur += Math.sign(d) * Math.min(Math.abs(d), dt / 650);
      setOpen(a.cur);
      if (a.cur !== a.target) a.raf = requestAnimationFrame(step); else { a.raf = 0; a.last = 0; }
    };
    if (!a.raf) a.raf = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current.raf), []);
  return (
    <button type="button" data-testid="wanne-stage" aria-label="Zeichnung: Tür und Aufsatz öffnen oder schließen" onClick={() => go(anim.current.target ? 0 : 1)}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") go(1); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") go(0); }}
      className="mx-auto w-full max-w-md cursor-pointer rounded-2xl border-0 bg-[#f5f5f7] p-2" dangerouslySetInnerHTML={{ __html: wanneSketchSVG(spec, { open: easeInOut(open) }) }} />
  );
}

function Chips({ row, st, onTap }: { row: ChipRow; st: WState; onTap: (k: ChipRow["key"], v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="wanne-chips">
      <span className="text-[0.9rem] font-semibold text-muted-foreground">{row.label}</span>
      {row.values.map(([v, label]) => (
        <button key={v} type="button" data-chip={row.key} data-val={v} aria-pressed={String(st[row.key]) === v} onClick={() => onTap(row.key, v)}
          className={cn("min-h-12 cursor-pointer rounded-full border-0 px-4 text-base", String(st[row.key]) === v ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{label}</button>
      ))}
    </div>
  );
}

function ProductCard({ c, on, onPick }: { c: Card; on: boolean; onPick: () => void }) {
  const p = c.item;
  return (
    <div className="grid content-start gap-1">
      <button type="button" data-testid="wanne-card" data-art={p.articleNumber} aria-pressed={on} onClick={onPick}
        className={cn("relative grid cursor-pointer content-start gap-2 rounded-2xl border-2 bg-card p-2.5 text-left text-foreground", on ? "border-primary" : "border-input")}>
        <Drawing spec={c.spec} />
        {on ? <span aria-hidden className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-primary font-bold text-primary-foreground">✓</span> : null}
        <span className="grid gap-1">
          {c.reco ? <span data-part="reco" className="w-fit rounded-full bg-accent-weak px-2.5 text-[0.85rem] font-semibold">Empfohlen</span> : null}
          <span data-part="art" className="text-[0.85rem] text-muted-foreground">{p.articleNumber}</span>
          <span data-part="title" className="text-lg font-bold">{c.title}</span>
          <span className="flex flex-wrap gap-1.5">{c.pills.map((x) => <span key={x} data-part="pill" className="rounded-full bg-muted px-2.5 py-0.5 text-[0.85rem]">{x}</span>)}</span>
          {c.notes.map((n, i) => <span key={i} data-part="note" className={cn("text-[0.9rem] font-medium", n.missing ? "text-destructive" : "text-primary")}>{n.text}</span>)}
          <span data-part="name" className="text-[0.9rem] text-muted-foreground" title="So steht es im Angebot">{c.name}</span>
          <span data-part="price" className="text-xl font-bold">{c.price}</span>
        </span>
      </button>
      {/* the product page in a new tab — beside the card, not in it (a link inside a button is not allowed) */}
      {[...c.notes.filter((n) => n.link?.url).map((n) => [n.link!.url!, `${n.link!.articleNumber} ansehen`] as const), ...(p.url ? [[p.url, `Bei ${p.urlLabel || "Händler"} ansehen`] as const] : [])].map(([href, label]) => (
        <a key={href + label} href={href} target="_blank" rel="noopener noreferrer" data-part="link" className="inline-flex min-h-12 items-center text-[0.95rem] font-semibold text-primary underline underline-offset-2">{label} ↗</a>
      ))}
    </div>
  );
}

function Results({ blocks, st, opt, onChip, onPick }: { blocks: Block[]; st: WState; opt: Fields; onChip: (k: ChipRow["key"], v: string) => void; onPick: (p: WItem) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "hint") return <p key={i} data-testid="wanne-hint" className="m-0 rounded-xl bg-muted p-3"><strong>Hinweis:</strong> {b.text}</p>;
        if (b.kind === "chips") return <Chips key={i} row={b.row} st={st} onTap={onChip} />;
        if (b.kind === "head") return <h4 key={i} data-testid="wanne-head" className="m-0 mt-2 text-base font-bold">{b.text}</h4>;
        if (b.kind === "note") return <p key={i} data-testid="wanne-note" className="m-0 text-[0.95rem] text-muted-foreground">{b.text}</p>;
        if (b.kind === "more") return (
          <details key={i} data-testid="wanne-more" open={b.open} className="grid gap-2 text-center">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center font-medium text-primary">{b.summary}</summary>
            {b.rows.map((r, j) => ("note" in r ? <p key={j} data-testid="wanne-note" className="m-0 text-[0.9rem] text-muted-foreground">{r.note}</p> : <Chips key={j} row={r} st={st} onTap={onChip} />))}
          </details>
        );
        return (
          <div key={i} className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {b.cards.length ? b.cards.map((c) => <ProductCard key={c.item.articleNumber} c={c} on={selectedId(opt, c.item.type) === c.item.articleNumber} onPick={() => onPick(c.item)} />)
              : <p data-testid="wanne-empty" className="m-0 text-muted-foreground">{b.empty}</p>}
          </div>
        );
      })}
    </>
  );
}

export function WannePanel({ opt }: { opt: Fields }) {
  const catalog = useQuery(catalogQuery);
  const remembered = useOfferStore((x) => x.scratch[KEY] as WState | undefined);
  const items = catalog.data ?? [];
  const st: WState = remembered ?? (catalog.data ? fromSelection(items, opt) : {});
  const setSt = (next: WState) => useOfferStore.getState().remember(KEY, next);
  if (catalog.isError) return <p className="m-0 text-muted-foreground" role="status">Katalog konnte nicht geladen werden.</p>;
  if (!catalog.data) return <p className="m-0 text-muted-foreground" role="status">Katalog wird geladen …</p>;
  const step = stepOf(items, st), crumbs = crumbsOf(st), summary = summaryOf(items, opt);
  const onAnswer = (set: string) => {
    const [k, v] = set.split(":") as [keyof WState, string];
    const r = answer(opt, st, k, v);
    setSt(r.st);
    if (r.opt !== opt) act((s) => ({ ...s, opt: r.opt }));
  };
  return (
    <div className="grid min-w-0 gap-4" data-testid="wanne">
      <Stage spec={stageSpec(items, opt, st)} />
      <div className="flex min-h-12 flex-wrap items-center justify-center gap-2">
        {crumbs.map(([k, label]) => (
          <button key={k} type="button" data-crumb={k} title="Ändern" onClick={() => setSt(clearFrom(st, k))} className="min-h-12 cursor-pointer rounded-full border-0 bg-primary px-4 text-base font-medium text-primary-foreground">
            <span data-part="label">{label}</span> <span aria-hidden>×</span>
          </button>
        ))}
        {crumbs.length ? <Button variant="ghost" onClick={() => setSt({})}>Neu beginnen</Button> : null}
      </div>
      {step ? (
        <div className="grid gap-3">
          <p data-testid="wanne-question" className="m-0 text-center text-xl font-bold">{step.question}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
            {step.tiles.map((t) => (
              <button key={t.set} type="button" data-testid="wanne-tile" data-set={t.set} disabled={t.off} onClick={() => onAnswer(t.set)}
                className="grid cursor-pointer content-start gap-1 rounded-2xl border-2 border-input bg-card p-2.5 text-center text-foreground disabled:cursor-default disabled:opacity-40">
                <Drawing spec={t.spec} />
                <b data-part="title" className="text-base">{t.title}</b>
                <small data-part="sub" className="text-[0.9rem] text-muted-foreground">{t.sub}</small>
              </button>
            ))}
          </div>
          {step.only ? <div className="flex justify-center"><Button variant="ghost" onClick={() => setSt({ mode: "only" })}>Nur einen Wannenaufsatz wählen (ohne Wanne)</Button></div> : null}
        </div>
      ) : null}
      <Results blocks={resultsOf(items, opt, st)} st={st} opt={opt} onChip={(k, v) => setSt(chipTapped(st, k, v))} onPick={(p) => act((s) => ({ ...s, opt: applySelection(items, s.opt, p) }))} />
      <div data-testid="wanne-summary" className="rounded-xl bg-muted p-3 text-[0.95rem]">
        {summary ? (
          <>
            {summary.rows.map(([name, price], i) => <div key={i}><strong>{name}</strong> — {price}</div>)}
            <div className="mt-1.5"><strong>Summe: {summary.total}</strong></div>
          </>
        ) : <span className="text-muted-foreground">Noch nichts ausgewählt.</span>}
      </div>
    </div>
  );
}
