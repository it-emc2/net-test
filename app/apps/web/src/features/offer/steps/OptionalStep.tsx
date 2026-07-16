import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Package, Plus, Trash2, X } from "lucide-react";
import type { OptionalCategoryView, OptionalItemView } from "@emc2/shared";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { StepCalc } from "../StepCalc";
import { getOptionalCatalog } from "../optional";
import { formatEUR } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OptionalStep() {
  const { payload, patchSection } = useOffer();
  const opt = payload.optional;
  const [cats, setCats] = useState<OptionalCategoryView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOptionalCatalog()
      .then((r) => setCats(r.categories))
      .catch((e) => setError(e.message));
  }, []);

  const isSel = (pid: string) => opt["opt_" + pid] === true;
  const qtyOf = (pid: string) => Number(opt["qty_" + pid]) || 0;

  function toggleItem(item: OptionalItemView, on: boolean) {
    const q = on ? item.defaultQty || 1 : 0;
    const patch: Record<string, any> = { ["opt_" + item.productId]: on, ["qty_" + item.productId]: q };
    for (const c of item.companions) {
      patch["opt_" + c.productId] = on;
      patch["qty_" + c.productId] = on ? Math.round(c.qtyRatio * q) : 0;
    }
    patchSection("optional", patch);
  }

  function setItemQty(item: OptionalItemView, qty: number) {
    const q = Math.max(1, qty || 1);
    const patch: Record<string, any> = { ["qty_" + item.productId]: q };
    for (const c of item.companions) {
      if (opt["opt_" + c.productId]) patch["qty_" + c.productId] = Math.round(c.qtyRatio * q);
    }
    patchSection("optional", patch);
  }

  const setCompQty = (pid: string, qty: number) => patchSection("optional", { ["qty_" + pid]: Math.max(0, qty || 0) });
  const removeComp = (pid: string) => patchSection("optional", { ["opt_" + pid]: false, ["qty_" + pid]: 0 });

  // REHA products are gross-priced; the pricing engine keys off opt["optReha[]"].
  // Toggle normally, then rebuild that list from the category's current selection.
  function toggleReha(cat: OptionalCategoryView, item: OptionalItemView, on: boolean) {
    const q = on ? item.defaultQty || 1 : 0;
    const selected = cat.items
      .map((i) => i.productId)
      .filter((pid) => (pid === item.productId ? on : isSel(pid)));
    patchSection("optional", { ["opt_" + item.productId]: on, ["qty_" + item.productId]: q, "optReha[]": selected });
  }

  return (
    <div className="space-y-6">
      <StepHeader title="Optional" hint="Zusatzprodukte je Kategorie wählen. Notwendiges Zubehör wird automatisch ergänzt." />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {cats.map((cat) =>
        cat.special === "sonder" ? (
          <SonderCategory
            key={cat.id}
            label={cat.label}
            rows={Array.isArray(opt.quickAdd) ? opt.quickAdd : []}
            onChange={(rows) => patchSection("optional", { quickAdd: rows })}
          />
        ) : cat.special === "wc" ? (
          <Category key={cat.id} cat={cat} selectedCount={cat.items.filter((i) => isSel(i.productId)).length}>
            <WcPanel cat={cat} opt={opt} patch={(p) => patchSection("optional", p)} />
          </Category>
        ) : (
          <Category
            key={cat.id}
            cat={cat}
            selectedCount={cat.items.filter((i) => isSel(i.productId)).length}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cat.items.map((item) => (
                <ItemTile
                  key={item.productId}
                  item={item}
                  sel={isSel(item.productId)}
                  opt={opt}
                  qtyOf={qtyOf}
                  onToggle={() =>
                    cat.special === "reha"
                      ? toggleReha(cat, item, !isSel(item.productId))
                      : toggleItem(item, !isSel(item.productId))
                  }
                  onQty={(v) => setItemQty(item, v)}
                  setCompQty={setCompQty}
                  removeComp={removeComp}
                />
              ))}
            </div>
          </Category>
        ),
      )}
      <StepCalc filter={(l) => String(l.source || "").startsWith("optional")} />
    </div>
  );
}

