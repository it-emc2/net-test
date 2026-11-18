// The drawings of the Wanne picker — today's src/public/configurator/wanne-sketch.js, unchanged:
// our own axonometric drawing of the tub, the walls that define the installation, the entry
// door and, optionally, the glass screen (Aufsatz). Same look and projection as the Duschabtrennung
// drawings (classes bs-…, styled in styles.css). The view is mirrored when the corner wall is on
// the right, so the corner wall always stands at the far end. Pure functions.
type P3 = [number, number, number];
interface Item { pts?: P3[]; line?: [P3, P3]; text?: string; at?: P3; cls: string }
export interface ScreenSpec { side: string; kind: string; h?: number; panel?: boolean }
export interface WanneSpec {
  einbau: string; wall: string | null; door: string | null; screen: ScreenSpec | null;
  L?: number; Wd?: number; H?: number; label?: string;
}

const H_WALL = 105; // cm, drawn wall height (low, so the tub stays the hero)
const DOOR_W = 55; // cm, entry door width (Steinkamp easy entry)
const DOOR_Y0 = 19.5; // cm, entry height above the floor
const FREE = 34; // cm, open floor drawn beyond an open end of the tub

const AX = [0.95, 0.3] as const;
const AZ = [-0.62, 0.42] as const;
const proj = (x: number, y: number, z: number): [number, number] => [x * AX[0] + z * AZ[0], x * AX[1] + z * AZ[1] - y];
const flip = (s: string | null) => (s === "links" ? "rechts" : s === "rechts" ? "links" : s);

export function wanneSketchSVG(spec: WanneSpec | null, { open = 0, small = false } = {}): string {
  if (!spec) return "";
  const L = spec.L || 170, Wd = spec.Wd || 75, H = spec.H || 58;
  const einbau = spec.einbau || "ecke";
  const mirror = einbau === "ecke" && spec.wall === "rechts";
  const door = mirror ? flip(spec.door) : spec.door;
  const sc = spec.screen ? { ...spec.screen, side: mirror ? flip(spec.screen.side)! : spec.screen.side } : null;
  const D = Wd + 22;
  let a = 0, b = L, W = L + FREE;
  if (einbau === "nische") W = L;
  if (einbau === "vorwand") { a = FREE * 0.7; b = a + L; W = b + FREE * 0.7; }
  const o = Math.max(0, Math.min(1, open));
  const items: Item[] = [];
  const poly = (pts: P3[], cls: string) => items.push({ pts, cls });
  const line = (p: P3, q: P3, cls: string) => items.push({ line: [p, q], cls });
  const text = (t: string, at: P3, cls: string) => items.push({ text: t, at, cls });
  const wallX = (x: number, cls = "w") => poly([[x, 0, 0], [x, 0, D], [x, H_WALL, D], [x, H_WALL, 0]], cls);
  const pane = (p: [number, number], q: [number, number], y0: number, y1: number, cls: string) =>
    poly([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], cls);
  const swing = (hx: number, zf: number, dir: number, w: number, deg: number, y0: number, y1: number, cls: string, inward = false): [number, number] => {
    const th = (deg * Math.PI) / 180;
    const end: [number, number] = [hx + dir * w * Math.cos(th), zf + (inward ? -1 : 1) * w * Math.sin(th)];
    pane([hx, zf], end, y0, y1, cls);
    return end;
  };

  poly([[-18, 0, -6], [W + 18, 0, -6], [W + 18, 0, D + 30], [-18, 0, D + 30]], "fl");
  poly([[0, 0, 0], [W, 0, 0], [W, H_WALL, 0], [0, H_WALL, 0]], "w");
  if (einbau !== "vorwand") wallX(0);

  poly([[a, H, 0], [b, H, 0], [b, H, Wd], [a, H, Wd]], "tb");
  poly([[a + 7, H, 7], [b - 7, H, 7], [b - 7, H, Wd - 7], [a + 7, H, Wd - 7]], "tbi");
  const front = (x0: number, x1: number, y0 = 0, y1 = H) => poly([[x0, y0, Wd], [x1, y0, Wd], [x1, y1, Wd], [x0, y1, Wd]], "tb");

  if (door) {
    const left = door === "links";
    const d0 = left ? a + 12 : b - 12 - DOOR_W;
    pane([d0, Wd - 1], [d0 + DOOR_W, Wd - 1], DOOR_Y0, H, "op");
    const hx = left ? d0 : d0 + DOOR_W;
    const end = swing(hx, Wd, left ? 1 : -1, DOOR_W, o * 72, DOOR_Y0, H, "g gd", true);
    if (!small) {
      const at = (y: number): P3 => [hx + (end[0] - hx) * 0.85, y, Wd + (end[1] - Wd) * 0.85];
      line(at(DOOR_Y0 + 14), at(DOOR_Y0 + 30), "hd");
    }
    front(a, d0);
    front(d0 + DOOR_W, b);
    front(d0, d0 + DOOR_W, 0, DOOR_Y0);
  } else {
    front(a, b);
  }
  poly([[b, 0, 0], [b, 0, Wd], [b, H, Wd], [b, H, 0]], "tb");

  if (sc) {
    const sh = sc.h || 140, y1 = H + sh, zf = Wd - 3;
    const left = sc.side === "links";
    const hx = left ? a : b, dir = left ? 1 : -1;
    if (sc.kind === "pendel") {
      swing(hx, zf, dir, 88, o * 70, H, y1, "g gd");
    } else {
      const [F, LW] = sc.kind === "falt" ? [53, 44] : [24, 60];
      pane([hx, zf], [hx + dir * F, zf], H, y1, "g");
      const iris = sc.kind !== "falt";
      swing(hx + dir * F, zf, dir, LW, o * (iris ? 95 : 80), H, y1, "g gd", iris);
      if (sc.panel) pane([hx + dir * 3, 4], [hx + dir * 3, zf], H, y1, "g");
    }
    if (!small) text(`Höhe ${sh} cm`, [hx + dir * 45, y1 + 8, zf], "dim");
  }

  if (einbau === "nische") wallX(W, "w wb");
  if (!small) text(spec.label || `${L} × ${Wd} cm`, [(a + b) / 2, 0, Wd + 22], "dim");
  return render(items, small, mirror);
}

