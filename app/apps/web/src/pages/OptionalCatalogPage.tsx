import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Search, Loader2, Package } from "lucide-react";
import type { OptionalCategoryDef } from "@emc2/shared";
import { optionalAdminApi } from "@/features/admin/optionalApi";
import { productsApi } from "@/features/products/api";
import { formatEUR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Resolved = Record<string, { name: string; netPrice: number; image: string | null }>;

export function OptionalCatalogPage() {
  const [cats, setCats] = useState<OptionalCategoryDef[]>([]);
  const [resolved, setResolved] = useState<Resolved>({});
  const [fromSeed, setFromSeed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    optionalAdminApi
      .get()
      .then((r) => {
        setCats(r.categories);
        setResolved(r.resolved);
        setFromSeed(r.fromSeed);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const nameOf = (it: { productId: string; manual?: { name: string } | null }) =>
    it.manual?.name || resolved[it.productId]?.name || it.productId;

  // Immutable helpers keyed by category index.
  const update = (fn: (draft: OptionalCategoryDef[]) => void) =>
    setCats((prev) => {
      const next = structuredClone(prev) as OptionalCategoryDef[];
      fn(next);
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const r = await optionalAdminApi.save(cats);
      setMsg(`Gespeichert (${r.count} Kategorien).`);
      setFromSeed(false);
      load();
    } catch (e: any) {
      setError(e.message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link to="/admin"><ArrowLeft /> Zurück zur Administration</Link>
      </Button>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Administration</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Optional-Katalog</h1>
          <p className="mt-2 text-muted-foreground">Kategorien, Produkte und notwendiges Zubehör verwalten.</p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="animate-spin" /> : null} Speichern
        </Button>
      </header>

      {fromSeed && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Aktuell aus der Vorlage geladen. Beim Speichern wird der Katalog in die Datenbank übernommen und dort verwaltet.
        </p>
      )}
      {msg && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : (
        <div className="space-y-4">
          {cats.map((cat, ci) => (
            <div key={ci} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={cat.label}
                  onChange={(e) => update((d) => void (d[ci].label = e.target.value))}
                  className="max-w-xs font-medium"
                />
                <span className="font-mono text-xs text-muted-foreground">{cat.id}</span>
                {cat.special === "sonder" && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Freitext</span>
                )}
                <button
                  type="button"
                  onClick={() => update((d) => void d.splice(ci, 1))}
                  className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Kategorie entfernen"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {cat.special !== "sonder" && (
                <div className="mt-4 space-y-2">
                  {(cat.items ?? []).map((it, ii) => (
                    <div key={ii} className="rounded-md border p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                          {resolved[it.productId]?.image ? (
                            <img src={resolved[it.productId]!.image!} alt="" className="size-full object-contain p-0.5" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{nameOf(it)}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {it.productId} · {formatEUR(it.manual?.price ?? resolved[it.productId]?.netPrice ?? 0)}
                            {it.manual ? " · manuell" : ""}
                          </span>
                        </span>
                        <button type="button" onClick={() => update((d) => void d[ci].items.splice(ii, 1))} aria-label="Produkt entfernen" className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      {/* Companions */}
                      <div className="mt-2 space-y-1 border-t pt-2 pl-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notwendiges Zubehör</p>
                        {(it.companions ?? []).map((co, coi) => (
                          <div key={coi} className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate">{resolved[co.productId]?.name || co.productId}</span>
                            <span className="text-muted-foreground">×</span>
                            <Input
                              inputMode="decimal"
                              value={String(co.qtyRatio)}
                              onChange={(e) => update((d) => void (d[ci].items[ii].companions![coi].qtyRatio = Number(e.target.value) || 1))}
                              className="h-7 w-16"
                              aria-label="Verhältnis"
                            />
                            <button type="button" onClick={() => update((d) => void d[ci].items[ii].companions!.splice(coi, 1))} aria-label="Zubehör entfernen" className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                        <AddProduct
                          label="Zubehör hinzufügen"
                          allowManual={false}
                          onAdd={(pid) =>
                            update((d) => {
                              const item = d[ci].items[ii];
                              item.companions = item.companions ?? [];
                              item.companions.push({ productId: pid, qtyRatio: 1 });
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}

                  <AddProduct
                    label="Produkt hinzufügen"
                    allowManual
                    onAdd={(pid, manual) =>
                      update((d) => {
                        d[ci].items = d[ci].items ?? [];
                        d[ci].items.push({ productId: pid, manual: manual ?? null, defaultQty: 1, companions: [] });
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() =>
              update((d) => {
                const id = `cat_NEU_${d.length + 1}`;
                d.push({ id, label: "Neue Kategorie", order: d.length, selection: "multi", items: [] });
              })
            }
          >
            <Plus /> Kategorie hinzufügen
          </Button>
        </div>
      )}
    </div>
  );
}

/** Search Vigor/Products to pick a productId, or add a manual product. */
function AddProduct({
  label,
  allowManual,
  onAdd,
}: {
  label: string;
  allowManual: boolean;
  onAdd: (productId: string, manual: { name: string; price: number } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ articleNumber: string; name: string; netPrice: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [mId, setMId] = useState("");
  const [mName, setMName] = useState("");
  const [mPrice, setMPrice] = useState("");

  useEffect(() => {
    if (!open || manual || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      productsApi
        .list({ q: q.trim(), pageSize: 8 })
        .then((r) => !cancelled && setResults(r.items.map((i) => ({ articleNumber: i.articleNumber, name: i.name, netPrice: i.netPrice }))))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, manual]);

  function reset() {
    setOpen(false); setQ(""); setResults([]); setManual(false); setMId(""); setMName(""); setMPrice("");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
        <Plus className="size-3.5" /> {label}
      </button>
    );
  }

  return (
    <div className="rounded-md border bg-background p-2">
      {!manual ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produkt suchen (Artikel/Name) …" className="h-8 pl-7 text-sm" />
            {loading && <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {results.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-auto">
              {results.map((r) => (
                <li key={r.articleNumber}>
                  <button type="button" onClick={() => { onAdd(r.articleNumber, null); reset(); }} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{r.articleNumber} · {formatEUR(r.netPrice)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            {allowManual && (
              <button type="button" onClick={() => setManual(true)} className="text-xs text-primary hover:underline">
                Manuell hinzufügen
              </button>
            )}
            <button type="button" onClick={reset} className="ml-auto text-xs text-muted-foreground hover:underline">Abbrechen</button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <FieldSm label="Artikel-Nr."><Input value={mId} onChange={(e) => setMId(e.target.value)} className="h-8" /></FieldSm>
            <FieldSm label="Preis (€, netto)"><Input inputMode="decimal" value={mPrice} onChange={(e) => setMPrice(e.target.value)} className="h-8" /></FieldSm>
          </div>
          <FieldSm label="Bezeichnung"><Input value={mName} onChange={(e) => setMName(e.target.value)} className="h-8" /></FieldSm>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!mId.trim() || !mName.trim()}
              onClick={() => { onAdd(mId.trim(), { name: mName.trim(), price: Number(String(mPrice).replace(",", ".")) || 0 }); reset(); }}
            >
              Hinzufügen
            </Button>
            <button type="button" onClick={() => setManual(false)} className="text-xs text-muted-foreground hover:underline">Zurück zur Suche</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldSm({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="normal-case">{label}</Label>
      {children}
    </div>
  );
}
