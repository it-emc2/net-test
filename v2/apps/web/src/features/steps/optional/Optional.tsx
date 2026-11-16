// Optionale Produkte (Badumbau; ADR 026, phase 4): the category cards with their counts, one
// dialog per category (products with quantities, the question of the shower system, accessories
// that come by themselves, free items) and the bar "Ausgewählte Optionen". The stored fields are
// exactly today's (test/optional.test.tsx compares with what today's UI stores and shows for the
// same inputs). The rules are rules.ts; the products are catalog.ts. Not rebuilt yet: the
// categories "Wanne" and "WC" — their cards lead to today's view.
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useParams } from "react-router";
import { Button, Card, CardTitle, Choices, Input, Label, cn } from "../../../shared/ui/index.js";
import { LegacyLink, useOfferStore } from "../../offer/index.js";
import { optChanges } from "../arbeiten/rules.js";
import { CATEGORIES, type Category, type Product } from "./catalog.js";
import {
  BASINS, FREE_BASIN, NO_UI, addRow, basinOf, cardOn, changedFields, chips, closeCard, count, editBasin, editRow, fitsMount, hasQuantity, isLocked, isOn, leaveQty,
  openCard, qtyLabel, qtyOf, removeChip, removeRow, rowsOf, searchProducts, setMount, setQty, toggleProduct, type FreeBasin, type Mount, type Row, type State, type Ui,
} from "./rules.js";

type Fields = Record<string, unknown>;
const NONE: Fields = {};
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** the stored section and what the page remembers beside it */
export const optionalState = (): State => ({ opt: offerNow().optional ?? NONE, ui: (useOfferStore.getState().scratch.optional as Ui | undefined) ?? NO_UI });
/** one change of the offer (with the tasks and the work time that follow) and of what is remembered */
function act(change: (s: State) => State): void {
  const before = optionalState(), next = change(before);
  const fields = changedFields(before.opt, next.opt);
  if (Object.keys(fields).length) useOfferStore.getState().patchAll(optChanges(offerNow(), fields));
  if (next.ui !== before.ui) useOfferStore.getState().remember("optional", next.ui);
}
/** categories that are still edited in today's view */
const NOT_BUILT: ReadonlySet<string> = new Set(["WANNE", "WC"]);
const MOUNTS = [{ value: "versetzt", label: "Versetzt (seitlich/tiefer) – flexibler Schlauch nötig" }, { value: "direkt", label: "Direkt darunter – feste Verbindung" }] as const;
const SEARCH_FROM = 8; // products, as today's search
const H4 = "m-0 text-base font-bold";
const MUTED = "m-0 text-[0.95rem] text-muted-foreground";

/** One product: a tile to tick, and its quantity while it is ticked. */
function Tile({ p, opt, children }: { p: Product; opt: Fields; children?: ReactNode }) {
  const on = isOn(opt, p.id), locked = isLocked(opt, p.id);
  return (
    <div data-testid="opt-tile" data-id={p.id} className="grid content-start gap-2">
      <label className={cn("grid min-h-12 cursor-pointer grid-cols-[auto_1fr] items-center gap-3 rounded-lg border-2 bg-card p-2", on ? "border-primary bg-accent-weak font-bold" : "border-input", locked && "cursor-default opacity-50 grayscale")}>
        <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={on} disabled={locked} onChange={() => act((s) => toggleProduct(s, p.id))} />
        <span className="grid min-w-0 grid-cols-[4rem_1fr] items-center gap-3">
          <img src={p.img} alt="" loading="lazy" className="size-16 rounded object-contain" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          <span data-part="name" className="min-w-0 break-words text-[0.95rem]">{p.name}</span>
        </span>
      </label>
      {p.tags ? <div className="flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-[0.8rem]">{t}</span>)}</div> : null}
      {on && children}
      {on && hasQuantity(p.id) ? (
        <div className="grid max-w-56 gap-1">
          {/* today's free wash basin has no label on its quantity; here it says "Menge" */}
          {qtyLabel(opt, p) ? <Label htmlFor={`qty_${p.id}`} data-part="qty-label">{qtyLabel(opt, p)}</Label> : <Label htmlFor={`qty_${p.id}`}>Menge</Label>}
          <Input id={`qty_${p.id}`} type="number" inputMode="numeric" min={p.id === FREE_BASIN ? 1 : 0} step={1} placeholder={p.id === FREE_BASIN ? "1" : "0"} value={qtyOf(opt, p.id)} onChange={(e) => act((s) => setQty(s, p.id, e.target.value))} />
        </div>
      ) : null}
    </div>
  );
}
const Tiles = ({ products, opt, extra }: { products: readonly Product[]; opt: Fields; extra?: (p: Product) => ReactNode }) => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{products.map((p) => <Tile key={p.id} p={p} opt={opt}>{extra?.(p)}</Tile>)}</div>
);
/** A long list of products gets a search (today only the WC list has one; REHA has 45 products). */
function SearchableTiles({ products, opt }: { products: readonly Product[]; opt: Fields }) {
  const [query, setQuery] = useState("");
  const found = searchProducts(products, query);
  if (products.length < SEARCH_FROM) return <Tiles products={products} opt={opt} />;
  return (
    <>
      <Input type="search" aria-label="Produkte filtern" placeholder={`Suchen… (${products.length} Produkte)`} value={query} onChange={(e) => setQuery(e.target.value)} />
      {found.length ? <Tiles products={found} opt={opt} /> : <p className={MUTED} role="status">Keine Produkte gefunden.</p>}
    </>
  );
}

