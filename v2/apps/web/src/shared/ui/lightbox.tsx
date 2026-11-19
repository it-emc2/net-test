// The large view of pictures, one at a time: arrows, keys (← → Esc) and swiping change the picture,
// a tap beside the picture closes it. One component for every screen that shows pictures large
// (Duschabtrennung, Referenzbilder) — there is no second lightbox.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "../lib/cn.js";

export interface LightboxImage { src: string; label: string }

export function Lightbox({ images, start, onClose, testId = "lightbox" }: { images: LightboxImage[]; start: number; onClose: () => void; testId?: string }) {
  const [at, setAt] = useState(start);
  const touch = useRef<number | null>(null);
  const many = images.length > 1;
  const show = (i: number) => setAt((i + images.length) % images.length);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []); // the keys go to the dialog while it is open
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowLeft") show(at - 1); else if (e.key === "ArrowRight") show(at + 1); };
  const im = images[at]!;
  const nav = "absolute top-1/2 grid size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-white/90 text-2xl text-black";
  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKey} role="dialog" aria-modal="true" aria-label="Bilder" data-testid={testId} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 outline-none" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { touch.current = e.touches[0]!.clientX; }}
      onTouchEnd={(e) => { if (touch.current == null || !many) return; const dx = e.changedTouches[0]!.clientX - touch.current; touch.current = null; if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1)); }}>
      <img src={im.src} alt={im.label} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
      <p data-part="caption" className="absolute inset-x-0 bottom-4 m-0 px-4 text-center text-white">{`${many ? `${at + 1} / ${images.length} · ` : ""}${im.label}`}</p>
      <button type="button" aria-label="Schließen" onClick={onClose} className="absolute right-4 top-4 grid size-12 cursor-pointer place-items-center rounded-full border-0 bg-white/90 text-2xl text-black">×</button>
      {many ? <><button type="button" aria-label="Vorheriges Bild" onClick={() => show(at - 1)} className={cn(nav, "left-3")}>‹</button><button type="button" aria-label="Nächstes Bild" onClick={() => show(at + 1)} className={cn(nav, "right-3")}>›</button></> : null}
    </div>
  );
}
