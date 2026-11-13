// Duschabtrennung (Badumbau; ADR 026, phase 4): the switch and the cards — one enclosure each,
// from VIGOUR or Badolux, configured step by step (structure → finish → sizes), with the widening
// profile, the matching quarter-circle tray and "Ihre Auswahl". The stored fields are exactly
// today's (test/duschabtrennung.test.tsx compares with what today's UI stores and shows for the
// same inputs). The rules are engine.ts (the wizard), wizard.ts (one card) and rules.ts (the offer).
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, Card as Panel, CardTitle, Input, Switch, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import * as w from "./engine.js";
import type { Model, State } from "./engine.js";
import { SUPPLIERS, addCard, cardsOf, fieldsOf, isOn, modelKey, removeCard, switched, type Card, type Supplier } from "./rules.js";
import { sketchSVG, specFor } from "./sketch.js";
import * as z from "./wizard.js";

type Fields = Record<string, unknown>;
const daNow = (): Fields => ((useOfferStore.getState().offer ?? {}) as Record<string, Fields>).duschabtrennung ?? {};
const useDa = () => useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschabtrennung as Fields | undefined) ?? {};
const ROW = "flex min-h-12 items-center gap-3 rounded-lg border-2 border-input bg-card px-4 py-2";
const TILE = "grid cursor-pointer content-start justify-items-center gap-1.5 rounded-lg border-2 border-input bg-card p-2 text-center text-foreground [overflow-wrap:anywhere] hover:border-primary";

/** the catalogue of a supplier; the VIGOUR one is large, so it is fetched once and kept */
const loadModel = (key: string, signal: AbortSignal): Promise<Model> =>
  (key === "badolux-v1" ? fetch("/configurator/badolux-model-v1.json", { signal, credentials: "include" }).then((r) => r.json()) : call("daModel", { params: { supplier: key }, signal })) as Promise<Model>;

function Stock({ article }: { article: Parameters<typeof z.stockOf>[0] }) {
  const s = z.stockOf(article);
  if (!s) return null;
  return <span data-part="stock" title={article.stockText ?? undefined} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.85rem] font-semibold", s.inStock ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}><span>{s.qty}</span>{s.text}</span>;
}

