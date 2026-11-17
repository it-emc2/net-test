// shadcn/ui-style Tabs and Collapsible (same look and roles as shadcn's, without Radix: the app
// has no Radix packages besides Slot). Both keep their panels mounted and hide them with
// `hidden`, so what is typed or loaded in a closed panel stays.
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** A row of tabs. Ids: `<idPrefix>-tab-<id>` for the tab, `<idPrefix>-panel-<id>` for its panel. */
export function TabsList<T extends string>({ label, idPrefix, tabs, value, onChange, className, ...rest }: {
  label: string; idPrefix: string; tabs: readonly { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; className?: string; "data-testid"?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-muted p-1", className)} {...rest}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" id={`${idPrefix}-tab-${t.id}`} aria-controls={`${idPrefix}-panel-${t.id}`} aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const i = tabs.findIndex((x) => x.id === value), next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
            onChange(next.id); document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
          }}
          className={cn("inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 px-3 text-[1.05rem] font-semibold transition-colors [&_svg]:size-5",
            value === t.id ? "bg-card text-foreground shadow-sm" : "bg-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
      ))}
    </div>
  );
}

export function TabsPanel({ idPrefix, id, value, className, children }: { idPrefix: string; id: string; value: string; className?: string; children: ReactNode }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={value !== id} className={className}>{children}</div>;
}

/** A section that opens and closes with its heading button (closed by default where it is used). */
export function Collapsible({ id, title, hint, open, onOpenChange, children, className }: {
  id: string; title: string; hint?: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)} data-testid={id} data-open={open ? "true" : "false"}>
      <h3 className="m-0">
        <button type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={`${id}-content`} onClick={() => onOpenChange(!open)}
          className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-4 text-left text-[1.05rem] font-semibold text-foreground">
          <span className="grid flex-1"><span>{title}</span>{hint ? <span className="text-[0.95rem] font-normal text-muted-foreground">{hint}</span> : null}</span>
          <ChevronDown aria-hidden className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      <div id={`${id}-content`} role="region" aria-labelledby={`${id}-trigger`} hidden={!open} className="grid gap-5 border-t border-border p-4">{children}</div>
    </section>
  );
}
