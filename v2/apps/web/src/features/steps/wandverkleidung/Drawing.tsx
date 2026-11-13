// The drawing of the wall calculator: the walls in a slightly turned view with the plates on
// them, as today's UI draws it (same geometry). Display only — the numbers come from the plan.
import { fmtCm, wallsOf, type Piece, type Plan, type Situation, type WallKey } from "./calc.js";

export const TONES = [
  { letter: "A", solid: "#b06a32", wash: "rgba(176,106,50,0.16)" },
  { letter: "B", solid: "#54748f", wash: "rgba(84,116,143,0.16)" },
  { letter: "C", solid: "#5f8a5f", wash: "rgba(95,138,95,0.16)" },
] as const;
const PREVIEW_CM: Record<WallKey, number> = { links: 120, back: 180, rechts: 120 }; // drawn while empty
const DRAW_H = 200; // drawn wall height
const PANEL_H = 255; // the scale of the cladding height, as today
const AX = [0.9, 0.12] as const; // screen offset per cm along the back wall
const DEPTH = [-0.55, 0.32] as const; // screen offset per cm towards the viewer
const VIEW = { w: 560, h: 320 };
type Pt = [number, number];
const pts = (arr: Pt[]) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const signedArea = (poly: Pt[]) => poly.reduce((a, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length]!; return a + x1 * y2 - x2 * y1; }, 0) / 2;

