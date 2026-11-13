// The drawing of the shower curtain — today's src/public/configurator/vorhang.js (drawSvg),
// unchanged: the same axonometric view as the wall calculator. Everything is drawn at its real
// length (preview lengths while a side is empty) and fitted into the stage. Our own SVG markup
// (classes vhc-…, styled in styles.css).
import { SHAPES, legValues, planParts, type Catalog, type Leg, type Shape, type State } from "./plan.js";

type P2 = [number, number];
export const TONES = ["#b06a32", "#54748f", "#5f8a5f"]; // side 1, 2, 3 — as in the wall calculator
const PREVIEW_CM: Record<Shape, number[]> = { nische: [120], ecke: [90, 90], u: [90, 120, 90] };
const WALL_H = 150, ROD_Y = 140, HEM_Y = 12, DEFAULT_DEPTH = 90; // drawn heights, stylised
const AX: P2 = [0.9, 0.12], DEPTH: P2 = [-0.55, 0.32];
const VIEW = { w: 460, h: 320 };

/** walls, tray and the rod's line for a situation, from the side lengths */
function scene(shape: Shape, L: number[]): { walls: [P2, P2][]; floor: P2[]; rod: P2[] } {
  if (shape === "ecke") { const W = L[0]!, D = L[1]!; return { walls: [[[0, 0], [W, 0]], [[0, 0], [0, D]]], floor: [[0, 0], [W, 0], [W, D], [0, D]], rod: [[0, D], [W, D], [W, 0]] }; }
  if (shape === "u") { const dl = L[0]!, W = L[1]!, dr = L[2]!; return { walls: [[[0, 0], [W, 0]]], floor: [[0, 0], [W, 0], [W, dr], [0, dl]], rod: [[0, 0], [0, dl], [W, dr], [W, 0]] }; }
  const W = L[0]!, D = DEFAULT_DEPTH;
  return { walls: [[[0, 0], [W, 0]], [[0, 0], [0, D]], [[W, 0], [W, D]]], floor: [[0, 0], [W, 0], [W, D], [0, D]], rod: [[0, D], [W, D]] };
}

