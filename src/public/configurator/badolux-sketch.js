// badolux-sketch.js — drawings for the Badolux model of "Duschabtrennung (neu)".
// Our own SVG (not cleverbad.de's code): an axonometric cabin built from the
// current answers and sizes. Used for the picture tiles of every step and for
// the live drawing above the steps, where the door folds / slides / swings on
// hover or tap. Pure functions apart from attachSketch(); no dependencies.

const H_WALL = 210; // cm
const H_GLASS = 195; // cm — Badolux glass height
const D_NICHE = 90; // depth drawn for Nische / Walk-In (not asked)

// View from front-left like the shop's drawings: x runs along the front to the
// right and slightly down, +z comes towards the viewer down-left, y is up.
const AX = [0.95, 0.3];
const AZ = [-0.62, 0.42];
const proj = (x, y, z) => [x * AX[0] + z * AZ[0], x * AX[1] + z * AZ[1] - y];

const firstInt = (s) => {
  const m = String(s ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
const sizeOf = (sizes, key) => firstInt(sizes?.[key]?.width);

/** Drawing spec from the wizard's selections + sizes, or null before the first answer. */
export function specFor(selections = {}, sizes = {}) {
  const einbau = selections.Einbausituation;
  if (!einbau) return null;
  const tuer = selections.Tuer || (einbau === "ecke" ? "falt_eck" : einbau === "walkin" ? null : "falt");
  const side = /rechts$/.test(selections.Anschlag || "") ? "rechts" : "links";
  if (einbau === "ecke") {
    const W = sizeOf(sizes, "TuerVorn") || 90;
    const D = sizeOf(sizes, "TuerSeite") || 90;
    return { einbau, tuer: "falt_eck", side, W, D, label: `${W} cm` };
  }
  if (einbau === "walkin") {
    const G = sizeOf(sizes, "Festglas") || 100;
    return { einbau, tuer: null, side, W: G + 50, D: D_NICHE, G, label: `Glas ${G} cm` };
  }
  if (tuer === "schiebe") {
    const W = sizeOf(sizes, "Tuer") || 160;
    return { einbau, tuer, side, W, D: D_NICHE, label: `${W} cm` };
  }
  if (tuer === "pendel") {
    const F = sizeOf(sizes, "Festglas") || 80;
    return { einbau, tuer, side, W: F + 40, D: D_NICHE, F, label: `${F + 40} cm (${F} + 40)` };
  }
  const W = sizeOf(sizes, "Tuer") || 90;
  // Rom 140 / Stockholm 171: a 100-cm folding door next to a fixed part.
  return { einbau, tuer: "falt", side, W, D: D_NICHE, fold: W > 120 ? 100 : W, label: `${W} cm` };
}

/** SVG markup. `open` 0..1 is the door's movement; `small` draws a tile. */
export function sketchSVG(spec, { open = 0, small = false } = {}) {
  if (!spec) return "";
  const { W, D } = spec;
  const items = []; // { pts:[[x,y,z]…], cls } or { line:[a,b], cls } or { text, at, cls }
  const poly = (pts, cls) => items.push({ pts, cls });
  const line = (a, b, cls) => items.push({ line: [a, b], cls });
  const text = (t, at, cls) => items.push({ text: t, at, cls });
  const wallX = (x) => poly([[x, 0, 0], [x, 0, D], [x, H_WALL, D], [x, H_WALL, 0]], "w");
  const wallBack = () => poly([[0, 0, 0], [W, 0, 0], [W, H_WALL, 0], [0, H_WALL, 0]], "w");
  // Glass pane standing on the floor between plan points a=[x,z] and b=[x,z].
  const pane = (a, b, { door = false, handleAt = null } = {}) => {
    poly([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], H_GLASS, b[1]], [a[0], H_GLASS, a[1]]], door ? "g gd" : "g");
    if (!small) {
      const at = (t, y) => [a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t];
      line(at(0.18, 150), at(0.32, 185), "hl");
      line(at(0.3, 140), at(0.38, 160), "hl");
    }
    if (handleAt != null) {
      const t = handleAt;
      line([a[0] + (b[0] - a[0]) * t, 92, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * t, 122, a[1] + (b[1] - a[1]) * t], "hd");
    }
  };
  const deg = (d) => (d * Math.PI) / 180;

  // floor, tray, walls (back first, the far side wall faint)
  poly([[-18, 0, -6], [W + 18, 0, -6], [W + 18, 0, D + 30], [-18, 0, D + 30]], "fl");
  poly([[0, 0.5, 0], [W, 0.5, 0], [W, 0.5, D], [0, 0.5, D]], "tr");
  wallBack();
  if (spec.einbau === "nische") { wallX(0); wallX(W); }
  else if (spec.einbau === "ecke") wallX(0);
  else wallX(spec.side === "links" ? 0 : W);

  const o = Math.max(0, Math.min(1, open));
  if (spec.einbau === "walkin") {
    const x0 = spec.side === "links" ? 0 : W - spec.G;
    pane([x0, D], [x0 + spec.G, D]);
    const free = spec.side === "links" ? x0 + spec.G : x0;
    line([free, H_GLASS, D], [free, H_GLASS + 4, 0], "bar"); // stabiliser to the back wall
  } else if (spec.tuer === "schiebe") {
    // Einstieg links → the sliding pane closes the left half and opens to the right.
    const half = W / 2;
    const left = spec.side === "links";
    const fixedA = left ? half - 4 : 0;
    const fixedB = left ? W : half + 4;
    pane([fixedA, D - 3], [fixedB, D - 3]);
    const shift = o * (half - 10) * (left ? 1 : -1);
    const doorA = (left ? 0 : half - 4) + shift;
    const doorB = (left ? half + 4 : W) + shift;
    pane([doorA, D], [doorB, D], { door: true, handleAt: left ? 0.07 : 0.93 });
    line([0, H_GLASS + 6, D], [W, H_GLASS + 6, D], "rail");
    if (!small) {
      line([W * 0.12, H_GLASS + 26, D], [W * 0.88, H_GLASS + 26, D], "arr");
      text("◂", [W * 0.1, H_GLASS + 25, D], "ah");
      text("▸", [W * 0.9, H_GLASS + 25, D], "ah");
    }
  } else if (spec.tuer === "pendel") {
    // Festglas links → fixed glass on the left, the 40-cm door on the right.
    const left = spec.side === "links";
    const hinge = left ? W - 40 : 40;
    pane(left ? [0, D] : [40, D], left ? [W - 40, D] : [W, D]);
    // The door swings out of the shower (+z) about its hinge next to the fixed glass.
    const sign = left ? 1 : -1;
    const th = deg(o * 80);
    pane([hinge, D], [hinge + sign * 40 * Math.cos(th), D + 40 * Math.sin(th)], { door: true, handleAt: 0.85 });
    if (!small) arcFloor(items, [hinge, D], 40, left ? 0 : 180, left ? 80 : -80);
  } else if (spec.tuer === "falt_eck") {
    foldDoor(items, pane, { hinge: [0, D], dir: [1, 0], inward: [0, -1], L: W / 2, o });
    foldDoor(items, pane, { hinge: [W, 0], dir: [0, 1], inward: [-1, 0], L: D / 2, o });
  } else {
    // Falttür (Lissabon), or Rom / Stockholm: fixed part + 100-cm folding door.
    const left = spec.side === "links";
    const fold = spec.fold;
    if (fold < W) pane(left ? [fold, D] : [0, D], left ? [W, D] : [W - fold, D]);
    foldDoor(items, pane, {
      hinge: left ? [0, D] : [W, D],
      dir: left ? [1, 0] : [-1, 0],
      inward: [0, -1],
      L: fold / 2,
      o,
    });
  }

  if (!small) {
    text(spec.label, [W / 2, 0, D + 22], "dim");
    if (spec.einbau === "ecke") text(`${D} cm`, [W + 16, 0, D / 2], "dim");
  }
  return render(items, small);
}

