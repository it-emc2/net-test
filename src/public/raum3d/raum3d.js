// raum3d.js — stage-0 test: the customer's bathroom from magicplan as a 3D scene,
// before (as scanned) and after (bathtub/shower replaced by the new shower tray,
// glass on the open sides, wall cladding on the walls the tray stands against).
// Everything is built from measured data; nothing is guessed — missing data → notice.
// Plan coordinates (x right, y down) map to three.js x / z; y is up. Metres.
import * as THREE from "https://unpkg.com/three@0.170.0?module";
import { OrbitControls } from "https://unpkg.com/three@0.170.0/examples/jsm/controls/OrbitControls.js?module";

const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const info = $("#info");
const S = { data: null, mode: "nachher", view: "oben", spot: 0, shower: null, hidden: new Set() };
window.__raum3d = S; // for checks in the browser console

// ---- renderer / scene ---------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f3);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
let roomGroup = new THREE.Group();
scene.add(roomGroup);

const resize = () => {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(stage);
window.addEventListener("resize", resize);
resize(); // ResizeObserver can lag (background tab) — size once right away
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---- materials ------------------------------------------------------------------
const M = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf3f1ed, roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xc9c6c0, roughness: 0.8, side: THREE.DoubleSide }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
  tray: new THREE.MeshStandardMaterial({ color: 0xf6f5f2, roughness: 0.75 }),
  drain: new THREE.MeshStandardMaterial({ color: 0xe9e8e4, roughness: 0.6 }),
  old: new THREE.MeshStandardMaterial({ color: 0xdedcd7, roughness: 0.6 }),
  furniture: new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xd6ecf2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.2, metalness: 0.9 }),
  cladding: new THREE.MeshStandardMaterial({ color: 0xfaf9f6, roughness: 0.5, side: THREE.DoubleSide }),
  joint: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.6 }),
  windowGlass: new THREE.MeshStandardMaterial({ color: 0xbfd9ea, roughness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  frame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
};

const v3 = (x, y, h = 0) => new THREE.Vector3(x, h, y);
const box = (w, h, d, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};
// point in polygon (plan coordinates)
const inside = ([x, y], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// ---- room shell: floor + walls with openings (single-sided → "dollhouse" view) ----
function buildRoom(room) {
  const H = room.ceiling || 2.5;
  for (const r of room.rooms) {
    const shape = new THREE.Shape(r.inner.map(([x, y]) => new THREE.Vector2(x, y)));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.floor);
    floor.rotation.x = Math.PI / 2; // shape (x, y) → world (x, 0, y)
    floor.receiveShadow = true;
    roomGroup.add(floor);

    r.inner.forEach((p0, i) => {
      let p = p0, q = r.inner[(i + 1) % r.inner.length];
      let len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 0.02) return;
      let dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      // front face must look into the room: normal (−dy, dx) has to point inside
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (!inside([mid[0] - dir[1] * 0.05, mid[1] + dir[0] * 0.05], r.inner)) {
        [p, q] = [q, p];
        dir = [-dir[0], -dir[1]];
      }
      const wallShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, H), new THREE.Vector2(0, H)]);
      const extras = [];
      for (const o of room.openings) {
        if (o.kind === "wallItem" || o.a[0] == null || S.hidden.has("o" + room.openings.indexOf(o))) continue;
        const om = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
        const rel = [om[0] - p[0], om[1] - p[1]];
        const t = rel[0] * dir[0] + rel[1] * dir[1];
        const off = Math.abs(rel[0] * -dir[1] + rel[1] * dir[0]);
        if (off > 0.2 || t < 0 || t > len) continue;
        const w = o.width || Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
        const u0 = Math.max(0.01, t - w / 2), u1 = Math.min(len - 0.01, t + w / 2);
        const v0 = Math.max(o.kind === "door" ? 0 : 0.01, o.sill || 0), v1 = Math.min(H - 0.02, v0 + (o.height || 2));
        const hole = new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)]);
        wallShape.holes.push(hole);
        extras.push({ o, u0, u1, v0, v1 });
      }
      const geo = new THREE.ShapeGeometry(wallShape);
      // shape x → along the wall, y → up, z (front face) → dir × up = (−dy, dx): into the room
      const X = new THREE.Vector3(dir[0], 0, dir[1]), Y = new THREE.Vector3(0, 1, 0);
      const basis = new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y));
      const wall = new THREE.Mesh(geo, M.wall);
      wall.applyMatrix4(basis.setPosition(v3(p[0], p[1])));
      wall.receiveShadow = true;
      wall.userData.wall = { p, q, dir, n: [-dir[1], dir[0]] };
      roomGroup.add(wall);
      // window glass + frame, door frame
      for (const { o, u0, u1, v0, v1 } of extras) {
        const at = (u, v, inset = 0) => v3(p[0] + dir[0] * u - dir[1] * -inset, p[1] + dir[1] * u + dir[0] * -inset, v);
        if (o.kind === "window") {
          const g = box(u1 - u0, v1 - v0, 0.01, M.windowGlass);
          g.position.copy(at((u0 + u1) / 2, (v0 + v1) / 2, 0.06));
          g.rotation.y = -Math.atan2(dir[1], dir[0]);
          g.castShadow = false;
          roomGroup.add(g);
        }
        for (const [uu, vv, ww, hh] of [[u0, (v0 + v1) / 2, 0.04, v1 - v0], [u1, (v0 + v1) / 2, 0.04, v1 - v0], [(u0 + u1) / 2, v1, u1 - u0 + 0.04, 0.04]]) {
          const f = box(ww, hh, 0.03, M.frame);
          f.position.copy(at(uu, vv, -0.005));
          f.rotation.y = -Math.atan2(dir[1], dir[0]);
          roomGroup.add(f);
        }
      }
    });
  }
  // wall-mounted items (washbasin …) as simple boxes on the wall
  for (const o of room.openings.filter((x) => x.kind === "wallItem" && !S.hidden.has("o" + room.openings.indexOf(x)))) {
    const w = o.width || 0.45, d = Math.max(0.25, o.depth || 0.3), sill = o.sill ?? 0.68;
    const dir = [(o.b[0] - o.a[0]) / (Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1), (o.b[1] - o.a[1]) / (Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1)];
    let n = [-dir[1], dir[0]];
    const mid = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
    if (!room.rooms.some((r) => inside([mid[0] + n[0] * 0.2, mid[1] + n[1] * 0.2], r.inner))) n = [-n[0], -n[1]];
    const b = box(w, 0.16, d, M.ceramic);
    b.position.copy(v3(mid[0] + n[0] * (d / 2 + 0.06), mid[1] + n[1] * (d / 2 + 0.06), sill + 0.08));
    b.rotation.y = -Math.atan2(dir[1], dir[0]);
    roomGroup.add(b);
  }
}

