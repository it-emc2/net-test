// The drawing area of a signature: finger, pen and mouse through pointer events (today's page:
// separate mouse and touch handlers). Black 2.5 px line on white, sized to the screen's pixel
// ratio; the picture is handed out as a PNG data URL, as today. The shared sketch pad
// (shared/ui/sketch-pad.tsx) is a drawing tool with colours, rulers and an undo list — a
// signature needs none of that, so this is its own small component.
import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface PadHandle {
  clear(): void;
  isDirty(): boolean;
  toPng(): string;
  setFromDataUrl(dataUrl: string): void;
}

export const SignaturePad = forwardRef<PadHandle, { id: string; label: string }>(function SignaturePad({ id, label }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const ctx = () => { try { return canvas.current?.getContext("2d") ?? null; } catch { return null; } };
  const pen = (c: CanvasRenderingContext2D) => { c.lineWidth = 2.5; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#111"; };
  /** the canvas gets the size it is shown at (times the pixel ratio); a signature already drawn is kept */
  const fit = () => {
    const c = canvas.current, g = ctx();
    if (!c || !g) return;
    const rect = c.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    if (!rect.width) return;
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (c.width === w && c.height === h) return;
    let keep: string | null = null;
    if (dirty.current) { try { keep = c.toDataURL(); } catch { keep = null; } }
    c.width = w; c.height = h;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    pen(g);
    if (keep) draw(keep, false);
  };
  const draw = (dataUrl: string, markDirty: boolean) => {
    const c = canvas.current;
    if (!c) return;
    const img = new Image();
    img.onload = () => {
      const g = ctx(), rect = c.getBoundingClientRect();
      if (!g) return;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, rect.width || c.width, rect.height || c.height);
      if (markDirty) dirty.current = true;
    };
    img.src = dataUrl;
    if (markDirty) dirty.current = true; // pasted: counts as signed at once (the picture follows)
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    fit();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => { const c = canvas.current, g = ctx(); if (c && g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore(); } dirty.current = false; },
    isDirty: () => dirty.current,
    toPng: () => { try { return canvas.current?.toDataURL("image/png") ?? ""; } catch { return ""; } },
    setFromDataUrl: (dataUrl: string) => draw(dataUrl, true),
  }));

  const pos = (e: ReactPointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not every pointer can be captured */ }
    fit();
    last.current = pos(e);
  };
  const move = (e: ReactPointerEvent) => {
    const from = last.current, g = ctx();
    if (!from || !g) return;
    e.preventDefault();
    const p = pos(e);
    pen(g);
    g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(p.x, p.y); g.stroke();
    last.current = p;
    dirty.current = true;
  };
  const up = () => { last.current = null; };

  return (
    <canvas
      ref={canvas} id={id} role="img" aria-label={label}
      className="block h-[170px] w-full cursor-crosshair touch-none select-none border border-black bg-white"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
    />
  );
});
