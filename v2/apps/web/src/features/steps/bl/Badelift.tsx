// Badelift (step `bl`): main product, accessories with quantity, free items, note and sketch — the
// fields, texts and pictures of today's page (rules.ts; test/badelift.test.tsx replays today's
// recordings). The page is written whole on every change, as today's buildPayload does.
import { Check as Tick, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardTitle, IMG, Input, cn } from "../../../shared/ui/index.js";
import { SketchPad, type Sketch } from "../../../shared/ui/sketch-pad.js";
import { toast } from "../../../shared/ui/toaster.js";
import { useOfferStore } from "../../offer/index.js";
import { ADD_WARNING, PREVIEW, PRODUCTS, addRow, afterOpening, editRow, formOf, qtyOpen, removeRow, sectionOf, setQty, toggle, type Form, type Product, type Row } from "./rules.js";

type Fields = Record<string, unknown>;
const useBl = () => useOfferStore((s) => ((s.offer as Record<string, Fields> | null)?.bl ?? {}) as Fields);
const str = (v: unknown) => (v == null ? "" : String(v));
const sketchOf = (bl: Fields): Sketch => { const s = (bl.sketch && typeof bl.sketch === "object" ? bl.sketch : {}) as Partial<Sketch>; return { json: str(s.json), dataUrl: str(s.dataUrl) }; };

/** one change of the page: what is typed is remembered, the section is written whole */
function write(change: (f: Form, bl: Fields) => { form?: Form; note?: string; sketch?: Sketch }) {
  const store = useOfferStore.getState(), bl = ((store.offer as Record<string, Fields> | null)?.bl ?? {}) as Fields;
  const before = formOf(bl, store.scratch.blForm), next = change(before, bl), form = next.form ?? before;
  // the first change on this page of an opened offer (the store's `load` marks an opened offer; a Badelift has no Duschwanne step to set it otherwise)
  const firstAfterOpening = store.scratch.blForm === undefined && store.scratch.dwLineDefaulted === true;
  store.remember("blForm", form);
  const section = sectionOf(form, next.note ?? str(bl.blNote), next.sketch ?? (firstAfterOpening ? afterOpening(sketchOf(bl)) : sketchOf(bl)));
  const gone = Object.fromEntries(Object.keys(bl).filter((k) => !(k in section)).map((k) => [k, undefined]));
  store.patch("bl" as never, { ...gone, ...section } as never);
}

function ProductCard({ p, f }: { p: Product; f: Form }) {
  const on = !!f.on[p.id];
  return (
    <div data-testid="bl-card" data-id={p.id} className={cn("grid content-start gap-2 rounded-lg border-2 bg-card p-3", on ? "border-primary bg-accent-weak" : "border-control")}>
      <label className="relative grid cursor-pointer justify-items-center gap-2 rounded-md text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input type="checkbox" className="sr-only" aria-label={p.value} checked={on} onChange={() => write((x) => ({ form: toggle(x, p.id) }))} />
        <img src={p.img} alt={p.value} loading="lazy" className={cn(IMG.tile, "object-contain")} />
        <span className="grid gap-0.5"><strong data-part="title">{p.title}</strong><span data-part="sub" className="text-[0.9rem] text-muted-foreground">{p.sub}</span></span>
        {on ? <span aria-hidden data-part="tick" className="absolute right-0 top-0 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-4" /></span> : null}
      </label>
      <label className="flex items-center justify-between gap-3 text-[0.95rem] font-semibold">Menge
        <span className="w-24 shrink-0"><Input type="number" aria-label={`Menge ${p.title}`} inputMode="numeric" min={1} step={1} disabled={!qtyOpen(f, p.id)} className="!border-control text-center tabular-nums" value={f.qty[p.id] ?? ""} onChange={(e) => write((x) => ({ form: setQty(x, p.id, e.target.value) }))} /></span>
      </label>
    </div>
  );
}