// ---- objects from the scan -----------------------------------------------------
const objMat = (name) => (/toilette|wc|wanne|dusch|wasch/i.test(name || "") ? M.ceramic : /schrank|regal|tisch|stuhl/i.test(name || "") ? M.furniture : M.old);
function addObject(o, mat = objMat(o.name)) {
  const h = Math.max(0.05, o.h || 0.5);
  const b = box(o.w, h, o.d, mat);
  b.position.copy(v3(o.x, o.y, h / 2));
  b.rotation.y = -o.angle;
  b.userData.name = o.name;
  roomGroup.add(b);
  return b;
}

// ---- after: new shower in place of the bathtub / old shower ----------------------
// Start placement: the tray sits in the wall corner of the scanned bathtub/shower
// (sides 0 back, 1 right, 2 front, 3 left in the object's own frame). After that the
// user can drag / rotate it; S.shower holds { x, y, angle, W, D }.
function initialShower(spot, W, D) {
  const o = spot.object;
  const wall = spot.sides.map((x) => x.wall);
  const c = Math.cos(o.angle), s = Math.sin(o.angle);
  const hw = o.w / 2, hd = o.d / 2;
  const back = wall[0] || !wall[2];
  const left = wall[3] ? true : wall[1] ? false : null; // null = centred (one wall)
  const uc = left === true ? -hw + W / 2 : left === false ? hw - W / 2 : 0;
  const vc = back ? -hd + D / 2 : hd - D / 2;
  // angle: keep the object's frame, flipped so the tray's local "back" (−v) faces the wall
  return { x: o.x + uc * c - vc * s, y: o.y + uc * s + vc * c, angle: back ? o.angle : o.angle + Math.PI, W, D };
}

