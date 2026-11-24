// Small building blocks of the admin pages: the confirmation dialog (an in-page <dialog>, never
// window.confirm), counters, a table that scrolls sideways on a phone, badges, a refresh button.
import { RotateCw, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button, cn } from "../../shared/ui/index.js";

/** Asks before a change takes effect. Esc, "Abbrechen", the X and a tap outside cancel. */
export function Confirm({ title, children, confirmLabel, destructive, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; destructive?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    return () => { if (d?.open) { if (d.close) d.close(); else d.removeAttribute("open"); } };
  }, []);
  return (
    <dialog
      ref={ref} aria-labelledby="admin-confirm-title" data-testid="admin-confirm"
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[480px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="grid gap-4 p-5">
        <div className="flex items-start gap-2">
          <h2 id="admin-confirm-title" className="m-0 flex-1 text-[1.15rem] font-bold">{title}</h2>
          <button type="button" aria-label="Schließen" disabled={busy} onClick={onCancel} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"><X aria-hidden className="size-5" /></button>
        </div>
        <div className="grid gap-2">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onCancel}>Abbrechen</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{busy ? "Bitte warten …" : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}

export function Stats({ items }: { items: readonly { value: ReactNode; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="admin-stats">
      {items.map((s) => (
        <div key={s.label} className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-xl font-bold">{s.value}</div>
          <div className="text-[0.9rem] text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** A table that keeps its columns and scrolls sideways when the screen is narrower. */
export function Table({ head, children, label }: { head: readonly string[]; children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table aria-label={label} className="w-full min-w-[640px] border-collapse text-[0.95rem]">
        <thead><tr>{head.map((h, i) => <th key={i} scope="col" className="border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const TD = "border-b border-border px-3 py-2 align-top";

export function Empty({ cols, children }: { cols: number; children: ReactNode }) {
  return <tr><td colSpan={cols} className="px-3 py-6 text-center text-muted-foreground">{children}</td></tr>;
}

export function Badge({ tone = "neutral", children }: { tone?: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = { ok: "border-green-600 text-green-700 dark:text-green-400", warn: "border-amber-600 text-amber-700 dark:text-amber-400", bad: "border-destructive text-destructive", neutral: "border-border text-muted-foreground" }[tone];
  return <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.85rem] font-semibold", cls)}>{children}</span>;
}

export function Refresh({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return <Button variant="outline" onClick={onClick} disabled={busy}><RotateCw aria-hidden />Aktualisieren</Button>;
}

/** label + native select, 48 px high */
export function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[] }) {
  return (
    <label htmlFor={id} className="grid gap-1.5">
      <span className="font-semibold">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-12 cursor-pointer rounded-lg border-2 border-input bg-card px-3.5 text-foreground">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
