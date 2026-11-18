// Optionale Produkte → WC: Montageart, Sitzhöhe and the products with their names and prices
// from the price list (wc-rules.ts). Stored as today.
import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { Choices, IMG, Input, Label, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { namesOf } from "./rules.js";
import { act } from "./store.js";
import { MONTAGES, SEATS, WC_IDS, renamed, setMontage, setSeat, setWcQty, tilesOf, toggleTile, wcName, type TileView } from "./wc-rules.js";

type Fields = Record<string, unknown>;
export interface WcProduct { name: string | null; price: number | null }
export const LAST = "optional-wc-montage"; // the Montageart the products were last arranged for (today: in the page, until the card is left empty)
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/** names and prices of the WC products from the price list (null: not found) */
export function useWcProducts(): Record<string, WcProduct | null | undefined> {
  const qs = useQueries({
    queries: WC_IDS.map((id) => ({
      queryKey: ["wc-product", id], staleTime: 10 * 60_000, retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => call("product", { params: { productId: id }, signal }).then((p) => ({ name: p.name ? String(p.name).trim() : null, price: p.price ?? null })).catch(() => null),
    })),
  });
  return Object.fromEntries(WC_IDS.map((id, i) => [id, qs[i]!.data]));
}

function Pictures({ v }: { v: TileView }) {
  const pics = v.item.images ?? (v.item.image ? [v.item.image] : []);
  const [at, setAt] = useState(0);
  const name = v.item.fallbackName;
  return (
    <span className="grid justify-items-center gap-1">
      <img src={pics[at]} alt={pics.length > 1 ? `${name} – Bild ${at + 1}` : name} loading="lazy" className={cn(IMG.tile, "rounded object-contain")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      {pics.length > 1 ? (
        <span className="flex gap-1">
          {pics.map((_, i) => (
            <button key={i} type="button" aria-label={`Bild ${i + 1}`} aria-pressed={i === at} onClick={(e) => { e.preventDefault(); setAt(i); }}
              className="grid size-12 cursor-pointer place-items-center rounded-full border-0 bg-transparent"><span className={cn("size-3 rounded-full", i === at ? "bg-primary" : "bg-muted-foreground/40")} /></button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function WcTile({ v, product, onToggle, onQty }: { v: TileView; product: WcProduct | null | undefined; onToggle: () => void; onQty: (text: string) => void }) {
  const id = `wc_${v.tile}`;
  return (
    <div data-testid="wc-tile" data-id={v.tile} className="grid content-start gap-2">
      <label className={cn("grid min-h-12 cursor-pointer gap-2 rounded-lg border-2 bg-card p-2", v.on ? "border-primary bg-accent-weak" : "border-input", v.locked && "cursor-default opacity-45 grayscale")}>
        <span className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--primary)]" checked={v.on} disabled={v.locked} onChange={onToggle} />
          <span className="grid min-w-0 gap-1">
            <span data-part="name" className={cn("break-words text-[0.95rem]", v.on && "font-bold")}>{wcName(product?.name ? { [v.item.id]: product.name } : {}, v.tile)}</span>
            {product ? <span data-part="art" className="text-[0.85rem] text-muted-foreground">{v.item.id}</span> : null}
            {product && Number.isFinite(Number(product.price)) && product.price != null ? <span data-part="price" className="text-[0.95rem] font-semibold">{euro(Number(product.price))}</span> : null}
          </span>
        </span>
        <Pictures v={v} />
        {v.item.dims ? (
          <span className="flex flex-wrap gap-1.5" aria-label="Maße in Millimetern">
            {v.item.dims.map(([k, n]) => <span key={k} data-part="dim" className="rounded-full bg-muted px-2.5 py-0.5 text-[0.85rem]"><span>{k}</span> <span>{n} mm</span></span>)}
          </span>
        ) : null}
      </label>
      {v.qty !== null ? (
        <div className="grid max-w-56 gap-1">
          <Label htmlFor={id}>Menge</Label>
          <Input id={id} type="number" inputMode="numeric" min={0} step={1} placeholder="0" value={v.qty} onChange={(e) => onQty(e.target.value)} />
        </div>
      ) : null}
    </div>
  );
}

export function WcPanel({ opt }: { opt: Fields }) {
  const products = useWcProducts();
  const names = namesOf(products);
  const last = useOfferStore((x) => x.scratch[LAST] as string | null | undefined) ?? null;
  // names that arrive after the tiles were ticked: the stored lists follow
  const key = JSON.stringify(names);
  useEffect(() => { const next = renamed(opt, names); if (next) act((s) => ({ ...s, opt: next })); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const montage = String(opt.wcMontage ?? ""), seat = String(opt.wcSeatHeight ?? "");
  const { groups } = tilesOf(opt, names);
  const onMontage = (m: string) => {
    act((s) => ({ ...s, opt: setMontage(s.opt, names, m, last) }));
    useOfferStore.getState().remember(LAST, m);
  };
  return (
    <div className="grid min-w-0 gap-4" data-testid="wc">
      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 font-semibold">Montageart <span aria-hidden className="text-destructive">*</span></legend>
        <div className="grid grid-cols-2 gap-3">
          {MONTAGES.map((m) => (
            <label key={m.value} className={cn("grid min-h-12 cursor-pointer justify-items-center gap-2 rounded-lg border-2 bg-card p-3 text-center", montage === m.value ? "border-primary bg-accent-weak font-bold" : "border-input")}>
              <input type="radio" name="wcMontage" value={m.value} checked={montage === m.value} onChange={() => onMontage(m.value)} className="sr-only" />
              <img src={m.img} alt={`${m.value} WC`} loading="lazy" className={cn(IMG.product, "w-full rounded object-contain")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              <span>{m.value}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {montage === "Wandmontage" ? (
        <Choices legend="Sitzhöhe" name="wcSeatHeight" options={SEATS} value={seat || undefined} required onChange={(v) => act((s) => ({ ...s, opt: setSeat(s.opt, names, v) }))} />
      ) : null}
      {groups.map((g) => (
        <section key={g.kind} data-testid="wc-group" data-kind={g.kind} className="grid gap-3">
          <h4 className="m-0 text-base font-bold">{g.head}</h4>
          <div className={cn("grid gap-3", g.kind === "wc" ? "grid-cols-1" : "grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]")}>
            {g.tiles.map((pair) => (
              <div key={pair[0]!.tile} data-testid="wc-pair" className={cn(g.kind === "wc" && "grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3 rounded-lg border-2 border-border p-3")}>
                {pair.map((v) => (
                  <WcTile key={v.tile} v={v} product={products[v.item.id]} onToggle={() => act((s) => ({ ...s, opt: toggleTile(s.opt, names, v.tile) }))} onQty={(text) => act((s) => ({ ...s, opt: setWcQty(s.opt, v.tile, text) }))} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