const roomWalls = () => S.data.room.rooms.flatMap((r) => r.inner.map((p, i) => [p, r.inner[(i + 1) % r.inner.length]]));
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
/** Tray corners/edges in plan coordinates; edge.wall = stands against a wall. */
function trayEdges(sh) {
  const c = Math.cos(sh.angle), s = Math.sin(sh.angle);
  const at = (u, v) => [sh.x + u * c - v * s, sh.y + u * s + v * c];
  const w = sh.W / 2, d = sh.D / 2;
  const P = [at(-w, -d), at(w, -d), at(w, d), at(-w, d)];
  const walls = roomWalls();
  return P.map((A, i) => {
    const B = P[(i + 1) % 4], m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    return { i, A, B, m, wall: walls.some(([a, b]) => distSeg(m, a, b) <= 0.06) };
  });
}

// "Duschwanne ohne Rand": 3 cm slab, top falling ~8 mm towards a square drain near
// the back edge (as Badolux Riviera / Slate), matt stone-white.
function trayMesh(W, D, drainUV) {
  const g = new THREE.Group();
  const H = 0.03, fall = 0.008;
  const base = box(W, H - fall, D, M.tray);
  base.position.y = (H - fall) / 2;
  g.add(base);
  const top = new THREE.PlaneGeometry(W, D, 30, 30);
  top.rotateX(-Math.PI / 2);
  const pos = top.attributes.position;
  const maxR = Math.hypot(W, D);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i) - drainUV[0], pos.getZ(i) - drainUV[1]);
    pos.setY(i, H - fall + fall * Math.min(1, r / (maxR * 0.6)));
  }
  top.computeVertexNormals();
  const surf = new THREE.Mesh(top, M.tray);
  surf.receiveShadow = true;
  g.add(surf);
  // closing strips on the 4 sides above the base (the sloped top leaves a small gap)
  for (const [w, d, x, z] of [[W, 0.004, 0, -D / 2], [W, 0.004, 0, D / 2], [0.004, D, -W / 2, 0], [0.004, D, W / 2, 0]]) {
    const strip = box(w, fall, d, M.tray);
    strip.position.set(x, H - fall / 2, z);
    g.add(strip);
  }
  const drain = box(0.12, 0.003, 0.12, M.drain);
  drain.position.set(drainUV[0], H - fall + 0.0005, drainUV[1]);
  g.add(drain);
  return g;
}

