// The sketch pad ("Projekt-Skizze") — today's src/public/DrawingPadManager.js as a component:
// pen, eraser, line, ruler, undo, three stroke widths, six colours, clear. What is drawn is a
// list of operations; the pad hands back that list as JSON text plus the picture (PNG), which
// is what the offer stores. Positions are CSS pixels from the canvas' top-left corner.
import { Eraser, Pen, Ruler, Slash, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./button.js";
import { cn } from "../lib/cn.js";

export interface Point { x: number; y: number }
export type Tool = "pen" | "eraser" | "line" | "ruler";
export type Op =
  | { type: "stroke"; tool: string; color: string; size: number; points: Point[] }
  | { type: "line" | "ruler"; color: string; size: number; from: Point; to: Point }
  | { type: "image"; dataUrl: string };
export interface Sketch { json: string; dataUrl: string }

export const TOOLS: readonly { tool: Tool; label: string }[] = [{ tool: "pen", label: "Stift" }, { tool: "eraser", label: "Radierer" }, { tool: "line", label: "Linie" }, { tool: "ruler", label: "Lineal" }];
export const SIZES: readonly { size: number; text: string; label: string }[] = [{ size: 2, text: "S", label: "Klein" }, { size: 4, text: "M", label: "Mittel" }, { size: 7, text: "L", label: "Groß" }];
export const COLORS: readonly { color: string; label: string }[] = [
  { color: "#0f172a", label: "Dunkel" }, { color: "#dc2626", label: "Rot" }, { color: "#2563eb", label: "Blau" }, { color: "#16a34a", label: "Grün" }, { color: "#d97706", label: "Orange" }, { color: "#7c3aed", label: "Lila" },
];
const ICON = { pen: Pen, eraser: Eraser, line: Slash, ruler: Ruler } as const;

/** the operations of a stored sketch; a sketch stored as a picture only is one picture operation */
export function opsOf(saved: Partial<Sketch> | null | undefined): Op[] {
  if (saved?.json) {
    try { const ops = (JSON.parse(saved.json) as { ops?: unknown }).ops; if (Array.isArray(ops) && ops.length) return ops as Op[]; } catch { /* not readable: the picture, if there is one */ }
  }
  return saved?.dataUrl ? [{ type: "image", dataUrl: saved.dataUrl }] : [];
}
export const hasSketch = (saved: Partial<Sketch> | null | undefined): boolean => opsOf(saved).length > 0;
const jsonOf = (ops: readonly Op[]) => JSON.stringify({ version: 1, ops });

type Ctx = CanvasRenderingContext2D;
function drawOp(ctx: Ctx, op: Op) {
  if (op.type === "image") return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = op.size || 4;
  if (op.type === "stroke") {
    const eraser = op.tool === "eraser";
    ctx.strokeStyle = eraser ? "#ffffff" : op.color || "#111827";
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    const [first, ...rest] = op.points;
    if (first) {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const p of rest) ctx.lineTo(p.x, p.y);
      if (!rest.length) ctx.lineTo(first.x + 0.01, first.y + 0.01); // a dot
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = op.color || "#111827";
    ctx.beginPath();
    ctx.moveTo(op.from.x, op.from.y);
    ctx.lineTo(op.to.x, op.to.y);
    ctx.stroke();
    if (op.type === "ruler") { // the length in pixels above the middle
      ctx.fillStyle = op.color || "#111827";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${Math.round(Math.hypot(op.to.x - op.from.x, op.to.y - op.from.y))}px`, (op.from.x + op.to.x) / 2, (op.from.y + op.to.y) / 2 - 8);
    }
  }
  ctx.restore();
}
const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });

export function SketchPad({ value, onChange }: { value: Partial<Sketch> | null | undefined; onChange: (next: Sketch) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ops, setOps] = useState<Op[]>(() => opsOf(value));
  const [tool, setToolState] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]!.color);
  const [size, setSize] = useState(4);
  /** what is being drawn: a stroke while the pointer is down, or a line / ruler after its first tap */
  const live = useRef<{ stroke?: Extract<Op, { type: "stroke" }>; from?: Point } >({});
  const opsRef = useRef(ops);
  opsRef.current = ops;

  const context = (): Ctx | null => { try { return canvas.current?.getContext("2d") ?? null; } catch { return null; } };
  /** the canvas has the size it is shown at, times the screen's pixel ratio */
  const fit = () => {
    const c = canvas.current;
    if (!c) return;
    const rect = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(Math.max(1, Math.floor(rect.width || 1)) * dpr)), h = Math.max(1, Math.floor(Math.max(1, Math.floor(rect.height || 1)) * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    context()?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  /** everything again: stored pictures first, then the operations, then the line being placed */
  const paint = async (list: readonly Op[], preview?: Op) => {
    const c = canvas.current, ctx = context();
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const op of list) {
      if (op.type !== "image") continue;
      const img = await loadImage(op.dataUrl);
      if (!img) continue;
      const rect = c.getBoundingClientRect(), cw = Math.max(1, rect.width || c.width), ch = Math.max(1, rect.height || c.height), s = Math.min(cw / img.width, ch / img.height);
      ctx.drawImage(img, (cw - img.width * s) / 2, (ch - img.height * s) / 2, img.width * s, img.height * s);
    }
    for (const op of list) drawOp(ctx, op);
    if (preview) { ctx.save(); ctx.globalAlpha = 0.65; drawOp(ctx, preview); ctx.restore(); }
  };
  /** the sketch changed: drawn again and handed back as operations and picture */
  const commit = (next: Op[]) => {
    live.current = {};
    setOps(next);
    void paint(next).then(() => {
      let dataUrl = "";
      if (next.length) { try { dataUrl = canvas.current?.toDataURL("image/png") ?? ""; } catch { dataUrl = ""; } }
      onChange({ json: jsonOf(next), dataUrl });
    });
  };

  // the canvas measures itself: drawn once it has a size, and again when the size changes
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    fit();
    void paint(opsRef.current);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => { fit(); void paint(opsRef.current); });
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: ReactPointerEvent): Point => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const setTool = (next: Tool) => { live.current = {}; setToolState(next); void paint(opsRef.current); }; // a line that was started is dropped
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not every pointer can be captured */ }
    fit();
    const p = pos(e);
    if (tool === "line" || tool === "ruler") {
      const from = live.current.from;
      if (!from) { live.current = { from: p }; return; } // first tap: the start; second tap: the end
      commit([...opsRef.current, { type: tool, color, size, from, to: p }]);
      return;
    }
    live.current = { stroke: { type: "stroke", tool, color, size, points: [p] } };
  };
  const move = (e: ReactPointerEvent) => {
    const p = pos(e);
    if (tool === "line" || tool === "ruler") { const from = live.current.from; if (from) void paint(opsRef.current, { type: tool, color, size, from, to: p }); return; }
    const stroke = live.current.stroke;
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1]!;
    stroke.points.push(p);
    const ctx = context();
    if (ctx) drawOp(ctx, { ...stroke, points: [last, p] }); // only the newest piece
  };
  const up = () => { const stroke = live.current.stroke; if (stroke) commit([...opsRef.current, { ...stroke, points: [...stroke.points] }]); };

  const pick = "grid size-12 cursor-pointer place-items-center rounded-lg border-2 text-foreground";
  return (
    <div className="grid gap-3" data-testid="sketch-pad" data-tool={tool}>
      <div className="grid"><strong>Projekt-Skizze</strong><small className="text-muted-foreground">Für kurze Handskizzen direkt im Gespräch mit dem Kunden.</small></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1.5" role="toolbar" aria-label="Skizzenwerkzeuge">
          {TOOLS.map(({ tool: t, label }) => { const Icon = ICON[t]; return <button key={t} type="button" aria-label={label} title={label} aria-pressed={tool === t} onClick={() => setTool(t)} className={cn(pick, tool === t ? "border-primary bg-accent-weak" : "border-input bg-card")}><Icon aria-hidden className="size-5" /></button>; })}
          <button type="button" aria-label="Rückgängig" title="Rückgängig" onClick={() => { if (opsRef.current.length) commit(opsRef.current.slice(0, -1)); }} className={cn(pick, "border-input bg-card")}><Undo2 aria-hidden className="size-5" /></button>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Strichstärke">
          {SIZES.map((s) => <button key={s.size} type="button" title={s.label} aria-label={s.label} aria-pressed={size === s.size} onClick={() => setSize(s.size)} className={cn(pick, "font-semibold", size === s.size ? "border-primary bg-accent-weak" : "border-input bg-card")}>{s.text}</button>)}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Farben">
          {COLORS.map((c) => <button key={c.color} type="button" title={c.label} aria-label={c.label} aria-pressed={color === c.color} data-color={c.color} onClick={() => setColor(c.color)} className={cn(pick, color === c.color ? "border-primary" : "border-input", "bg-card")}><span aria-hidden className="size-7 rounded-full" style={{ background: c.color }} /></button>)}
        </div>
        <Button variant="outline" onClick={() => commit([])}>Skizze löschen</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border-2 border-input bg-white">
        <canvas ref={canvas} width={1200} height={420} aria-label="Zeichenfläche" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          className={cn("block h-[280px] w-full touch-none md:h-[380px]", tool === "eraser" ? "cursor-cell" : "cursor-crosshair")}
          style={{ background: "linear-gradient(#fff, #fff) padding-box, repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(148,163,184,.14) 24px), repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(148,163,184,.14) 24px)" }} />
      </div>
      <p className="m-0 text-[0.9rem] text-muted-foreground">Die Skizze wird zusammen mit dem Entwurf, dem Angebot und beim Draft-Restore gespeichert.</p>
    </div>
  );
}
