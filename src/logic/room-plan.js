// room-plan.js — magicplan plan → room model for the 3D view (pure, no DOM, no I/O).
//
// Input: the plan XML (GET /plans/get/{id} → plan_detail.magicplan_format_xml) and the
// object names from GET /projects/{id}/plan (uid → "Badewanne", "Toilette" …).
// Output, in metres, plan coordinates (x right, y down as in the magicplan 2D view):
//   { ceiling, wallWidth, rooms:[{ name, poly:[[x,y]…] (wall centre line), inner:[[x,y]…] }],
//     openings:[{ kind:"door"|"window"|"wallItem", name, a:[x,y], b:[x,y], width, height, sill }],
//     objects:[{ uid, name, x, y, angle, w, d, h }] }
// Only data from the scan — nothing is guessed. Missing values stay null.

const num = (v) => (v == null || v === "" ? null : Number(v));
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/(\w[\w.]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

/** symbolInstance id ("W-0-1") → { uid, values:{ key: value } } */
function symbolInstances(xml) {
  const out = {};
  for (const m of xml.matchAll(/<symbolInstance ([^>]*?)(\/>|>([\s\S]*?)<\/symbolInstance>)/g)) {
    const a = attrs(m[1]);
    if (!a.id || out[a.id]) continue;
    const values = Object.fromEntries([...(m[3] || "").matchAll(/<value key="([^"]+)">([^<]*)<\/value>/g)].map((v) => [v[1], v[2]]));
    out[a.id] = { uid: a.uid, symbol: a.symbol, values };
  }
  return out;
}

// Inset a closed polygon (centre line) by d towards its inside — the inner wall faces.
function inset(poly, d) {
  const n = poly.length;
  const area = poly.reduce((s, [x, y], i) => s + x * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * y, 0);
  const sign = area > 0 ? 1 : -1; // orientation decides which side is inside
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sign, ny = (dx / len) * sign; // inward normal
    return [[p[0] + nx * d, p[1] + ny * d], [q[0] + nx * d, q[1] + ny * d]];
  });
  return lines.map((l, i) => {
    const m = lines[(i - 1 + n) % n];
    return intersect(m, l) || l[0];
  });
}
function intersect([[x1, y1], [x2, y2]], [[x3, y3], [x4, y4]]) {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

export function parsePlan(xml, objectNames = {}) {
  if (!xml) return null;
  const plan = attrs(xml.match(/<plan [^>]*>/)?.[0] || "");
  const sym = symbolInstances(xml);
  const nameOf = (si) => objectNames[sym[si]?.uid] || null;

  // rooms: <floorRoom x y> + <point snappedX snappedY height> relative to the room origin
  const rooms = [];
  for (const m of xml.matchAll(/<floorRoom ([^>]*)>([\s\S]*?)<\/floorRoom>/g)) {
    const r = attrs(m[1]);
    if (rooms.some((x) => x.uid === r.uid)) continue; // the XML lists each room twice
    const ox = num(r.x), oy = num(r.y);
    const poly = [...m[2].matchAll(/<point ([^>]*)\/>/g)].map((p) => {
      const a = attrs(p[1]);
      return [ox + num(a.snappedX), oy + num(a.snappedY)];
    });
    const ceiling = num(m[2].match(/key="ceilingHeight">([\d.]+)/)?.[1]);
    rooms.push({ uid: r.uid, type: r.type || null, name: objectNames[r.uid] || r.type || null, poly, ceiling });
  }
  const wallWidth = num(plan.interiorWallWidth) ?? 0.12;
  for (const r of rooms) r.inner = inset(r.poly, wallWidth / 2);

  // openings + objects from the <exploded> section (absolute coordinates)
  const ex = xml.slice(xml.indexOf("<exploded"), xml.indexOf("</exploded>"));
  const openings = [];
  for (const m of ex.matchAll(/<(door|window) ([^>]*)\/>/g)) {
    const a = attrs(m[2]);
    const s = sym[a.symbolInstance] || {};
    const wallItem = /^plumbing|^furniture/.test(s.symbol || ""); // wall-mounted washbasin etc.
    openings.push({
      kind: wallItem ? "wallItem" : m[1],
      name: nameOf(a.symbolInstance),
      a: [num(a.x1), num(a.y1)],
      b: [num(a.x2), num(a.y2)],
      width: num(a.width),
      depth: num(a.depth),
      height: num(s.values?.wallItemHeight) ?? num(a.height),
      sill: num(s.values?.wallItemDistanceToFloor) ?? (m[1] === "door" && !wallItem ? 0 : null),
    });
  }
  const objects = [...ex.matchAll(/<furniture ([^>]*)\/>/g)].map((m) => {
    const a = attrs(m[1]);
    return {
      uid: sym[a.symbolInstance]?.uid || null,
      name: nameOf(a.symbolInstance),
      x: num(a.x), y: num(a.y), angle: num(a.angle) || 0,
      w: num(a.width), d: num(a.depth), h: num(a.height),
    };
  });

  const ceilings = rooms.map((r) => r.ceiling).filter((c) => c > 0);
  return { name: plan.name || null, ceiling: ceilings.length ? Math.max(...ceilings) : null, wallWidth, rooms, openings, objects };
}

// ---- where the new shower goes -------------------------------------------------

const isTub = (n) => /wanne/i.test(n || "") && !/dusch/i.test(n || "");
const isShower = (n) => /dusch/i.test(n || "");

/** The 4 sides of an object's footprint: [{ a, b, mid }] (rotated rectangle). */
export function footprint(o) {
  const c = Math.cos(o.angle), s = Math.sin(o.angle);
  const pt = (u, v) => [o.x + u * c - v * s, o.y + u * s + v * c];
  const hw = o.w / 2, hd = o.d / 2;
  const corners = [pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)];
  return corners.map((a, i) => {
    const b = corners[(i + 1) % 4];
    return { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  });
}

// distance from point p to segment ab
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Candidate places for the new shower: every bathtub / shower in the scan, with the
 * sides that stand against a wall (≤ tol) → situation "nische" (3), "ecke" (2),
 * "wand" (1, Walk-In / one wall) or "frei" (0). Pure geometry from the scan.
 */
export function showerSpots(model, { tol = 0.06 } = {}) {
  const walls = model.rooms.flatMap((r) => r.inner.map((p, i) => [p, r.inner[(i + 1) % r.inner.length]]));
  return model.objects
    .filter((o) => isTub(o.name) || isShower(o.name))
    .map((o) => {
      const sides = footprint(o).map((s, i) => ({
        i,
        ...s,
        wall: walls.some(([a, b]) => distSeg(s.mid, a, b) <= tol),
      }));
      const n = sides.filter((s) => s.wall).length;
      const situation = n >= 3 ? "nische" : n === 2 ? "ecke" : n === 1 ? "wand" : "frei";
      return { kind: isTub(o.name) ? "badewanne" : "dusche", object: o, sides, situation };
    });
}