function addShower(sh, withGlass) {
  const edges = trayEdges(sh);
  const wallBack = edges.find((e) => e.wall) || edges[0];
  // drain near the first wall edge, 20 cm from its left end (as on the Riviera)
  // local (u, v) of the drain: 10 cm off the wall edge, 20 cm from its start
  const w = sh.W / 2, d = sh.D / 2;
  const drainUV = [[-w + 0.2, -d + 0.1], [w - 0.1, -d + 0.2], [w - 0.2, d - 0.1], [-w + 0.1, d - 0.2]][wallBack.i];
  const tray = trayMesh(sh.W, sh.D, drainUV);
  tray.position.copy(v3(sh.x, sh.y, 0));
  tray.rotation.y = -sh.angle;
  tray.traverse((m) => { m.userData.tray = true; });
  roomGroup.add(tray);

  const H = Math.min(2.55, (S.data.room.ceiling || 2.5) - 0.02);
  for (const e of edges) {
    const len = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1]);
    const ang = -Math.atan2(e.B[1] - e.A[1], e.B[0] - e.A[0]);
    const toC = [sh.x - e.m[0], sh.y - e.m[1]], l = Math.hypot(...toC) || 1;
    if (e.wall) {
      // wall cladding behind the tray, with cut-outs where a window / door is in that wall
      const dir = [(e.B[0] - e.A[0]) / len, (e.B[1] - e.A[1]) / len];
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, H), new THREE.Vector2(0, H)]);
      for (const [k, o] of S.data.room.openings.entries()) {
        if (o.kind === "wallItem" || S.hidden.has("o" + k) || o.a[0] == null) continue;
        const om = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
        const rel = [om[0] - e.A[0], om[1] - e.A[1]];
        const t = rel[0] * dir[0] + rel[1] * dir[1], off = Math.abs(rel[0] * -dir[1] + rel[1] * dir[0]);
        const w = o.width || Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
        if (off > 0.2 || t + w / 2 < 0 || t - w / 2 > len) continue;
        const u0 = Math.max(0.001, t - w / 2), u1 = Math.min(len - 0.001, t + w / 2);
        const v0 = Math.max(0.001, o.sill || 0), v1 = Math.min(H - 0.001, v0 + (o.height || 2));
        if (u1 - u0 < 0.01 || v1 - v0 < 0.01) continue;
        shape.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)]));
      }
      const X = new THREE.Vector3(dir[0], 0, dir[1]), Y = new THREE.Vector3(0, 1, 0);
      const basis = new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y));
      const p = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.cladding);
      p.applyMatrix4(basis.setPosition(v3(e.A[0] + (toC[0] / l) * 0.004, e.A[1] + (toC[1] / l) * 0.004, 0)));
      p.receiveShadow = true;
      roomGroup.add(p);
    } else if (withGlass) {
      const gh = 2.0;
      const g = box(len - 0.01, gh, 0.008, M.glass);
      g.position.copy(v3(e.m[0], e.m[1], 0.03 + gh / 2));
      g.rotation.y = ang;
      g.castShadow = false;
      roomGroup.add(g);
      const top = box(len, 0.025, 0.03, M.chrome);
      top.position.copy(v3(e.m[0], e.m[1], 0.03 + gh));
      top.rotation.y = ang;
      roomGroup.add(top);
      for (const P of [e.A, e.B]) {
        const post = box(0.025, gh, 0.03, M.chrome);
        post.position.copy(v3(P[0], P[1], 0.03 + gh / 2));
        post.rotation.y = ang;
        roomGroup.add(post);
      }
    }
  }
  const open = edges.find((e) => !e.wall && e.i === (wallBack.i + 2) % 4) || edges.find((e) => !e.wall);
  let facing = [0, 1];
  if (open) {
    const m = [open.m[0] - sh.x, open.m[1] - sh.y], l = Math.hypot(...m) || 1;
    facing = [m[0] / l, m[1] / l];
  }
  return { center: [sh.x, sh.y], facing, size: [sh.W, sh.D] };
}

// A tray position is valid when all corners lie inside the room (1 cm tolerance)
// and no wall runs through the tray — glass then can't stick through a wall.
function segCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}
function fits(sh) {
  const edges = trayEdges({ ...sh, W: sh.W - 0.02, D: sh.D - 0.02 }); // 1 cm inside the edge
  const polys = S.data.room.rooms.map((r) => r.inner);
  if (!edges.every((e) => polys.some((p) => inside(e.A, p)))) return false;
  const walls = roomWalls();
  // diagonals + edges must not cross a wall
  const segs = [...edges.map((e) => [e.A, e.B]), [edges[0].A, edges[2].A], [edges[1].A, edges[3].A]];
  return !segs.some(([a, b]) => walls.some(([c, d]) => segCross(a, b, c, d)));
}
/** Scanned objects the tray overlaps (corner of one inside the other). */
function overlaps(sh) {
  const tray = trayEdges(sh).map((e) => e.A);
  return S.data.room.objects.filter((o, i) => {
    if (S.hidden.has("f" + i)) return false;
    const spot = S.data.spots[S.spot]?.object;
    if (spot && o.x === spot.x && o.y === spot.y) return false; // the bathtub that is replaced
    const oc = trayEdges({ x: o.x, y: o.y, angle: o.angle, W: o.w, D: o.d }).map((e) => e.A);
    return oc.some((p) => inside(p, tray)) || tray.some((p) => inside(p, oc));
  });
}