/** name, article number and price of the free wash basin (its quantity is the tile's) */
function FreeBasinFields({ basin }: { basin: FreeBasin }) {
  const field = (name: keyof FreeBasin, placeholder: string, more: Record<string, string> = {}) => (
    <Input aria-label={placeholder} placeholder={placeholder} data-field={name} value={basin[name]} onChange={(e) => act((s) => editBasin(s, name, e.target.value))} {...more} />
  );
  return <div className="grid gap-2" data-testid="opt-free-basin">{field("name", "Bezeichnung")}{field("artikel", "Artikelnr.")}{field("price", "Preis €", { inputMode: "decimal" })}</div>;
}

/** The free items: rows of name, net price, quantity and article number. */
function FreeItems({ rows }: { rows: Row[] }) {
  const box = useRef<HTMLFieldSetElement>(null);
  const add = () => {
    let missing: keyof Row | undefined;
    act((s) => { const r = addRow(s); missing = r.missing; return r.state; });
    if (missing) box.current?.querySelector<HTMLInputElement>(`[data-testid="opt-row"]:last-of-type [data-field="${missing}"]`)?.focus(); // the field that is still empty
  };
  const cell = (i: number, name: keyof Row, label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <label className="grid gap-1 text-[0.95rem] font-semibold">{label}
      <Input data-field={name} placeholder={placeholder} value={rows[i]![name]} onChange={(e) => act((s) => editRow(s, i, name, e.target.value))} {...more} />
    </label>
  );
  return (
    <fieldset ref={box} className="m-0 grid min-w-0 gap-3 border-0 p-0" aria-describedby="opt-sonder-help">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-3 p-0 font-semibold">Freier Posten
        <Button variant="outline" size="icon" aria-label="Weitere Position hinzufügen" onClick={add}><Plus aria-hidden /></Button>
      </legend>
      {rows.map((_, i) => (
        <div key={i} data-testid="opt-row" className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border-2 border-input p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {cell(i, "name", "Bezeichnung", "z. B. Sonderzubehör")}
            {cell(i, "price", "Preis (netto)", "z. B. 199,00", { inputMode: "decimal" })}
            {cell(i, "qty", "Menge", "1", { type: "number", inputMode: "numeric", min: 1, step: 1, onBlur: () => act((s) => leaveQty(s, i)) })}
            {cell(i, "id", "Artikel-ID", "z. B. OPT-123")}
          </div>
          <Button variant="outline" size="icon" aria-label="Diese Zeile entfernen" onClick={() => act((s) => removeRow(s, i))}><Trash2 aria-hidden /></Button>
        </div>
      ))}
      <small id="opt-sonder-help" className="text-muted-foreground">Neue Zeile ist nur möglich, wenn <em>Bezeichnung</em>, <em>Preis</em> und <em>Artikel-ID</em> gefüllt sind. Letzte Zeile: Löschen leert alle 4 Felder.</small>
    </fieldset>
  );
}

