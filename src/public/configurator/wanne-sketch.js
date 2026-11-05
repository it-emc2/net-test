// wanne-sketch.js — drawings for the Wanne picker (Optional tab → Wanne).
// Same look and projection as the Duschabtrennung sketches (badolux-sketch.js):
// our own axonometric drawing of the tub, the walls that define the
// installation, the entry door and, optionally, the glass screen (Aufsatz).
// Door and screen swing open on hover or tap.
//
// Wall side and door side are independent (Steinkamp sells every combination),
// so both are drawn from the spec. The view is mirrored when the corner wall
// is on the right, so the corner wall always stands at the far end and never
// covers the tub. Pure functions apart from attachWanneSketch().

const H_WALL = 105; // cm, drawn wall height (low, so the tub stays the hero)
const DOOR_W = 55; // cm, entry door width (Steinkamp easy entry)
const DOOR_Y0 = 19.5; // cm, entry height above the floor
const FREE = 34; // cm, open floor drawn beyond an open end of the tub

// View from front-left like the Duschabtrennung drawings (+x and +z are nearer).
const AX = [0.95, 0.3];
const AZ = [-0.62, 0.42];
const proj = (x, y, z) => [x * AX[0] + z * AZ[0], x * AX[1] + z * AZ[1] - y];
const flip = (s) => (s === "links" ? "rechts" : s === "rechts" ? "links" : s);

/**
 * spec = { einbau: "ecke"|"nische"|"vorwand", wall: "links"|"rechts"|null,
 *          door: "links"|"rechts"|null,
 *          screen: null | { side, kind: "falt"|"pendel"|"klapp"|"comby", h, panel },
 *          L, Wd, H, label }
 */
export function wanneSketchSVG(spec, { open = 0, small = false } = {}) {
  if (!spec) return "";
  const L = spec.L || 170, Wd = spec.Wd || 75, H = spec.H || 58;
  const einbau = spec.einbau || "ecke";
  const mirror = einbau === "ecke" && spec.wall === "rechts";
  const door = mirror ? flip(spec.door) : spec.door; // in the drawing's own frame
  const sc = spec.screen ? { ...spec.screen, side: mirror ? flip(spec.screen.side) : spec.screen.side } : null;
  const D = Wd + 22;
  // tub runs x = a..b; corner wall (if any) at x = 0
  let a = 0, b = L, W = L + FREE;
  if (einbau === "nische") W = L;
  if (einbau === "vorwand") { a = FREE * 0.7; b = a + L; W = b + FREE * 0.7; }
  const o = Math.max(0, Math.min(1, open));
  const items = [];
  const poly = (pts, cls) => items.push({ pts, cls });
  const line = (p, q, cls) => items.push({ line: [p, q], cls });
  const text = (t, at, cls) => items.push({ text: t, at, cls });
  const wallX = (x, cls = "w") => poly([[x, 0, 0], [x, 0, D], [x, H_WALL, D], [x, H_WALL, 0]], cls);
  const pane = (p, q, y0, y1, cls) =>
    poly([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], cls);
  // a pane hinged at x=hx (on the line z=zf) of width w, running in direction dir,
  // swung out of the tub by angle deg
  const swing = (hx, zf, dir, w, deg, y0, y1, cls) => {
    const th = (deg * Math.PI) / 180;
    const end = [hx + dir * w * Math.cos(th), zf + w * Math.sin(th)];
    pane([hx, zf], end, y0, y1, cls);
    return end;
  };

  poly([[-18, 0, -6], [W + 18, 0, -6], [W + 18, 0, D + 30], [-18, 0, D + 30]], "fl");
  poly([[0, 0, 0], [W, 0, 0], [W, H_WALL, 0], [0, H_WALL, 0]], "w"); // back wall
  if (einbau !== "vorwand") wallX(0); // corner wall / first niche wall

  // tub: rim, basin, front panel, visible (near) end panel
  poly([[a, H, 0], [b, H, 0], [b, H, Wd], [a, H, Wd]], "tb");
  poly([[a + 7, H, 7], [b - 7, H, 7], [b - 7, H, Wd - 7], [a + 7, H, Wd - 7]], "tbi");
  poly([[a, 0, Wd], [b, 0, Wd], [b, H, Wd], [a, H, Wd]], "tb");
  poly([[b, 0, 0], [b, 0, Wd], [b, H, Wd], [b, H, 0]], "tb");

  if (door) {
    // entry door in the front panel near its end, hinged on the end side,
    // swinging out into the room
    const left = door === "links";
    const d0 = left ? a + 12 : b - 12 - DOOR_W;
    pane([d0, Wd], [d0 + DOOR_W, Wd], DOOR_Y0, H, "op");
    const hx = left ? d0 : d0 + DOOR_W;
    const end = swing(hx, Wd, left ? 1 : -1, DOOR_W, o * 78, DOOR_Y0, H, "g gd");
    if (!small) {
      const at = (y) => [hx + (end[0] - hx) * 0.85, y, Wd + (end[1] - Wd) * 0.85];
      line(at(DOOR_Y0 + 14), at(DOOR_Y0 + 30), "hd");
    }
  }

  if (sc) {
    const sh = sc.h || 140, y1 = H + sh, zf = Wd - 3;
    const left = sc.side === "links";
    const hx = left ? a : b, dir = left ? 1 : -1;
    if (sc.kind === "pendel") {
      swing(hx, zf, dir, 88, o * 70, H, y1, "g gd");
    } else {
      // fixed part on the wall side + folding leaf (Steinkamp 53 + 44 cm,
      // Iris 24 + 60 cm)
      const [F, LW] = sc.kind === "falt" ? [53, 44] : [24, 60];
      pane([hx, zf], [hx + dir * F, zf], H, y1, "g");
      swing(hx + dir * F, zf, dir, LW, o * 80, H, y1, "g gd");
      if (sc.panel) {
        // Iris COMBY: fixed side panel across the open tub end, where a wall is
        // missing; the front part is hinged on it
        pane([hx + dir * 3, 4], [hx + dir * 3, zf], H, y1, "g");
      }
    }
    if (!small) text(`Höhe ${sh} cm`, [hx + dir * 45, y1 + 8, zf], "dim");
  }

  // niche: the second wall stands between viewer and tub → faint, drawn last
  if (einbau === "nische") wallX(W, "w wb");

  if (!small) text(spec.label || `${L} × ${Wd} cm`, [(a + b) / 2, 0, Wd + 22], "dim");
  return render(items, small, mirror);
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