// Snap the tray to nearby walls: any edge within 10 cm of a parallel wall moves onto it.
function snap(sh) {
  for (let pass = 0; pass < 2; pass++) {
    for (const e of trayEdges(sh)) {
      for (const [a, b] of roomWalls()) {
        const wl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, wd = [(b[0] - a[0]) / wl, (b[1] - a[1]) / wl];
        const el = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1]) || 1;
        if (Math.abs((e.B[0] - e.A[0]) / el * -wd[1] + (e.B[1] - e.A[1]) / el * wd[0]) > 0.05) continue; // not parallel
        const n = [-wd[1], wd[0]];
        const dist = (e.m[0] - a[0]) * n[0] + (e.m[1] - a[1]) * n[1];
        if (Math.abs(dist) < 0.1 && Math.abs(dist) > 0.0005 && distSeg(e.m, a, b) < 0.12) {
          sh.x -= n[0] * dist;
          sh.y -= n[1] * dist;
        }
      }
    }
  }
  return sh;
}

// ---- cameras ---------------------------------------------------------------------
let showerFrame = null;
function setView(view) {
  S.view = view;
  document.querySelectorAll("#views button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
  const room = S.data?.room;
  if (!room) return;
  const pts = room.rooms.flatMap((r) => r.inner);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const H = room.ceiling || 2.5;
  camera.fov = 50;
  if (view === "oben") {
    camera.position.copy(v3(c[0], c[1] + 0.001, H + span * 1.25));
    controls.target.copy(v3(c[0], c[1], 0));
  } else if (view === "vorn" && showerFrame) {
    // stand at the opposite wall (inside the room) and look at the shower
    const [fx, fy] = showerFrame.facing, [sx, sy] = showerFrame.center;
    const walls = room.rooms.flatMap((r) => r.inner.map((p, i) => [p, r.inner[(i + 1) % r.inner.length]]));
    let hit = 3;
    for (const [a, b] of walls) {
      const ex = b[0] - a[0], ey = b[1] - a[1], den = fx * ey - fy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - sx) * ey - (a[1] - sy) * ex) / den, u = ((a[0] - sx) * fy - (a[1] - sy) * fx) / den;
      if (t > 0.3 && u >= 0 && u <= 1) hit = Math.min(hit, t);
    }
    const dist = Math.max(0.6, hit - 0.15);
    camera.fov = 72;
    camera.position.copy(v3(sx + fx * dist, sy + fy * dist, 1.6));
    controls.target.copy(v3(sx, sy, 1.05));
  } else {
    const door = room.openings.find((o) => o.kind === "door" && (o.height || 0) > 1.5) || room.openings.find((o) => o.kind === "door");
    const m = door ? [(door.a[0] + door.b[0]) / 2, (door.a[1] + door.b[1]) / 2] : [Math.min(...xs), c[1]];
    const toC = [c[0] - m[0], c[1] - m[1]], l = Math.hypot(...toC) || 1;
    camera.fov = 70;
    camera.position.copy(v3(m[0] - (toC[0] / l) * 0.25, m[1] - (toC[1] / l) * 0.25, 1.6));
    controls.target.copy(v3(c[0], c[1], 1.1));
  }
  camera.updateProjectionMatrix();
  sun.position.copy(v3(c[0] + 1.5, c[1] - 2, H + 3));
  sun.target.position.copy(v3(c[0], c[1], 0));
  const r = span * 0.8 + 1;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: H + 10 });
  sun.shadow.camera.updateProjectionMatrix();
}