/** What the dialog of one category shows. */
function Panel({ cat, s, dealId }: { cat: Category; s: State; dealId: string }) {
  const { opt } = s;
  const main = cat.products.filter((p) => !p.block), parts = cat.products.filter((p) => p.block);
  if (NOT_BUILT.has(cat.id)) return (
    <div className="grid gap-3">
      <p className="m-0">Diese Kategorie wird noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
      <LegacyLink dealId={dealId} step="Optional">In der bisherigen Ansicht öffnen</LegacyLink>
    </div>
  );
  if (cat.id === "SONDER") return <><div className="font-bold">Sonderprodukte (Freie Zusatzpositionen)</div><FreeItems rows={rowsOf(s)} /></>;
  if (cat.id === "SHOWER") return (
    <>
      <Choices legend="Sitzt die Armatur auf passender Höhe direkt unter dem Duschgestänge (feste Verbindung möglich)?" name="showerMount" options={MOUNTS} value={opt.showerMount as string | undefined} required onChange={(v) => act((x) => setMount(x, v as Mount))} />
      {opt.showerMount === "versetzt" ? <p className={MUTED} data-part="mount-hint">Pflicht: separate Aufputz-Armatur (Kategorie „Austausch eines Thermostates“) + Verbindungsschlauch.</p> : null}
      <Tiles products={cat.products.filter((p) => fitsMount(opt, p))} opt={opt} />
    </>
  );
  if (cat.id === "BASIN") {
    const basins = BASINS.filter((b) => isOn(opt, b));
    return (
      <>
        <h4 className={H4}>Waschtisch ohne Unterschrank</h4>
        <p className={MUTED}>Sobald ein Waschbecken <strong>oder</strong> ein Sonderprodukt ausgewählt ist, ergänzt der Konfigurator automatisch Befestigungssatz und Siphon. Bei mehreren Auswahlen bleibt es bei einer Zeile je Artikel – nur die Menge summiert sich.</p>
        <Tiles products={main} opt={opt} extra={(p) => (p.id === FREE_BASIN ? <FreeBasinFields basin={basinOf(s)} /> : null)} />
        {basins.length ? (
          <div className="grid gap-3 rounded-lg border-2 border-border p-3">
            <h4 className={H4}>Automatisch verknüpftes Zubehör</h4>
            <div className="flex flex-wrap gap-1.5" data-testid="opt-linked">{basins.map((b) => <span key={b} className="rounded-full bg-muted px-2.5 py-0.5 text-[0.85rem]">{cat.products.find((p) => p.id === b)!.name}</span>)}</div>
            <p className={MUTED}>Wird ergänzt, sobald oben ein Waschbecken oder ein Sonderprodukt gewählt ist, und wieder entfernt, sobald keine Auswahl mehr besteht. Die Menge kann bei Bedarf jederzeit manuell reduziert werden.</p>
            <Tiles products={parts.filter((p) => p.id !== "EV")} opt={opt} />
            <h4 className={H4}>Optional zu Waschtisch ohne Unterschrank</h4>
            <Tiles products={parts.filter((p) => p.id === "EV")} opt={opt} />
          </div>
        ) : null}
      </>
    );
  }
  const owner = cat.id === "BASIN_TAP" ? "ONSHB" : cat.id === "WESGH" ? "WESGH" : ""; // the product its accessories come with
  return (
    <>
      {cat.id === "WESGH" ? <h4 className={H4}>Wandeinbau-Waschgeräte-Siphon komplett DN 40/50</h4> : null}
      <SearchableTiles products={main} opt={opt} />
      {parts.length && isOn(opt, owner) ? (
        <div className="grid gap-3 rounded-lg border-2 border-border p-3">
          {cat.id === "BASIN_TAP" ? <h4 className={H4}>Erforderliches Zubehör</h4> : <div className="font-bold">Erforderliches Zubehör</div>}
          <Tiles products={parts} opt={opt} />
        </div>
      ) : null}
      {cat.id === "HEBE" ? <p className={MUTED}>Bei Vorwandsystemen Wartungsöffnung 300×400 mm (H×B) vorsehen. Nur fäkalienfreies Abwasser.</p> : null}
    </>
  );
}

