// The in-page dialog of the Hauptmenü (offer picker, „Kunde nicht erreicht“, the take-over question).
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../shared/ui/index.js";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" data-testid="planning-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        className={cn("relative grid max-h-[90dvh] w-full gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl outline-none", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0">{title}</h3>
          <button type="button" aria-label="Schließen" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-lg border border-border"><X aria-hidden className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