// ---- build + UI ------------------------------------------------------------------
function rebuild(keepCamera = false) {
  scene.remove(roomGroup);
  roomGroup = new THREE.Group();
  scene.add(roomGroup);
  showerFrame = null;
  const d = S.data;
  if (!d?.room) return;
  buildRoom(d.room);
  const spot = d.spots[S.spot];
  const [tw, td] = $("#tray").value.split("×").map((n) => Number(n) / 100);
  d.room.objects.forEach((o, i) => {
    if (S.hidden.has("f" + i)) return;
    if (S.mode === "nachher" && spot && o === spot.object) return;
    if (S.mode === "nachher" && spot && o.x === spot.object.x && o.y === spot.object.y) return;
    addObject(o);
  });
  if (S.mode === "nachher" && spot) {
    if (!S.shower) S.shower = snap(initialShower(spot, tw, td));
    showerFrame = addShower(S.shower, $("#glass").value !== "ohne");
  }
  if (!keepCamera) setView(S.view === "vorn" && !showerFrame ? "oben" : S.view);
  renderInfo();
}

const SIT = { nische: "Nische (3 Wände)", ecke: "Ecke (2 Wände)", wand: "an einer Wand", frei: "freistehend" };
function renderInfo() {
  const d = S.data;
  setTimeout(() => { S.note = null; }, 0); // one-off notes show once
  if (!d) return;
  if (!d.plan.measured) {
    info.innerHTML = `<b>${d.plan.name}</b><br><span class="warn">Der Plan ist noch nicht vermessen (leer). Keine 3D-Ansicht möglich.</span>`;
    return;
  }
  const r = d.room.rooms[0];
  const xs = r.inner.map((p) => p[0]), ys = r.inner.map((p) => p[1]);
  const dims = `${(Math.max(...xs) - Math.min(...xs)).toFixed(2)} × ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} m, Höhe ${d.room.ceiling?.toFixed(2) ?? "?"} m`;
  const spot = d.spots[S.spot];
  info.innerHTML = `<b>${d.plan.name}</b> · ${dims}<br>` +
    (spot
      ? `Neue Dusche statt <b>${spot.object.name}</b> (${(spot.object.w * 100).toFixed(0)} × ${(spot.object.d * 100).toFixed(0)} cm) · Situation laut Aufmaß: <b>${SIT[spot.situation]}</b>`
      : `<span class="warn">Keine Badewanne/Dusche im Plan – Position müsste gewählt werden.</span>`) +
    (S.mode === "nachher" && S.shower && !fits(S.shower) ? `<br><span class="warn">Die Duschwanne passt an dieser Stelle nicht in den Raum – bitte verschieben oder kleiner wählen.</span>` : "") +
    (S.mode === "nachher" && S.shower && overlaps(S.shower).length ? `<br><span class="warn">Überschneidet: ${[...new Set(overlaps(S.shower).map((o) => o.name || "Objekt"))].join(", ")} – verschieben oder unter „Objekte“ ausblenden.</span>` : "") +
    (S.note ? `<br><span class="warn">${S.note}</span>` : "") +
    `<br><span style="color:var(--muted)">Visualisierung auf Basis des Aufmaßes · Produkte vereinfacht · Farben können abweichen</span>`;
}