/** The dialog of a category. Esc, the cross, "Fertig" and a tap beside it close it. */
function Dialog({ cat, s, dealId, onClose }: { cat: Category; s: State; dealId: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []); // the keys go to the dialog while it is open
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === "Escape") onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" data-testid="opt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="opt-dialog-title" onKeyDown={onKey} className="grid max-h-[92dvh] w-full min-w-0 max-w-3xl grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] rounded-lg bg-card text-card-foreground shadow-xl outline-none">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <strong id="opt-dialog-title" className="text-lg">{cat.name}</strong>
          <Button variant="ghost" size="icon" aria-label="Schließen" onClick={onClose}><X aria-hidden /></Button>
        </div>
        <div className="grid min-w-0 grid-cols-1 content-start gap-4 overflow-y-auto overscroll-contain p-4" data-testid="opt-panel" data-cat={cat.id}><Panel cat={cat} s={s} dealId={dealId} /></div>
        <div className="flex justify-end border-t border-border px-4 py-2"><Button onClick={onClose}>Fertig</Button></div>
      </div>
    </div>
  );
}

export function Optional() {
  const { dealId = "" } = useParams();
  const opt = useOfferStore((x) => (x.offer as Record<string, any> | null)?.optional as Fields | undefined) ?? NONE;
  const ui = useOfferStore((x) => x.scratch.optional as Ui | undefined) ?? NO_UI;
  const [open, setOpen] = useState<string | null>(null);
  const cards = useRef<HTMLDivElement>(null);
  const s: State = { opt, ui };
  const picks = chips(s);
  const show = (cat: string) => { act((x) => openCard(x, cat)); setOpen(cat); }; // tapping a card that has picks edits it
  const close = () => {
    if (!open) return;
    act((x) => closeCard(x, open));
    setOpen(null);
    cards.current?.querySelector<HTMLElement>(`[data-id="${open}"]`)?.focus(); // back to the card the dialog came from
  };
  const shown = CATEGORIES.find((c) => c.id === open);
  return (
    <Card aria-labelledby="opt-title" className="grid-cols-1">
      <CardTitle id="opt-title">Optionale Produkte</CardTitle>
      {picks.length ? (
        <section className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border-2 border-border bg-card p-3" data-testid="opt-bar" aria-label="Ausgewählte Optionen">
          <strong data-part="head">{`Ausgewählte Optionen (${picks.length})`}</strong>
          <div className="flex flex-wrap gap-2">
            {picks.map((c, i) => (
              <span key={`${c.cat}-${c.product ?? c.row ?? c.text}-${i}`} data-testid="opt-chip" title={c.title} className="inline-flex min-h-12 max-w-full items-center gap-1 rounded-3xl border-2 border-input bg-card pl-4 pr-1">
                <span data-part="text" className="min-w-0 break-words py-1">{c.text}</span>
                {c.fixed ? <span className="w-3" /> : <button type="button" aria-label={`${c.text} entfernen`} onClick={() => act((x) => removeChip(x, c))} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-xl text-foreground">×</button>}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 font-semibold">Auszuführende Arbeiten (Mehrfachauswahl)</legend>
        <div ref={cards} className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
          {CATEGORIES.map((c) => {
            const on = cardOn(s, c.id), n = on ? count(s, c.id) : 0;
            return (
              <button key={c.id} type="button" data-testid="opt-card" data-id={c.id} aria-pressed={on} onClick={() => show(c.id)}
                className={cn("relative grid min-h-12 cursor-pointer content-start justify-items-center gap-2 rounded-lg border-2 bg-card p-3 text-center text-foreground", on ? "border-primary bg-accent-weak font-bold" : "border-input")}>
                <img src={c.img} alt="" loading="lazy" className="h-24 w-full rounded object-contain" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <span data-part="name">{c.name}</span>
                <span data-part="badge" data-counted={n > 0} className={cn("absolute right-2 top-2 rounded-full px-2 py-0.5 text-[0.85rem] font-bold", n > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{`✓ ${n}`}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {shown ? <Dialog cat={shown} s={s} dealId={dealId} onClose={close} /> : null}
    </Card>
  );
}
