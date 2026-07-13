import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Package } from "lucide-react";
import type { ProductListItem } from "@emc2/shared";
import { productsApi } from "@/features/products/api";
import { StockBadge } from "@/features/products/StockBadge";
import { formatEUR, categoryLabel } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 24;
const ALL = "__all__";

export function ProductsPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    productsApi.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Debounce the search box → q, resetting to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    productsApi
      .list({ q, category: category === ALL ? undefined : category, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, category, page]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Katalog</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Produkte</h1>
        <p className="mt-2 text-muted-foreground">
          Live aus dem Vigor-Katalog — mit tagesaktuellem Bestand.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Artikelnummer, Bezeichnung, Ausführung …"
            className="pl-9"
            aria-label="Produkte suchen"
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[15rem]" aria-label="Kategorie filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Kategorien</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Artikel</th>
                <th className="px-4 py-3 font-semibold">Bezeichnung</th>
                <th className="px-4 py-3 font-semibold">Ausführung</th>
                <th className="px-4 py-3 text-right font-semibold">Netto</th>
                <th className="px-4 py-3 font-semibold">Bestand</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Wird geladen …
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {q || category !== ALL ? "Keine Treffer." : "Keine Produkte."}
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr
                    key={p.articleNumber}
                    onClick={() => navigate(`/produkte/${encodeURIComponent(p.articleNumber)}`)}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                          {p.image ? (
                            <img src={p.image} alt="" className="size-full object-contain" loading="lazy" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="font-mono text-xs font-medium">{p.articleNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.finish || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatEUR(p.netPrice, p.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StockBadge inStock={p.inStock} quantity={p.stockQuantity} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {from}–{to} von {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
          >
            <ChevronLeft /> Zurück
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          >
            Weiter <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