// A folding door: two leaves; the first turns about the hinge, the second's free
// end stays on the track (classic bi-fold), folding into the shower.
function foldDoor(items, pane, { hinge, dir, inward, L, o }) {
  const th = (o * 78 * Math.PI) / 180;
  const p = (along, inn) => [hinge[0] + dir[0] * along + inward[0] * inn, hinge[1] + dir[1] * along + inward[1] * inn];
  const e1 = p(L * Math.cos(th), L * Math.sin(th));
  const e2 = p(2 * L * Math.cos(th), 0);
  pane(hinge, e1, { door: true });
  pane(e1, e2, { door: true, handleAt: 0.9 });
}

function arcFloor(items, c, r, from, sweep) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((from + (sweep * i) / 12) * Math.PI) / 180;
    pts.push([c[0] + r * Math.cos(a), 1, c[1] + r * Math.sin(a)]);
  }
  for (let i = 0; i < pts.length - 1; i++) items.push({ line: [pts[i], pts[i + 1]], cls: "sw" });
}

function render(items, small) {
  const all = items.flatMap((it) => it.pts || it.line || [it.at]).map((p) => proj(...p));
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const vw = small ? 160 : 520, vh = small ? 130 : 380, m = small ? 8 : 22;
  const s = Math.min((vw - 2 * m) / (maxX - minX), (vh - 2 * m) / (maxY - minY));
  const ox = (vw - (maxX - minX) * s) / 2 - minX * s;
  const oy = (vh - (maxY - minY) * s) / 2 - minY * s;
  const P = (p) => { const q = proj(...p); return [(ox + q[0] * s).toFixed(1), (oy + q[1] * s).toFixed(1)]; };
  // A side wall whose outline winds the other way than the back wall shows its
  // back to the viewer → drawn faint so it doesn't hide the cabin.
  const area = (pts) => pts.map((p) => proj(...p)).reduce((a, q, i, arr) => { const r = arr[(i + 1) % arr.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0);
  const backSign = Math.sign(area(items.find((it) => it.cls === "w").pts));
  let out = "";
  for (const it of items) {
    const cls = it.cls === "w" && Math.sign(area(it.pts)) !== backSign ? "w wb" : it.cls;
    if (it.pts) out += `<polygon class="bs-${cls.split(" ").join(" bs-")}" points="${it.pts.map((p) => P(p).join(",")).join(" ")}"/>`;
    else if (it.line) { const [a, b] = it.line.map(P); out += `<line class="bs-${it.cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`; }
    else { const [x, y] = P(it.at); out += `<text class="bs-${it.cls}" x="${x}" y="${y}">${it.text}</text>`; }
  }
  return `<svg class="bs${small ? " bs-small" : ""}" viewBox="0 0 ${vw} ${vh}" role="img" aria-hidden="${small}">${out}</svg>`;
}

/** Live drawing in `el`: plays the door movement on hover/tap (and once when
 *  `autoplay`), honours reduced motion. */
export function attachSketch(el, spec, { autoplay = false } = {}) {
  el.innerHTML = sketchSVG(spec);
  if (!spec || !spec.tuer) return; // Walk-In: nothing moves
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let raf = 0, cur = 0, target = 0, last = 0;
  const step = (t) => {
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    const d = target - cur;
    cur += Math.sign(d) * Math.min(Math.abs(d), dt / 700);
    el.innerHTML = sketchSVG(spec, { open: easeInOut(cur) });
    if (cur !== target) raf = requestAnimationFrame(step);
    else { raf = 0; last = 0; }
  };
  const go = (to) => {
    target = to;
    if (reduce) { cur = to; el.innerHTML = sketchSVG(spec, { open: to }); return; }
    if (!raf) raf = requestAnimationFrame(step);
    // requestAnimationFrame does not run in background tabs — land on the end state.
    setTimeout(() => { if (cur !== target) { cancelAnimationFrame(raf); raf = 0; cur = target; el.innerHTML = sketchSVG(spec, { open: target }); } }, 1500);
  };
  el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") go(1); });
  el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") go(0); });
  el.addEventListener("click", () => go(target ? 0 : 1)); // tap on the iPad
  if (autoplay) {
    go(1);
    setTimeout(() => go(0), 1600);
  }
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