function render(items: Item[], small: boolean, mirror: boolean): string {
  const pr = (p: P3): [number, number] => { const q = proj(...p); return mirror ? [-q[0], q[1]] : q; };
  const all = items.flatMap((it) => it.pts || it.line || [it.at!]).map(pr);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const vw = small ? 160 : 520, vh = small ? 130 : 380, m = small ? 8 : 22;
  const s = Math.min((vw - 2 * m) / (maxX - minX), (vh - 2 * m) / (maxY - minY));
  const ox = (vw - (maxX - minX) * s) / 2 - minX * s;
  const oy = (vh - (maxY - minY) * s) / 2 - minY * s;
  const P = (p: P3) => { const q = pr(p); return [(ox + q[0] * s).toFixed(1), (oy + q[1] * s).toFixed(1)]; };
  let out = "";
  for (const it of items) {
    if (it.pts) out += `<polygon class="bs-${it.cls.split(" ").join(" bs-")}" points="${it.pts.map((p) => P(p).join(",")).join(" ")}"/>`;
    else if (it.line) { const [a, b] = it.line.map(P); out += `<line class="bs-${it.cls}" x1="${a![0]}" y1="${a![1]}" x2="${b![0]}" y2="${b![1]}"/>`; }
    else { const [x, y] = P(it.at!); out += `<text class="bs-${it.cls}" x="${x}" y="${y}">${it.text}</text>`; }
  }
  return `<svg class="bs${small ? " bs-small" : ""}" viewBox="0 0 ${vw} ${vh}" role="img" aria-hidden="${small}">${out}</svg>`;
}
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
