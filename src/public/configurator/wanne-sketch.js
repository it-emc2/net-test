// wanne-sketch.js — drawings for the Wanne picker (Optional tab → Wanne).
// Same look and projection as the Duschabtrennung sketches (badolux-sketch.js):
// our own axonometric drawing of the tub, the walls that define the
// installation (corner / niche / wall-mount), the entry door and, optionally,
// the glass screen. Door and screen swing open on hover or tap.
//
// Every tub we sell has its entry door at the WALL end: Megabad lists
// Steinkamp "Einbau Ecke links" with "Glastür links" and the side apron on the
// RIGHT (the open end); Novellini Iris "li" with 2 aprons = front + right end.
// So the drawing is built once with door + wall on the left and mirrored for
// "rechts" — the corner wall then always stands at the far end of the view and
// never covers the tub. Pure functions apart from attachWanneSketch().

const H_WALL = 105; // cm, drawn wall height (low, so the tub stays the hero)
const DOOR_W = 55; // cm, entry door width (Steinkamp easy entry)
const DOOR_Y0 = 19.5; // cm, entry height above the floor
const VORWAND = 20; // cm, depth of the installation wall
const FREE = 34; // cm, open floor drawn beyond the open end of the tub

// View from front-left like the Duschabtrennung drawings.
const AX = [0.95, 0.3];
const AZ = [-0.62, 0.42];
const proj = (x, y, z) => [x * AX[0] + z * AZ[0], x * AX[1] + z * AZ[1] - y];

/**
 * spec = { einbau: "ecke"|"nische"|"vorwand", side: "links"|"rechts",
 *          screen: bool, L, Wd, H, screenH, label }
 */
export function wanneSketchSVG(spec, { open = 0, small = false } = {}) {
  if (!spec) return "";
  const L = spec.L || 170, Wd = spec.Wd || 75, H = spec.H || 58;
  const einbau = spec.einbau || "ecke";
  const vor = einbau === "vorwand" ? VORWAND : 0;
  const D = Wd + 22;
  const W = einbau === "nische" ? L : L + FREE; // tub runs x = 0..L, wall at x = 0
  const o = Math.max(0, Math.min(1, open));
  const items = [];
  const poly = (pts, cls) => items.push({ pts, cls });
  const line = (p, q, cls) => items.push({ line: [p, q], cls });
  const text = (t, at, cls) => items.push({ text: t, at, cls });
  const wallX = (x, cls = "w") => poly([[x, 0, -vor], [x, 0, D], [x, H_WALL, D], [x, H_WALL, -vor]], cls);
  const pane = (p, q, y0, y1, cls) =>
    poly([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], cls);

  poly([[-18, 0, -vor - 6], [W + 18, 0, -vor - 6], [W + 18, 0, D + 30], [-18, 0, D + 30]], "fl");
  poly([[0, 0, -vor], [W, 0, -vor], [W, H_WALL, -vor], [0, H_WALL, -vor]], "w");
  wallX(0); // the corner wall, at the door end

  if (vor) {
    const vh = 95;
    poly([[0, vh, -vor], [L, vh, -vor], [L, vh, 0], [0, vh, 0]], "vw");
    poly([[0, 0, 0], [L, 0, 0], [L, vh, 0], [0, vh, 0]], "vw");
  }

  // tub: rim, basin, front apron, open end (the open end faces the viewer)
  poly([[0, H, 0], [L, H, 0], [L, H, Wd], [0, H, Wd]], "tb");
  poly([[7, H, 7], [L - 7, H, 7], [L - 7, H, Wd - 7], [7, H, Wd - 7]], "tbi");
  poly([[0, 0, Wd], [L, 0, Wd], [L, H, Wd], [0, H, Wd]], "tb");
  poly([[L, 0, 0], [L, 0, Wd], [L, H, Wd], [L, H, 0]], "tb");

  // entry door in the front, next to the wall; hinged on the wall side,
  // swings out into the room
  const d0 = 12;
  pane([d0, Wd], [d0 + DOOR_W, Wd], DOOR_Y0, H, "op");
  const th = (o * 78 * Math.PI) / 180;
  const free = [d0 + DOOR_W * Math.cos(th), Wd + DOOR_W * Math.sin(th)];
  pane([d0, Wd], free, DOOR_Y0, H, "g gd");
  if (!small) {
    const at = (y) => [d0 + (free[0] - d0) * 0.85, y, Wd + (free[1] - Wd) * 0.85];
    line(at(DOOR_Y0 + 14), at(DOOR_Y0 + 30), "hd");
  }

  if (spec.screen) {
    // glass screen on the rim at the wall end: fixed part + folding leaf
    const sh = spec.screenH || 140, y1 = H + sh, zf = Wd - 3;
    const F = Math.min(60, L * 0.36), LW = 40;
    pane([0, zf], [F, zf], H, y1, "g");
    const ts = (o * 85 * Math.PI) / 180;
    pane([F, zf], [F + LW * Math.cos(ts), zf + LW * Math.sin(ts)], H, y1, "g gd");
    if (!small) text(`Höhe ${sh} cm`, [F / 2, y1 + 8, zf], "dim");
  }

  // niche: the second wall stands between viewer and tub → faint, drawn last
  if (einbau === "nische") wallX(W, "w wb");

  if (!small) text(spec.label || `${L} × ${Wd} cm`, [L / 2, 0, Wd + 22], "dim");
  return render(items, small, spec.side === "rechts");
}