export function Drawing({ situation, widths, plan, room, texture, onWall }: {
  situation: Situation; widths: Record<WallKey, number>; plan: Plan; room: boolean;
  /** the picture of the decor on a wall ("" = none) */
  texture: (wall: WallKey) => string; onWall: (wall: WallKey) => void;
}) {
  const walls = wallsOf(situation);
  const drawn = Object.fromEntries(walls.map((k) => [k, Math.max(40, widths[k] > 0 ? widths[k] : PREVIEW_CM[k])])) as Partial<Record<WallKey, number>>;
  const W = drawn.back ?? 0, sideL = drawn.links ?? 0, sideR = drawn.rechts ?? 0;
  const D = Math.max(sideL, sideR, 100);
  const toXYZ: Record<WallKey, (p: number, y: number) => [number, number, number]> = { links: (p, y) => [0, y, sideL - p], back: (p, y) => [p, y, 0], rechts: (p, y) => [W, y, p] };
  const project = (x: number, y: number, z: number, cam: { ox: number; oy: number; s: number }): Pt => [cam.ox + cam.s * (x * AX[0] + z * DEPTH[0]), cam.oy + cam.s * (-y + x * AX[1] + z * DEPTH[1])];
  const corners: [number, number, number][] = [[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D], [0, DRAW_H, 0], [W, DRAW_H, 0], [0, DRAW_H, sideL], [W, DRAW_H, sideR]];
  const margin = walls.length > 1 ? 74 : 16; // room for the labels of the side walls
  const raw = corners.map(([x, y, z]) => project(x, y, z, { ox: 0, oy: 0, s: 1 }));
  const minX = Math.min(...raw.map((p) => p[0])), maxX = Math.max(...raw.map((p) => p[0])), minY = Math.min(...raw.map((p) => p[1])), maxY = Math.max(...raw.map((p) => p[1]));
  const s = Math.min((VIEW.w - 2 * margin) / (maxX - minX), (VIEW.h - 24) / (maxY - minY), 1.25);
  const cam = { s, ox: (VIEW.w - (maxX - minX) * s) / 2 - minX * s, oy: (VIEW.h - (maxY - minY) * s) / 2 - minY * s };
  const P = (wall: WallKey, p: number, y: number) => project(...toXYZ[wall](p, y), cam);
  const quad = (wall: WallKey, a: number, b: number, h = DRAW_H): Pt[] => [P(wall, a, 0), P(wall, b, 0), P(wall, b, h), P(wall, a, h)];
  const PH = (DRAW_H * Math.min(plan.heightCm || PANEL_H, PANEL_H)) / PANEL_H; // the plates cover the wall up to the cladding height
  const order = [...walls].sort((a, b) => (a === "back" ? -1 : b === "back" ? 1 : 0)); // back wall first, the side walls over it
  const frontSign = Math.sign(signedArea(quad("back", 0, W)));
  const labels: Record<"left" | "right" | "inline", { c: Pt; pc: Piece; i: number }[]> = { left: [], right: [], inline: [] };
  for (const key of order) for (const pc of plan.pieces.filter((p) => p.key === key)) labels[key === "back" ? "inline" : key === "links" ? "left" : "right"].push({ c: P(key, pc.start + pc.breite / 2, PH * 0.52), pc, i: walls.indexOf(key) });
  const pill = (x: number, y: number, pc: Piece, i: number, k: string) => (
    <g key={k} data-testid="kc-mark">
      <rect x={x - 22} y={y - 9} width={44} height={18} rx={9} fill="var(--card)" stroke={TONES[i]!.solid} />
      <circle cx={x - 12} cy={y} r={6} fill={TONES[i]!.solid} />
      <text x={x - 12} y={y + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">{pc.platte}</text>
      <text x={x + 7} y={y + 3.5} textAnchor="middle" fontSize={9} fill="var(--foreground)">{fmtCm(pc.breite)}</text>
    </g>
  );
  const hk: WallKey = walls.includes("back") ? "back" : walls[0]!;
  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Aufteilung der Paneele" className="h-auto w-full rounded-lg border-2 border-border bg-card" data-testid="kc-svg" data-room={room} data-empty={plan.gesamt === 0}>
      <defs>
        {plan.pieces.map((pc, n) => {
          const tex = texture(pc.key);
          if (!tex) return null;
          const o = P(pc.key, pc.start, DRAW_H), u = P(pc.key, pc.start + 1, DRAW_H), v = P(pc.key, pc.start, DRAW_H - 1);
          const m = [u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]].map((x) => x.toFixed(4)).join(" ");
          return <pattern key={n} id={`kcTex${n}`} patternUnits="userSpaceOnUse" width={pc.size} height={DRAW_H} patternTransform={`matrix(${m})`}><image href={tex} width={pc.size} height={DRAW_H} preserveAspectRatio="none" /></pattern>;
        })}
      </defs>
      <polygon points={pts(([[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D]] as [number, number, number][]).map(([x, y, z]) => project(x, y, z, cam)))} fill={room ? "#e9e4da" : "var(--muted)"} stroke="var(--border)" />
      {room ? Array.from({ length: Math.max(0, Math.ceil(W / 30) - 1) }, (_, n) => (n + 1) * 30).map((x) => { const a = project(x, 0, 0, cam), b = project(x, 0, D, cam); return <line key={`x${x}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#d5cfc3" strokeWidth={0.6} />; }) : null}
      {room ? Array.from({ length: Math.max(0, Math.ceil(D / 30) - 1) }, (_, n) => (n + 1) * 30).map((z) => { const a = project(0, 0, z, cam), b = project(W, 0, z, cam); return <line key={`z${z}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#d5cfc3" strokeWidth={0.6} />; }) : null}
      {order.map((key) => {
        const i = walls.indexOf(key), tone = TONES[i]!, len = drawn[key]!;
        const base = quad(key, 0, len);
        const seeThrough = Math.sign(signedArea(base)) !== frontSign; // a side wall seen from behind
        const top = P(key, len / 2, DRAW_H * 0.9);
        return (
          <g key={key} onClick={() => onWall(key)} className="cursor-pointer" opacity={seeThrough ? 0.55 : 1}>
            <polygon points={pts(base)} fill={room ? "#f4f1ea" : tone.wash} stroke={room ? "#cfc8ba" : tone.solid} />
            {room ? <polygon points={pts(quad(key, 0, len, 8))} fill="#d8d2c6" /> : null}
            {plan.pieces.filter((p) => p.key === key).map((pc) => {
              const n = plan.pieces.indexOf(pc), tex = texture(key);
              const a = P(key, pc.start, 0), b = P(key, pc.start, PH);
              return (
                <g key={n}>
                  <polygon data-testid="kc-piece" data-plate={pc.platte} data-cut={pc.zuschnitt} data-textured={!!tex} points={pts(quad(key, pc.start, pc.start + pc.breite, PH))}
                    fill={tex ? `url(#kcTex${n})` : tone.wash} stroke={tone.solid} strokeWidth={1} strokeDasharray={pc.zuschnitt ? "5 3" : undefined} />
                  {pc.start > 0.5 ? <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={tone.solid} strokeWidth={1.2} /> : null}
                </g>
              );
            })}
            <g data-testid="kc-badge"><circle cx={top[0]} cy={top[1]} r={9} fill={tone.solid} /><text x={top[0]} y={top[1] + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{tone.letter}</text></g>
          </g>
        );
      })}
      {room && plan.heightCm ? (() => {
        const l = P(hk, 0, PH), r = P(hk, drawn[hk]!, PH), m = P(hk, drawn[hk]! / 2, PH + 9);
        return <><line x1={l[0]} y1={l[1]} x2={r[0]} y2={r[1]} stroke="var(--foreground)" strokeDasharray="4 3" /><text data-testid="kc-hlabel" x={m[0]} y={m[1]} textAnchor="middle" fontSize={10} fill="var(--foreground)">Wandverkleidung bis {fmtCm(plan.heightCm)} cm</text></>;
      })() : null}
      {labels.inline.map((l, n) => pill(l.c[0], l.c[1], l.pc, l.i, `i${n}`))}
      {(["left", "right"] as const).flatMap((bucket) => {
        const x = bucket === "left" ? 26 : VIEW.w - 26;
        const list = [...labels[bucket]].sort((a, b) => a.c[1] - b.c[1]);
        const y0 = VIEW.h / 2 - ((list.length - 1) * 22) / 2;
        return list.map((l, n) => { const y = y0 + n * 22; return <g key={`${bucket}${n}`}><line x1={bucket === "left" ? x + 22 : x - 22} y1={y} x2={l.c[0]} y2={l.c[1]} stroke={TONES[l.i]!.solid} strokeWidth={0.8} />{pill(x, y, l.pc, l.i, "p")}</g>; });
      })}
    </svg>
  );
}