function FreeItems({ f }: { f: Form }) {
  const cell = (i: number, field: keyof Row, label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <label className="grid min-w-0 gap-1 text-[0.95rem] font-semibold">{label}
      <Input data-field={field} className="min-w-0 !border-control" placeholder={placeholder} value={f.rows[i]![field]} onChange={(e) => write((x) => ({ form: editRow(x, i, field, e.target.value) }))} {...more} />
    </label>
  );
  const add = () => write((x) => { const next = addRow(x); if (!next) toast.warning("Hinweis", { description: ADD_WARNING }); return { form: next ?? x }; });
  return (
    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" aria-describedby="bl-quickadd-help" data-testid="bl-free">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-3 p-0 font-semibold">Freier Posten (Quick Add)
        <Button variant="outline" size="icon" className="!border-control" aria-label="Weitere Position hinzufügen" onClick={add}><Plus aria-hidden /></Button>
      </legend>
      {f.rows.map((_, i) => (
        <div key={i} data-testid="bl-row" className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-lg border-2 border-control p-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {cell(i, "name", "Bezeichnung", "z. B. Sonderzubehör", { type: "text" })}
            {cell(i, "price", "Preis (netto)", "z. B. 199,00", { type: "text", inputMode: "decimal" })}
            {cell(i, "qty", "Menge", "1", { type: "number", inputMode: "numeric", min: 1, step: 1 })}
            {cell(i, "id", "Artikel-ID", "z. B. BL-123", { type: "text" })}
          </div>
          <Button variant="outline" size="icon" className="!border-control" aria-label="Diese Zeile entfernen" onClick={() => write((x) => ({ form: removeRow(x, i) }))}><Trash2 aria-hidden /></Button>
        </div>
      ))}
      <small id="bl-quickadd-help" className="text-muted-foreground">Neue Zeile ist nur möglich, wenn <em>Bezeichnung</em>, <em>Preis</em> und <em>Artikel-ID</em> gefüllt sind. Letzte Zeile: Löschen leert alle 4 Felder.</small>
    </fieldset>
  );
}

export function Badelift() {
  const bl = useBl();
  const f = formOf(bl, useOfferStore((s) => s.scratch.blForm));
  const main = PRODUCTS.filter((p) => p.main), more = PRODUCTS.filter((p) => !p.main);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4" data-testid="bl-step">
      <Card aria-labelledby="bl-title" className="min-w-0 grid-cols-1">
        <CardTitle id="bl-title">Badelift — Bestandsaufnahme</CardTitle>
        <section className="grid min-w-0 grid-cols-1 gap-3" aria-labelledby="bl-main" data-testid="bl-section">
          <h3 id="bl-main" className="m-0 text-[1.05rem] font-semibold">1. Hauptprodukt</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)]">
            {main.map((p) => <ProductCard key={p.id} p={p} f={f} />)}
            <aside aria-label="Großansicht Hauptprodukt" className="grid place-items-center rounded-lg border-2 border-border bg-card p-3">
              <img src={PREVIEW.src} alt={PREVIEW.alt} loading="lazy" data-part="preview" className={cn(IMG.product, "max-w-full object-contain")} />
            </aside>
          </div>
        </section>
        <section className="grid min-w-0 grid-cols-1 gap-3" aria-labelledby="bl-more" data-testid="bl-section">
          <h3 id="bl-more" className="m-0 text-[1.05rem] font-semibold">2. Optionales Zubehör</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(13rem,100%),1fr))] gap-3">{more.map((p) => <ProductCard key={p.id} p={p} f={f} />)}</div>
        </section>
      </Card>
      <Card aria-label="Freier Posten, Hinweise und Skizze" className="min-w-0 grid-cols-1">
        <FreeItems f={f} />
        <label htmlFor="blNote" className="grid gap-1.5 font-semibold">Hinweise / Notizen
          <textarea id="blNote" rows={4} placeholder="Zusätzliche Hinweise zum Badelift oder Zubehör" value={str(bl.blNote)} onChange={(e) => write(() => ({ note: e.target.value }))}
            className="w-full rounded-lg border-2 border-control bg-card px-3.5 py-2.5 font-normal text-foreground placeholder:text-muted-foreground" />
        </label>
        {/* the pad's colour row does not wrap: on a phone it scrolls inside its own box, the page never sideways */}
        <div className="min-w-0 overflow-x-auto"><SketchPad value={sketchOf(bl)} onChange={(next) => write(() => ({ sketch: next }))} /></div>
      </Card>
    </div>
  );
}