function ItemTile({
  item,
  sel,
  opt,
  qtyOf,
  onToggle,
  onQty,
  setCompQty,
  removeComp,
}: {
  item: OptionalItemView;
  sel: boolean;
  opt: Record<string, any>;
  qtyOf: (pid: string) => number;
  onToggle: () => void;
  onQty: (v: number) => void;
  setCompQty: (pid: string, v: number) => void;
  removeComp: (pid: string) => void;
}) {
  return (
    <div className={cn("rounded-lg border p-2.5 transition-colors", sel && "border-primary bg-primary/5")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <span className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
          {item.image ? (
            <img src={item.image} alt="" className="size-full object-contain p-1.5" loading="lazy" />
          ) : (
            <Package className="size-7 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium">{item.name}</span>
          <span className="block text-xs text-muted-foreground">{formatEUR(item.netPrice)}</span>
        </span>
      </button>

      {sel && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="flex items-center gap-2">
            <Label className="normal-case">Menge</Label>
            <Input inputMode="numeric" value={String(qtyOf(item.productId))} onChange={(e) => onQty(Number(e.target.value))} className="h-8 w-20" />
          </div>
          {item.companions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notwendiges Zubehör</p>
              {item.companions.map((c) =>
                opt["opt_" + c.productId] ? (
                  <div key={c.productId} className="flex items-center gap-2 text-xs">
                    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                      {c.image ? (
                        <img src={c.image} alt="" className="size-full object-contain p-0.5" loading="lazy" />
                      ) : (
                        <Package className="size-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 break-words">{c.name}</span>
                    <Input inputMode="numeric" value={String(qtyOf(c.productId))} onChange={(e) => setCompQty(c.productId, Number(e.target.value))} className="h-7 w-14" />
                    <button type="button" onClick={() => removeComp(c.productId)} aria-label="Entfernen" className="text-muted-foreground hover:text-destructive">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Single-image viewer with prev/next arrows. Arrow clicks don't bubble (so the
// surrounding card's select handler doesn't fire).
function Carousel({ images }: { images: string[] }) {
  const [i, setI] = useState(0);
  if (!images.length)
    return (
      <div className="flex h-52 items-center justify-center rounded-md border bg-white">
        <Package className="size-10 text-muted-foreground" />
      </div>
    );
  const n = images.length;
  const idx = i % n;
  const go = (d: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    setI((idx + d + n) % n);
  };
  return (
    <div className="relative">
      <img src={images[idx]} alt="" className="h-52 w-full rounded-md border bg-white object-contain p-2" loading="lazy" />
      {n > 1 && (
        <>
          <button type="button" onClick={(e) => go(-1, e)} aria-label="Zurück" className="absolute left-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={(e) => go(1, e)} aria-label="Weiter" className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent">
            <ChevronRight className="size-4" />
          </button>
          <span className="absolute bottom-1.5 right-2 rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {idx + 1}/{n}
          </span>
        </>
      )}
    </div>
  );
}

// WC panel: pick Montageart, then a WC model. Structure is derived from the data —
// items without companions are the base "Produkte für Wandmontage" (auto-selected),
// items with a companion (the matching WC-Sitz) are single-select WC models.
function WcPanel({
  cat,
  opt,
  patch,
}: {
  cat: OptionalCategoryView;
  opt: Record<string, any>;
  patch: (p: Record<string, any>) => void;
}) {
  const base = cat.items.filter((i) => i.companions.length === 0);
  const models = cat.items.filter((i) => i.companions.length > 0);
  // WC-Sitze are the distinct companions across all models — selected independently.
  const sitze = [...new Map(models.flatMap((m) => m.companions).map((c) => [c.productId, c])).values()];
  const isSel = (pid: string) => opt["opt_" + pid] === true;
  const montage = opt.wc_montage || (cat.items.some((i) => isSel(i.productId)) ? "wand" : "");

  function setMontage(m: "wand" | "boden") {
    const p: Record<string, any> = { wc_montage: m };
    // Clear everything WC first (opt + companions), then re-add base on Wandmontage.
    for (const it of cat.items) {
      p["opt_" + it.productId] = false;
      p["qty_" + it.productId] = 0;
      for (const c of it.companions) {
        p["opt_" + c.productId] = false;
        p["qty_" + c.productId] = 0;
      }
    }
    if (m === "wand") for (const b of base) { p["opt_" + b.productId] = true; p["qty_" + b.productId] = b.defaultQty || 1; }
    patch(p);
  }

  // Single-select toggle within one group (WCs or Sitze); re-click clears.
  function pickOne(item: { productId: string }, group: { productId: string }[]) {
    const already = isSel(item.productId);
    const p: Record<string, any> = {};
    for (const g of group) { p["opt_" + g.productId] = false; p["qty_" + g.productId] = 0; }
    if (!already) { p["opt_" + item.productId] = true; p["qty_" + item.productId] = 1; }
    patch(p);
  }

  // Selecting a WC also clears any Sitz (the Sitz choice lives under the selected WC).
  function selectWc(model: OptionalItemView) {
    const already = isSel(model.productId);
    const p: Record<string, any> = {};
    for (const m of models) { p["opt_" + m.productId] = false; p["qty_" + m.productId] = 0; }
    for (const s of sitze) { p["opt_" + s.productId] = false; p["qty_" + s.productId] = 0; }
    if (!already) { p["opt_" + model.productId] = true; p["qty_" + model.productId] = 1; }
    patch(p);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["wand", "boden"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMontage(m)}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              montage === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            {m === "wand" ? "Wandmontage" : "Bodenmontage"}
          </button>
        ))}
      </div>

      {montage === "boden" && (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Für Bodenmontage sind noch keine Produkte hinterlegt.
        </p>
      )}

      {montage === "wand" && (
        <>
          {base.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Produkte für Wandmontage</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {base.map((b) => (
                  <div key={b.productId} className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-2.5">
                    <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                      {b.image ? <img src={b.image} alt="" className="size-full object-contain p-1.5" loading="lazy" /> : <Package className="size-7 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium">{b.name}</span>
                      <span className="block text-xs text-muted-foreground">{formatEUR(b.netPrice)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">WCs für Wandmontage</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {models.map((model) => {
                const sel = isSel(model.productId);
                return (
                  <div
                    key={model.productId}
                    className={cn("rounded-lg border p-3 transition-colors", sel ? "border-primary bg-primary/5" : "hover:bg-accent")}
                  >
                    <div className="cursor-pointer" onClick={() => selectWc(model)}>
                      <Carousel images={model.images.length ? model.images : model.image ? [model.image] : []} />
                      <p className="mt-2 break-words text-sm font-medium">{model.name}</p>
                      <p className="text-xs text-muted-foreground">{formatEUR(model.netPrice)}</p>
                    </div>

                    {sel && model.companions.length > 0 && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Passender WC-Sitz</p>
                        {model.companions.map((c) => {
                          const cSel = isSel(c.productId);
                          return (
                            <button
                              key={c.productId}
                              type="button"
                              onClick={() => pickOne(c, sitze)}
                              className={cn("flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors", cSel ? "border-primary bg-primary/10" : "hover:bg-background")}
                            >
                              <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                                {c.image ? <img src={c.image} alt="" className="size-full object-contain p-1" loading="lazy" /> : <Package className="size-6 text-muted-foreground" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm font-medium">{c.name}</span>
                                <span className="block text-xs text-muted-foreground">{formatEUR(c.netPrice)}</span>
                              </span>
                              <span className={cn("size-4 shrink-0 rounded-full border", cSel && "border-primary bg-primary")} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Category({
  cat,
  selectedCount,
  children,
}: {
  cat: OptionalCategoryView;
  selectedCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(selectedCount > 0);
  return (
    <div className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-medium">
          {cat.label}
          {selectedCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{selectedCount}</span>
          )}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </div>
  );
}

interface SonderRow {
  label: string;
  price: string;
  qty: string;
  productId: string;
}

function SonderCategory({
  label,
  rows,
  onChange,
}: {
  label: string;
  rows: SonderRow[];
  onChange: (rows: SonderRow[]) => void;
}) {
  const [open, setOpen] = useState(rows.length > 0);
  const add = () => onChange([...rows, { label: "", price: "", qty: "1", productId: "" }]);
  const upd = (i: number, patch: Partial<SonderRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rm = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-medium">
          {label}
          {rows.length > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{rows.length}</span>}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-2 border-t px-4 py-3">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input placeholder="Bezeichnung" value={r.label} onChange={(e) => upd(i, { label: e.target.value })} className="min-w-[12rem] flex-1" />
              <Input placeholder="Artikel-Nr." value={r.productId} onChange={(e) => upd(i, { productId: e.target.value })} className="w-32" />
              <Input inputMode="numeric" placeholder="Menge" value={r.qty} onChange={(e) => upd(i, { qty: e.target.value })} className="w-20" />
              <Input inputMode="decimal" placeholder="Preis €" value={r.price} onChange={(e) => upd(i, { price: e.target.value })} className="w-24" />
              <button type="button" onClick={() => rm(i)} aria-label="Entfernen" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus /> Sonderprodukt hinzufügen
          </Button>
        </div>
      )}
    </div>
  );
}
