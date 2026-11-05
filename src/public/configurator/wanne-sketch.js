// wanne-sketch.js — drawings for the Wanne picker (Optional tab → Wanne).
// Same look and projection as the Duschabtrennung sketches (badolux-sketch.js,
// whose render() draws the SVG): our own axonometric cabin with the tub, the
// walls that define the installation (corner / niche / wall-mount) and the
// entry door resp. glass screen, which swings open on hover or tap.
// Pure functions apart from attachWanneSketch().
import { render } from "./badolux-sketch.js";

const H_WALL = 105; // cm, drawn wall height (low, so the tub stays the hero)
const DOOR_W = 55; // cm, entry door width (Steinkamp easy entry)
const DOOR_Y0 = 19.5; // cm, entry height above the floor
const VORWAND = 20; // cm, depth of the installation wall

/**
 * spec = { einbau: "ecke"|"nische"|"vorwand", side: "links"|"rechts",
 *          mode: "door"|"screen"|"plain", L, Wd, H, screenH, label }
 */
export function wanneSketchSVG(spec, { open = 0, small = false } = {}) {
  if (!spec) return "";
  const L = spec.L || 170, Wd = spec.Wd || 75, H = spec.H || 58;
  const einbau = spec.einbau || "ecke";
  const left = spec.side !== "rechts";
  const vor = einbau === "vorwand" ? VORWAND : 0;
  const D = Wd + 22;
  const free = 34; // open floor next to the tub in a corner situation
  let a = 0, b = L, W = L;
  if (einbau !== "nische") {
    W = L + free;
    // door side left → the wall is at the right end, and the other way round
    if (left) { a = free; b = W; } else { a = 0; b = L; }
  }
  const o = Math.max(0, Math.min(1, open));
  const items = [];
  const poly = (pts, cls) => items.push({ pts, cls });
  const line = (p, q, cls) => items.push({ line: [p, q], cls });
  const text = (t, at, cls) => items.push({ text: t, at, cls });
  const wallX = (x) => poly([[x, 0, -vor], [x, 0, D], [x, H_WALL, D], [x, H_WALL, -vor]], "w");
  const pane = (p, q, y0, y1, cls) =>
    poly([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], cls);

  poly([[-18, 0, -vor - 6], [W + 18, 0, -vor - 6], [W + 18, 0, D + 30], [-18, 0, D + 30]], "fl");
  poly([[0, 0, -vor], [W, 0, -vor], [W, H_WALL, -vor], [0, H_WALL, -vor]], "w"); // back wall first
  if (einbau === "nische") { wallX(0); wallX(W); }
  else wallX(left ? W : 0);

  if (vor) {
    const vh = 95;
    poly([[a, vh, -vor], [b, vh, -vor], [b, vh, 0], [a, vh, 0]], "vw");
    poly([[a, 0, -vor], [a, 0, 0], [a, vh, 0], [a, vh, -vor]], "vw");
    poly([[a, 0, 0], [b, 0, 0], [b, vh, 0], [a, vh, 0]], "vw");
  }

  // tub: rim, basin, end face, front apron
  poly([[a, H, 0], [b, H, 0], [b, H, Wd], [a, H, Wd]], "tb");
  poly([[a + 7, H, 7], [b - 7, H, 7], [b - 7, H, Wd - 7], [a + 7, H, Wd - 7]], "tbi");
  poly([[a, 0, 0], [a, 0, Wd], [a, H, Wd], [a, H, 0]], "tb");
  poly([[a, 0, Wd], [b, 0, Wd], [b, H, Wd], [a, H, Wd]], "tb");

  if (spec.mode === "door") {
    const d0 = left ? a + 12 : b - 12 - DOOR_W;
    pane([d0, Wd], [d0 + DOOR_W, Wd], DOOR_Y0, H, "op");
    // hinged at the edge towards the tub end, swings out into the room
    const hinge = left ? d0 : d0 + DOOR_W, dir = left ? 1 : -1;
    const th = (o * 78 * Math.PI) / 180;
    const free2 = [hinge + dir * DOOR_W * Math.cos(th), Wd + DOOR_W * Math.sin(th)];
    pane([hinge, Wd], free2, DOOR_Y0, H, "g gd");
    if (!small) {
      const t = 0.8;
      line([hinge + (free2[0] - hinge) * t, DOOR_Y0 + 14, Wd + (free2[1] - Wd) * t],
           [hinge + (free2[0] - hinge) * t, DOOR_Y0 + 30, Wd + (free2[1] - Wd) * t], "hd");
    }
  } else if (spec.mode === "screen") {
    const sh = spec.screenH || 140, y1 = H + sh, zf = Wd - 3;
    const F = Math.min(60, L * 0.36);
    const x0 = left ? a : b - F;
    pane([x0, zf], [x0 + F, zf], H, y1, "g");
    // folding leaf next to the fixed pane, swings out of the tub
    const hinge = left ? x0 + F : x0, dir = left ? 1 : -1;
    const th = (o * 85 * Math.PI) / 180, LW = 40;
    pane([hinge, zf], [hinge + dir * LW * Math.cos(th), zf + LW * Math.sin(th)], H, y1, "g gd");
    if (!small) text(`Höhe ${sh} cm`, [x0 + F / 2, y1 + 8, zf], "dim");
  }

  if (!small) text(spec.label || `${L} × ${Wd} cm`, [(a + b) / 2, 0, Wd + 22], "dim");
  return render(items, small);
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Draws the sketch for spec() into `el`; door/screen open on hover (mouse) or
 *  tap, honouring reduced motion. `el` may be re-attached — each call replaces
 *  the previous listeners' spec by reading it through the getter. */
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
