// The step list as a left drawer on narrow screens (iPad portrait): a native <dialog> opened with
// showModal() — Esc, a tap on the backdrop, a swipe to the left or choosing a step close it.
import { History, Home, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { LogoTile } from "../../app/Brand.js";
import { useOfferLines } from "./HeaderOffer.js";
import { useNav } from "./model/nav.js";

export function StepDrawer({ onHome, total, children }: { onHome: () => void; total: ReactNode; children: ReactNode }) {
  const { drawer, setDrawer } = useNav();
  const ref = useRef<HTMLDialogElement>(null);
  const swipe = useRef<number | null>(null);
  const { line1, line2 } = useOfferLines();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (drawer && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    if (!drawer && d.open) { if (d.close) d.close(); else d.removeAttribute("open"); document.getElementById("offer-burger")?.focus(); }
  }, [drawer]);

  return (
    <dialog
      ref={ref} aria-label="Schritte"
      onClose={() => setDrawer(false)} // Esc
      onClick={(e) => { if (e.target === e.currentTarget) setDrawer(false); }} // the backdrop is the dialog itself
      onPointerDown={(e) => { swipe.current = e.clientX; }}
      onPointerUp={(e) => { if (swipe.current !== null && e.clientX - swipe.current < -60) setDrawer(false); swipe.current = null; }}
      className="drawer fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[300px] max-w-[85vw] overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/50 lg:hidden"
    >
      {drawer ? (
        <div className="flex h-full flex-col" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setDrawer(false); }}>
          <div className="flex items-center gap-3 border-b border-border p-3">
            <LogoTile />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="m-0 truncate font-bold">{line1}</p>
              {line2 ? <p className="m-0 truncate text-[0.8rem] text-muted-foreground">{line2}</p> : null}
            </div>
            <button type="button" aria-label="Schritte schließen" onClick={() => setDrawer(false)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"><X aria-hidden className="size-5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* save first, then leave (the frame decides how) */}
            <button type="button" onClick={onHome} className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent bg-transparent px-3 text-left text-base text-foreground hover:bg-accent-weak"><Home aria-hidden className="size-5" />Hauptmenü</button>
            <h2 className="mb-1 mt-4 px-3 text-[0.85rem] font-semibold uppercase tracking-wide text-muted-foreground">Schritte</h2>
            {children}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border p-3">
            {total}
            <a href="/" className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.9rem] text-foreground no-underline hover:bg-muted"><History aria-hidden className="size-4" />Versionen</a>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
