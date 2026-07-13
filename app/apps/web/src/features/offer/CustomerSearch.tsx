import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { CustomerDetail, CustomerListItem } from "@emc2/shared";
import { customersApi } from "@/features/customers/api";
import { customerName } from "@/pages/CustomersPage";
import { Input } from "@/components/ui/input";

/** Search existing customers and prefill the form from the chosen record. */
export function CustomerSearch({ onSelect }: { onSelect: (c: CustomerDetail) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      customersApi
        .list({ q: q.trim(), pageSize: 8 })
        .then((r) => !cancelled && setItems(r.items))
        .catch(() => !cancelled && setItems([]))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function choose(id: string) {
    setOpen(false);
    setQ("");
    setItems([]);
    try {
      const detail = await customersApi.get(id);
      onSelect(detail);
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Bestandskunde suchen (Name, Firma, Kundennr.) …"
        className="pl-9"
        aria-label="Kunde suchen"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}

      {open && items.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card p-1 shadow-lg">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => choose(c.id)}
                className="flex w-full flex-col items-start rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{customerName(c)}</span>
                <span className="text-xs text-muted-foreground">
                  {[c.customerNumber, [c.postalCode, c.city].filter(Boolean).join(" "), c.email]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