/** SVG markup. `focus`: the side being typed — the others fade. */
export function drawing(shape: Shape, legs: State["legs"], catalog: Catalog | null | undefined, focus: Leg | null = null): string {
  const keys = SHAPES[shape].legs, vals = legValues(shape, legs);
  const L = vals.map((v, i) => Math.max(30, v > 0 ? v : PREVIEW_CM[shape][i]!));
  const rodsPerLeg = planParts(shape, legs, catalog).rodsPerLeg;
  const sc = scene(shape, L);
  const raw = (x: number, y: number, z: number): P2 => [x * AX[0] + z * DEPTH[0], -y + x * AX[1] + z * DEPTH[1]];
  const all = [...sc.floor, ...sc.walls.flat()].flatMap(([x, z]) => [raw(x, 0, z), raw(x, WALL_H, z)]);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const s = Math.min((VIEW.w - 70) / (maxX - minX), (VIEW.h - 30) / (maxY - minY), 1.6);
  const ox = (VIEW.w - (maxX - minX) * s) / 2 - minX * s, oy = (VIEW.h - (maxY - minY) * s) / 2 - minY * s;
  const P = (x: number, y: number, z: number): P2 => { const [a, b] = raw(x, y, z); return [ox + a * s, oy + b * s]; };
  const pts = (arr: P2[]) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const lerp = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const on = (k: Leg) => (focus === k ? " vhc-on" : "");

  let out = `<polygon class="vhc-floor" points="${pts(sc.floor.map(([x, z]) => P(x, 0, z)))}"/>`;
  for (const [[x1, z1], [x2, z2]] of sc.walls) out += `<polygon class="vhc-wallp" points="${pts([P(x1, 0, z1), P(x2, 0, z2), P(x2, WALL_H, z2), P(x1, WALL_H, z1)])}"/>`;
  const badges: string[] = [];
  for (let i = 0; i < sc.rod.length - 1; i++) {
    const a = sc.rod[i]!, b = sc.rod[i + 1]!, k = keys[i]!, tone = TONES[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // the curtain: one panel per side, a fold about every 12 cm
    let g = `<polygon class="vhc-curtain" style="--tone:${tone}" points="${pts([P(a[0], ROD_Y, a[1]), P(b[0], ROD_Y, b[1]), P(b[0], HEM_Y, b[1]), P(a[0], HEM_Y, a[1])])}"/>`;
    const folds = Math.max(2, Math.round(len / 12));
    for (let f = 1; f < folds; f++) {
      const [x, z] = lerp(a, b, f / folds), t = P(x, ROD_Y - 2, z), u = P(x, HEM_Y + 2, z);
      g += `<line class="vhc-fold" style="--tone:${tone}" x1="${t[0].toFixed(1)}" y1="${t[1].toFixed(1)}" x2="${u[0].toFixed(1)}" y2="${u[1].toFixed(1)}"/>`;
    }
    // the rods: n pieces joined by couplings
    const n = Math.max(1, rodsPerLeg[i] || 0), gap = 5 / Math.max(len, 1);
    for (let j = 0; j < n; j++) {
      const p1 = lerp(a, b, j / n + (j > 0 ? gap : 0)), p2 = lerp(a, b, (j + 1) / n - (j < n - 1 ? gap : 0));
      const q1 = P(p1[0], ROD_Y, p1[1]), q2 = P(p2[0], ROD_Y, p2[1]);
      g += `<line class="vhc-rod" x1="${q1[0].toFixed(1)}" y1="${q1[1].toFixed(1)}" x2="${q2[0].toFixed(1)}" y2="${q2[1].toFixed(1)}"/>`;
    }
    for (let j = 1; j < n; j++) { const [x, z] = lerp(a, b, j / n), c = P(x, ROD_Y, z); g += `<circle class="vhc-joint" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="5.5"/>`; }
    out += `<g class="vhc-seg${on(k)}" data-leg="${k}">${g}</g>`;
    const [mx, mz] = lerp(a, b, 0.5), m = P(mx, ROD_Y * 0.55, mz);
    const txt = vals[i]! > 0 ? `${vals[i]} cm${n > 1 ? ` · ${n}×` : ""}` : "– cm";
    const bw = n > 1 ? 112 : 84;
    badges.push(`<g class="vhc-badge${on(k)}" data-leg="${k}"><rect x="${(m[0] - bw / 2).toFixed(1)}" y="${(m[1] - 15).toFixed(1)}" width="${bw}" height="30" rx="15"/><circle cx="${(m[0] - bw / 2 + 15).toFixed(1)}" cy="${m[1].toFixed(1)}" r="10" style="fill:${tone}"/><text class="vhc-badge-n" x="${(m[0] - bw / 2 + 15).toFixed(1)}" y="${(m[1] + 4).toFixed(1)}">${i + 1}</text><text class="vhc-badge-t" x="${(m[0] + 9).toFixed(1)}" y="${(m[1] + 4.5).toFixed(1)}">${txt}</text></g>`);
  }
  // corners: connecting bend and ceiling support up to the ceiling; ends: wall rosettes
  for (const [x, z] of sc.rod.slice(1, -1)) {
    const c = P(x, ROD_Y, z), top = P(x, WALL_H + 22, z);
    out += `<line class="vhc-support" x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${top[0].toFixed(1)}" y2="${top[1].toFixed(1)}"/><circle class="vhc-corner" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="6.5"/>`;
  }
  for (const [x, z] of [sc.rod[0]!, sc.rod[sc.rod.length - 1]!]) { const c = P(x, ROD_Y, z); out += `<rect class="vhc-rosette" x="${(c[0] - 5).toFixed(1)}" y="${(c[1] - 5).toFixed(1)}" width="10" height="10" rx="2"/>`; }
  const empty = !vals.some((v) => v > 0);
  return `<svg class="vhc-svg${empty ? " vhc-svg--empty" : ""}${focus ? " vhc-has-focus" : ""}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="Ansicht ${SHAPES[shape].label}">${out}${badges.join("")}</svg>`;
}