// Same output as badolux-sketch.js render(), plus `mirror` (view from the
// front-right) so the right-hand variant is a true mirror image.
function render(items, small, mirror) {
  const pr = (p) => { const q = proj(...p); return mirror ? [-q[0], q[1]] : q; };
  const all = items.flatMap((it) => it.pts || it.line || [it.at]).map(pr);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const vw = small ? 160 : 520, vh = small ? 130 : 380, m = small ? 8 : 22;
  const s = Math.min((vw - 2 * m) / (maxX - minX), (vh - 2 * m) / (maxY - minY));
  const ox = (vw - (maxX - minX) * s) / 2 - minX * s;
  const oy = (vh - (maxY - minY) * s) / 2 - minY * s;
  const P = (p) => { const q = pr(p); return [(ox + q[0] * s).toFixed(1), (oy + q[1] * s).toFixed(1)]; };
  let out = "";
  for (const it of items) {
    if (it.pts) out += `<polygon class="bs-${it.cls.split(" ").join(" bs-")}" points="${it.pts.map((p) => P(p).join(",")).join(" ")}"/>`;
    else if (it.line) { const [a, b] = it.line.map(P); out += `<line class="bs-${it.cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`; }
    else { const [x, y] = P(it.at); out += `<text class="bs-${it.cls}" x="${x}" y="${y}">${it.text}</text>`; }
  }
  return `<svg class="bs${small ? " bs-small" : ""}" viewBox="0 0 ${vw} ${vh}" role="img" aria-hidden="${small}">${out}</svg>`;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Draws getSpec() into `el`; door/screen open on hover (mouse over `host`,
 *  default `el`) or on tap of `el` itself; honours reduced motion. */
export function attachWanneSketch(el, getSpec, { small = false, host = null } = {}) {
  const ev = host || el;
  const draw = (o) => { el.innerHTML = wanneSketchSVG(getSpec(), { open: o, small }); };
  draw(0);
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let raf = 0, cur = 0, target = 0, last = 0;
  const step = (t) => {
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    const d = target - cur;
    cur += Math.sign(d) * Math.min(Math.abs(d), dt / 650);
    draw(easeInOut(cur));
    if (cur !== target) raf = requestAnimationFrame(step);
    else { raf = 0; last = 0; }
  };
  const go = (to) => {
    target = to;
    if (reduce) { cur = to; draw(to); return; }
    if (!raf) raf = requestAnimationFrame(step);
    // rAF is paused in background tabs — land on the end state anyway
    setTimeout(() => { if (cur !== target) { cancelAnimationFrame(raf); raf = 0; cur = target; draw(target); } }, 1500);
  };
  ev.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") go(1); });
  ev.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") go(0); });
  if (!host) el.addEventListener("click", () => go(target ? 0 : 1)); // tap on the iPad
  return { redraw: () => draw(easeInOut(cur)) };
}