/** The pictures of the configuration so far: one large, the others to tap. */
function Pictures({ images, label }: { images: { src: string; label: string }[]; label: string }) {
  const [at, setAt] = useState(0);
  const main = images[Math.min(at, images.length - 1)]!;
  return (
    <figure className="m-0 grid justify-items-center gap-2" data-testid="da-preview">
      <img src={main.src} alt={main.label} loading="lazy" className="max-h-64 max-w-full rounded-lg object-contain" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      {images.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {images.slice(0, 6).map((im, i) => (
            <button key={im.src} type="button" aria-label={`Bild ${i + 1}: ${im.label}`} aria-pressed={i === at} onClick={() => setAt(i)} className={cn("size-12 cursor-pointer overflow-hidden rounded border-2 bg-card p-0", i === at ? "border-primary" : "border-input")}>
              <img src={im.src} alt="" loading="lazy" className="size-full object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
            </button>
          ))}
        </div>
      ) : null}
      <figcaption data-part="preview-label" className="text-[0.9rem] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** One enclosure: the answered questions, the open step, the sizes, the extras and "Ihre Auswahl". */
function Wizard({ model, state, onChange }: { model: Model; state: State; onChange: (next: State) => void }) {
  const [open, setOpen] = useState(false); // the drawing's door
  const set = (next: State) => onChange(z.autoSize(model, next));
  const step = w.currentStep(model, state);
  const leaf = w.resolvedLeaf(model, state);
  const drawings = model.supplier === "BADOLUX" && model.params.some((p) => p.id === "Einbausituation");
  const spec = drawings ? specFor(state.selections, state.sizes) : null;
  const images = z.previewImages(model, state), info = z.products(model, state);
  const rows = z.answeredRows(model, state);
  const asking = step.phase === "structure" || step.phase === "finish";
  const title = asking ? (step.paramId ? z.paramLabel(model, state, step.paramId) : "Konfiguration") : leaf ? "Maße festlegen" : "Konfiguration";
  const result = z.resolved(model, state);
  const extras = z.extrasFor(model), picked = Array.isArray(state.extras) ? state.extras : [];
  const trays = z.traysFor(model, state), width = z.doorWidth(model, state);
  const seg = (on: boolean, sonder = false) => cn("min-h-12 min-w-14 cursor-pointer rounded-lg border-2 px-3 font-semibold", on ? "border-primary bg-accent-weak" : "border-input bg-card", sonder && "italic");
  return (
    <div className="grid gap-4">
      {rows.length ? (
        <div className="grid gap-2" data-testid="da-answered">
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => set(z.reopen(model, state, r.id))} className={cn(ROW, "cursor-pointer justify-between text-left text-foreground hover:border-primary")}>
              <span data-part="k" className="text-muted-foreground">{r.label}</span>
              <span className="flex items-center gap-2"><span data-part="v" className="font-semibold">{r.values.join(" · ")}</span><ChevronRight aria-hidden className="size-4 shrink-0" /></span>
            </button>
          ))}
        </div>
      ) : null}
      {spec ? (
        <div className="grid gap-1" data-testid="da-sketch">
          {/* our own SVG markup (sketch.ts) */}
          <button type="button" aria-label="Zeichnung: Tür öffnen oder schließen" aria-pressed={open} disabled={!spec.tuer} onClick={() => setOpen(!open)} className="mx-auto w-full max-w-lg cursor-pointer rounded-lg border-0 bg-[#f7f6f4] p-2 disabled:cursor-default" dangerouslySetInnerHTML={{ __html: sketchSVG(spec, { open: open ? 1 : 0 }) }} />
          {spec.tuer ? <p className="m-0 text-center text-[0.9rem] text-muted-foreground">Antippen zeigt, wie die Tür öffnet</p> : null}
        </div>
      ) : null}
      {images.length ? <Pictures images={images} label={z.leafPreview(model, state)?.label ?? images[0]!.label} /> : null}
      {info.length ? (
        <details className="rounded-lg border-2 border-border p-3" data-testid="da-info">
          <summary className="min-h-8 cursor-pointer font-semibold">Produktinfo: {info.map((p) => p.name).join(" + ")}</summary>
          {info.map((p) => (
            <div key={p.name} className="grid gap-2 pt-2">
              {info.length > 1 ? <strong>{p.name}</strong> : null}
              {(p.description ?? []).map((t) => <p key={t} className="m-0">{t}</p>)}
              {p.features?.length ? <ul className="m-0 grid gap-1 pl-5">{p.features.map((f) => <li key={f}>{f}</li>)}</ul> : null}
            </div>
          ))}
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 text-[1.1rem] font-semibold" data-testid="da-step">{title}</h4>
        {z.canGoBack(model, state) ? <Button variant="outline" onClick={() => set(z.goBack(model, state))}><ChevronLeft aria-hidden />Zurück</Button> : null}
      </div>
      {asking && step.paramId ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="da-options">
          {w.availableOptions(model, state, step.paramId).map((val) => {
            const [name, sub] = drawings ? String(val.label).split(" — ") : [val.label];
            const src = !drawings && z.imageUrl(model, val.imageId);
            return (
              <button key={val.value} type="button" data-value={val.value} onClick={() => { setOpen(false); set(z.answer(model, state, step.paramId!, val.value)); }} className={TILE}>
                {drawings ? <span aria-hidden className="w-full max-w-40" dangerouslySetInnerHTML={{ __html: sketchSVG(specFor({ ...state.selections, [step.paramId!]: val.value }, state.sizes), { small: true, open: step.paramId === "Einbausituation" ? 0 : 0.45 }) }} />
                  : src ? <img src={src} alt="" loading="lazy" className="h-24 max-w-full rounded object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                <span data-part="title" className="font-semibold">{name}</span>
                {sub ? <span data-part="sub" className="text-[0.9rem] text-muted-foreground">{sub}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {!asking && leaf ? (
        <>
          {leaf.components.map((c) => {
            const cur = state.sizes[c.key] ?? {};
            const oneHeight = c.hoehe.length === 1 ? c.hoehe[0]! : null;
            return (
              <fieldset key={c.key} className="m-0 grid min-w-0 gap-2 border-0 p-0" data-testid="da-part">
                <legend className="mb-1.5 p-0 font-semibold">{c.label}</legend>
                <div className={cn(ROW, "flex-wrap")} data-part="row">
                  <span data-part="k" className="min-w-28">{model.sizeAxisLabel || "Breite (mm)"}</span>
                  <span className="flex flex-wrap gap-2">
                    {c.breite.map((n) => { const on = !cur.sondermass && cur.width === n; return <button key={String(n)} type="button" aria-pressed={on} onClick={() => set(w.setComponentSize(state, c.key, n, oneHeight != null ? oneHeight : cur.sondermass ? null : cur.height ?? null))} className={seg(on)}>{String(n)}</button>; })}
                    {c.sondermass.map((sm) => { const on = cur.sondermass === sm; return <button key={sm} type="button" aria-pressed={on} onClick={() => set(w.setComponentSondermass(state, c.key, sm))} className={seg(on, true)}>{sm}</button>; })}
                  </span>
                </div>
                {oneHeight == null && !cur.sondermass && c.hoehe.length ? (
                  <div className={cn(ROW, "flex-wrap")} data-part="row">
                    <span data-part="k" className="min-w-28">Höhe (mm)</span>
                    <span className="flex flex-wrap gap-2">{c.hoehe.map((h) => { const on = cur.height === h; return <button key={String(h)} type="button" aria-pressed={on} onClick={() => set(w.setComponentSize(state, c.key, cur.width ?? null, h))} className={seg(on)}>{String(h)}</button>; })}</span>
                  </div>
                ) : null}
              </fieldset>
            );
          })}
          {extras.length ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="mb-1.5 p-0 font-semibold">Verbreiterungsprofil (optional)</legend>
              {extras.map((e) => {
                const on = picked.includes(e.articleNumber), qty = z.extraQty(state, e.articleNumber);
                return (
                  <div key={e.articleNumber} data-testid="da-extra" className={cn(ROW, "flex-wrap justify-between has-[:checked]:border-primary")}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={on} onChange={() => set(z.toggleExtra(state, e.articleNumber))} />
                      <img src={`/assets/Verbreiterungsprofil/${e.image}`} alt="" loading="lazy" className="size-10 shrink-0 rounded object-contain" onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }} />
                      <span className="grid"><span data-part="title">{e.name}</span><small data-part="sub" className="text-muted-foreground">{`${e.articleNumber} · ${e.finishText} · ${z.euro(e.net)}`}</small></span>
                    </label>
                    {on ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="icon" aria-label={`Menge ${e.name}: weniger`} onClick={() => set(z.setExtraQty(state, e.articleNumber, qty - 1))}><Minus aria-hidden /></Button>
                        <span className="w-16"><Input type="number" min={1} step={1} inputMode="numeric" aria-label={`Menge ${e.name}`} value={String(qty)} onChange={(ev) => set(z.setExtraQty(state, e.articleNumber, Number(ev.target.value)))} className="px-2 text-center" /></span>
                        <Button variant="outline" size="icon" aria-label={`Menge ${e.name}: mehr`} onClick={() => set(z.setExtraQty(state, e.articleNumber, qty + 1))}><Plus aria-hidden /></Button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          {trays.length && width != null ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="mb-1.5 p-0 font-semibold">Passende Duschwanne (optional)</legend>
              {trays.map((d) => {
                const on = state.duschwanne === d.articleNumber;
                return (
                  <button key={d.articleNumber} type="button" data-testid="da-tray" aria-pressed={on} onClick={() => set(z.pickTray(state, d.articleNumber))} className={cn(ROW, "cursor-pointer flex-wrap justify-between text-left text-foreground", on && "border-primary bg-accent-weak")}>
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <img src={`/assets/${d.image}`} alt="" loading="lazy" className="size-10 shrink-0 rounded object-contain" onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }} />
                      <span className="grid"><span data-part="title">{z.trayName(d, width)}</span><small data-part="sub" className="text-muted-foreground">{`${d.articleNumber} · ${z.euro(d.net)}`}</small></span>
                    </span>
                    <Stock article={d} />
                  </button>
                );
              })}
            </fieldset>
          ) : null}
          {step.phase === "done" ? <div><Button variant="outline" onClick={() => set(z.start(model))}>Neu konfigurieren</Button></div> : null}
        </>
      ) : null}

      <section className="grid gap-2 rounded-lg border-2 border-border p-3" data-testid="da-summary" aria-label="Ihre Auswahl">
        <strong>Ihre Auswahl</strong>
        {result ? (
          <>
            {result.lines.map((l) => (
              <div key={l.key} data-testid="da-line" className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                <span className="grid min-w-0 flex-1"><span data-part="title">{`${(l.qty ?? 1) > 1 ? `${l.qty} × ` : ""}${l.article.displayName || l.component}`}</span><small data-part="sub" className="text-muted-foreground">{z.lineMeta(l.article)}</small></span>
                <Stock article={l.article} />
                <span data-part="price" className="font-semibold tabular-nums">{z.euro(l.article.net * (l.qty || 1))}</span>
                {l.article.sourceUrl ? <a href={l.article.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Beim Lieferanten öffnen" title="Beim Lieferanten öffnen" className="grid size-12 place-items-center">↗</a> : null}
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-border pt-2 font-bold" data-part="total"><span>Gesamt (netto)</span><span>{z.euro(result.net)}</span></div>
          </>
        ) : <p className="m-0 text-muted-foreground" data-part="hint">Konfiguration noch nicht vollständig …</p>}
      </section>
    </div>
  );
}

export function Duschabtrennung() {
  const da = useDa();
  const on = isOn(da);
  const remembered = useOfferStore((s) => s.scratch.daCards) as Card[] | undefined;
  const cards = remembered ?? cardsOf(da);
  const keys = [...new Set(cards.map(modelKey))];
  const queries = useQueries({ queries: keys.map((key) => ({ queryKey: ["da-model", key], staleTime: Infinity, gcTime: Infinity, retry: false, enabled: on, queryFn: ({ signal }: { signal: AbortSignal }) => loadModel(key, signal) })) });
  const models = Object.fromEntries(keys.map((k, i) => [k, queries[i]?.data])) as Record<string, Model | undefined>;
  const ready = keys.every((k) => models[k]);
  /** a card as the wizard sees it: questions with one answer answered, parts with one size sized */
  const settled = (c: Card, model: Model): State => z.autoSize(model, z.start(model, c.state));
  /** the cards changed: remembered while the offer is open … */
  const write = (next: Card[]) => useOfferStore.getState().remember("daCards", next);
  // … and the offer gets their lines and configuration once every card's catalogue is there
  // (a card that changed its supplier waits for the other catalogue). Cards nobody touched write nothing.
  useEffect(() => {
    if (!remembered || !remembered.every((c) => models[modelKey(c)])) return;
    const now = daNow();
    const fields = fieldsOf(now, remembered.map((c) => { const model = models[modelKey(c)]!; return { ...c, model, state: settled(c, model) }; }), isOn(now));
    if (JSON.stringify([fields.quickAdd, fields.configurator ?? null]) !== JSON.stringify([now.quickAdd ?? [], now.configurator ?? null])) useOfferStore.getState().patch("duschabtrennung" as never, fields as never);
  });
  const toggle = (to: boolean) => useOfferStore.getState().patch("duschabtrennung" as never, switched(daNow(), to) as never);
  return (
    <Panel aria-labelledby="da-title">
      <CardTitle id="da-title">Duschabtrennung</CardTitle>
      <p className="m-0 text-muted-foreground">Duschabtrennung konfigurieren. Die abgeschlossene Konfiguration wird mit Netto-Preisen automatisch dem Angebot hinzugefügt.</p>
      <div className="flex items-center gap-3">
        <Switch id="da-on" checked={on} onChange={toggle} label="Duschabtrennung" />
        <label htmlFor="da-on" className="grid cursor-pointer"><strong>Duschabtrennung</strong><small className="text-muted-foreground">Konfigurierte Duschabtrennungen im Angebot. Aus: nicht berechnet, die Auswahl bleibt erhalten.</small></label>
      </div>
      {on ? (
        <>
          {cards.map((c, i) => {
            const model = models[modelKey(c)], failed = queries[keys.indexOf(modelKey(c))]?.isError;
            return (
              <section key={c.id} data-testid="da-card" data-supplier={c.supplier} className="grid gap-4 rounded-lg border-2 border-border p-3" aria-label={`Duschabtrennung ${i + 1}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-[1.15rem] font-semibold" data-part="card-title">Duschabtrennung {i + 1}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-2" role="radiogroup" aria-label={`Hersteller Duschabtrennung ${i + 1}`}>
                      {SUPPLIERS.map((s) => <button key={s.value} type="button" role="radio" aria-checked={c.supplier === s.value} onClick={() => { if (c.supplier !== s.value) write(cards.map((x) => (x.id === c.id ? { ...x, supplier: s.value as Supplier, state: {} } : x))); }} className={cn("min-h-12 cursor-pointer rounded-lg border-2 px-4 font-semibold", c.supplier === s.value ? "border-primary bg-accent-weak" : "border-input bg-card")}>{s.label}</button>)}
                    </div>
                    {cards.length > 1 ? <Button variant="outline" aria-label={`Duschabtrennung ${i + 1} entfernen`} onClick={() => write(removeCard(cards, c.id))}>Entfernen</Button> : null}
                  </div>
                </div>
                {model && ready ? <Wizard model={model} state={settled(c, model)} onChange={(next) => write(cards.map((x) => (x.id === c.id ? { ...x, state: next } : x)))} />
                  : <p className="m-0 text-muted-foreground" role="status">{failed ? "Konfigurator konnte nicht geladen werden." : "Konfigurator wird geladen …"}</p>}
              </section>
            );
          })}
          <div><Button variant="outline" onClick={() => write(addCard(cards))}><Plus aria-hidden />Weitere Duschabtrennung hinzufügen</Button></div>
        </>
      ) : null}
    </Panel>
  );
}
