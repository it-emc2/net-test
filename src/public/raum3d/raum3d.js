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
const S = { data: null, mode: "nachher", view: "oben", spot: 0 };

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
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---- materials ------------------------------------------------------------------
const M = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf3f1ed, roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xc9c6c0, roughness: 0.8, side: THREE.DoubleSide }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
  old: new THREE.MeshStandardMaterial({ color: 0xdedcd7, roughness: 0.6 }),
  furniture: new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xd6ecf2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.2, metalness: 0.9 }),
  cladding: new THREE.MeshStandardMaterial({ color: 0xfaf9f6, roughness: 0.5 }),
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
        if (o.kind === "wallItem" || o.a[0] == null) continue;
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
  for (const o of room.openings.filter((x) => x.kind === "wallItem")) {
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
// Sides of the scanned object (0 back, 1 right, 2 front, 3 left in its own frame);
// the tray sits in the wall corner they form. Returns the tray frame for cameras.
function addShower(spot, trayW, trayD, withGlass) {
  const o = spot.object;
  const wall = spot.sides.map((s) => s.wall);
  const c = Math.cos(o.angle), s = Math.sin(o.angle);
  const hw = o.w / 2, hd = o.d / 2;
  // the tray's long side follows the object's long side
  const W = trayW, D = trayD;
  const back = wall[0] || !wall[2];
  const left = wall[3] ? true : wall[1] ? false : null; // null = centred (one wall)
  const uc = left === true ? -hw + W / 2 : left === false ? hw - W / 2 : 0;
  const vc = back ? -hd + D / 2 : hd - D / 2;
  const at = (u, v) => [o.x + u * c - v * s, o.y + u * s + v * c];
  const [tx, ty] = at(uc, vc);
  const yaw = -o.angle;

  const tray = box(W, 0.035, D, M.ceramic);
  tray.position.copy(v3(tx, ty, 0.0175));
  tray.rotation.y = yaw;
  roomGroup.add(tray);
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 24), M.chrome);
  const [dx, dy] = at(uc, vc + (back ? D / 2 - 0.12 : -(D / 2 - 0.12)));
  drain.position.copy(v3(dx, dy, 0.037));
  roomGroup.add(drain);

  // tray edges in local (u, v): which stand against a wall
  const edges = [
    { key: "back", a: [uc - W / 2, vc - D / 2], b: [uc + W / 2, vc - D / 2], wall: back && wall[0] },
    { key: "right", a: [uc + W / 2, vc - D / 2], b: [uc + W / 2, vc + D / 2], wall: left === false && wall[1] },
    { key: "front", a: [uc + W / 2, vc + D / 2], b: [uc - W / 2, vc + D / 2], wall: !back && wall[2] },
    { key: "left", a: [uc - W / 2, vc + D / 2], b: [uc - W / 2, vc - D / 2], wall: left === true && wall[3] },
  ];
  const H = Math.min(2.55, (S.data.room.ceiling || 2.5) - 0.02);
  for (const e of edges) {
    const A = at(...e.a), B = at(...e.b);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const ang = -Math.atan2(B[1] - A[1], B[0] - A[0]);
    if (e.wall) {
      // wall cladding panel (+ joint profile at its ends)
      const n = [(tx - m[0]) / (Math.hypot(tx - m[0], ty - m[1]) || 1), (ty - m[1]) / (Math.hypot(tx - m[0], ty - m[1]) || 1)]; // wall → tray
      const p = box(len, H, 0.004, M.cladding);
      p.position.copy(v3(m[0] + n[0] * 0.003, m[1] + n[1] * 0.003, H / 2));
      p.rotation.y = ang;
      roomGroup.add(p);
    } else if (withGlass) {
      const gh = 2.0;
      const g = box(len - 0.01, gh, 0.008, M.glass);
      g.position.copy(v3(m[0], m[1], 0.035 + gh / 2));
      g.rotation.y = ang;
      g.castShadow = false;
      roomGroup.add(g);
      for (const [px, py, w, h] of [[m[0], m[1], len, 0.025]]) {
        const top = box(w, h, 0.03, M.chrome);
        top.position.copy(v3(px, py, 0.035 + gh));
        top.rotation.y = ang;
        roomGroup.add(top);
      }
      for (const P of [A, B]) {
        const post = box(0.025, gh, 0.03, M.chrome);
        post.position.copy(v3(P[0], P[1], 0.035 + gh / 2));
        post.rotation.y = ang;
        roomGroup.add(post);
      }
    }
  }
  const open = edges.find((e) => !e.wall && e.key === (back ? "front" : "back")) || edges.find((e) => !e.wall);
  // camera side: from the tray centre through its open edge
  let facing = [0, 1];
  if (open) {
    const A = at(...open.a), B = at(...open.b), m = [(A[0] + B[0]) / 2 - tx, (A[1] + B[1]) / 2 - ty], l = Math.hypot(...m) || 1;
    facing = [m[0] / l, m[1] / l];
  }
  return { center: [tx, ty], facing, size: [W, D] };
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
function rebuild() {
  scene.remove(roomGroup);
  roomGroup = new THREE.Group();
  scene.add(roomGroup);
  showerFrame = null;
  const d = S.data;
  if (!d?.room) return;
  buildRoom(d.room);
  const spot = d.spots[S.spot];
  const [tw, td] = $("#tray").value.split("×").map((n) => Number(n) / 100);
  for (const o of d.room.objects) {
    if (S.mode === "nachher" && spot && o === spot.object) continue;
    if (S.mode === "nachher" && spot && o.x === spot.object.x && o.y === spot.object.y) continue;
    addObject(o);
  }
  if (S.mode === "nachher" && spot) showerFrame = addShower(spot, tw, td, $("#glass").value !== "ohne");
  setView(S.view === "vorn" && !showerFrame ? "oben" : S.view);
  renderInfo();
}

const SIT = { nische: "Nische (3 Wände)", ecke: "Ecke (2 Wände)", wand: "an einer Wand", frei: "freistehend" };
function renderInfo() {
  const d = S.data;
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
for (const id of ["#spot", "#tray", "#glass"]) $(id).addEventListener("change", () => { S.spot = Number($("#spot").value) || 0; rebuild(); });
$("#shot").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/jpeg", 0.9);
  a.download = `raum3d-${S.data?.plan?.name || "plan"}-${S.mode}-${S.view}.jpg`;
  a.click();
});

const q = new URLSearchParams(location.search).get("deal");
if (q) { $("#load").deal.value = q; load(q); }