let loadSeq = 0;
async function load(deal) {
  const seq = ++loadSeq; // only the last request may draw (a slow earlier plan must not win)
  info.textContent = "Lade Plan …";
  const res = await fetch(`/api/room3d/${encodeURIComponent(deal)}`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (seq !== loadSeq) return;
  if (!res.ok) { info.innerHTML = `<span class="warn">${data.error || "Fehler " + res.status}</span>`; return; }
  S.data = data;
  S.spot = 0;
  S.shower = null;
  S.hidden = new Set();
  renderObjectList();
  $("#spot").innerHTML = data.spots.map((s, i) => `<option value="${i}">${s.object.name} · ${SIT[s.situation]}</option>`).join("") || `<option>–</option>`;
  history.replaceState(null, "", `?deal=${encodeURIComponent(deal)}`);
  rebuild();
}

$("#load").addEventListener("submit", (e) => { e.preventDefault(); load(new FormData(e.target).get("deal").trim()); });
$("#mode").addEventListener("click", (e) => {
  const m = e.target.closest("button")?.dataset.mode;
  if (!m) return;
  S.mode = m;
  document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === m));
  rebuild();
});
$("#views").addEventListener("click", (e) => { const v = e.target.closest("button")?.dataset.view; if (v) setView(v); });
for (const id of ["#spot", "#tray"]) $(id).addEventListener("change", () => { S.spot = Number($("#spot").value) || 0; S.shower = null; rebuild(); });
$("#glass").addEventListener("change", () => rebuild(true));

// ---- editing: show/hide objects, rotate and drag the shower ---------------------------
function renderObjectList() {
  const d = S.data;
  if (!d?.room) { $("#objects").innerHTML = ""; return; }
  const items = [
    ...d.room.objects.map((o, i) => ({ key: "f" + i, name: o.name || "Objekt" })),
    ...d.room.openings.map((o, i) => ({ key: "o" + i, name: o.name || (o.kind === "window" ? "Fenster" : o.kind === "door" ? "Tür" : "Wandobjekt") })),
  ];
  $("#objects").innerHTML = items
    .map((it) => `<label><input type="checkbox" data-key="${it.key}" ${S.hidden.has(it.key) ? "" : "checked"}> ${it.name}</label>`)
    .join("");
}
$("#objects").addEventListener("change", (e) => {
  const k = e.target.dataset.key;
  if (!k) return;
  if (e.target.checked) S.hidden.delete(k); else S.hidden.add(k);
  rebuild(true);
});
$("#rotate").addEventListener("click", () => {
  if (!S.shower) return;
  const next = snap({ ...S.shower, angle: S.shower.angle + Math.PI / 2 });
  if (fits(next)) S.shower = next;
  else S.note = "Gedreht passt die Duschwanne hier nicht – erst verschieben.";
  rebuild(true);
});

// Drag the tray on the floor (finger or mouse); orbiting is paused meanwhile.
const ray = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
const pointerAt = (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
};
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (S.mode !== "nachher" || !S.shower) return;
  pointerAt(e);
  const hit = ray.intersectObjects(roomGroup.children, true).find((h) => h.object.userData.tray);
  if (!hit) return;
  const p = ray.ray.intersectPlane(floorPlane, new THREE.Vector3());
  if (!p) return;
  drag = { dx: S.shower.x - p.x, dy: S.shower.y - p.z, id: e.pointerId };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  pointerAt(e);
  const p = ray.ray.intersectPlane(floorPlane, new THREE.Vector3());
  if (!p) return;
  // move only as far as the room allows: the tray stops at the walls
  const next = snap({ ...S.shower, x: p.x + drag.dx, y: p.z + drag.dy });
  if (fits(next)) S.shower = next;
  else {
    const slideX = snap({ ...S.shower, x: p.x + drag.dx }), slideY = snap({ ...S.shower, y: p.z + drag.dy });
    if (fits(slideX)) S.shower = slideX; else if (fits(slideY)) S.shower = slideY; else return;
  }
  rebuild(true);
});
const endDrag = () => { if (drag) { drag = null; controls.enabled = true; } };
renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);
$("#shot").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/jpeg", 0.9);
  a.download = `raum3d-${S.data?.plan?.name || "plan"}-${S.mode}-${S.view}.jpg`;
  a.click();
});

const q = new URLSearchParams(location.search).get("deal");
if (q) { $("#load").deal.value = q; load(q); }
