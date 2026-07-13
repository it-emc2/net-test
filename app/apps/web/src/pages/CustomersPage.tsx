import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { CustomerListItem } from "@emc2/shared";
import { customersApi } from "@/features/customers/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function customerName(c: {
  company: string;
  firstName: string;
  lastName: string;
}): string {
  return c.company || [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

export function CustomersPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box → q (and reset to page 1 on a new query).
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
    customersApi
      .list({ q, page, pageSize: PAGE_SIZE })
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
  }, [q, page]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Übersicht</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Kunden</h1>
        <p className="mt-2 text-muted-foreground">Kundenstamm durchsuchen.</p>
      </header>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Name, Firma, Ort, E-Mail, Kundennr. …"
          className="pl-9"
          aria-label="Kunden suchen"
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Kundennr.</th>
                <th className="px-5 py-3 font-semibold">Ort</th>
                <th className="px-5 py-3 font-semibold">E-Mail</th>
                <th className="px-5 py-3 font-semibold">Telefon</th>
                <th className="px-5 py-3 font-semibold">Aktualisiert</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    Wird geladen …
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    {q ? "Keine Treffer." : "Keine Kunden vorhanden."}
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/kunden/${c.id}`)}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-5 py-3 font-medium">{customerName(c)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{c.customerNumber || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {[c.postalCode, c.city].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{c.email || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.updatedAt ? dateFmt.format(new Date(c.updatedAt)) : "—"}
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
