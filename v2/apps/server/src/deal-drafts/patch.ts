// Minimal JSON diff/patch for the draft revision history (ADR 007).
// Objects are diffed key by key; arrays and scalars are replaced as a whole (robust and
// readable: "materials[] changed" instead of index arithmetic). Paths use RFC 6901 escaping.
export type PatchOp =
  | { op: "add" | "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
const escape = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
const unescape = (k: string) => k.replace(/~1/g, "/").replace(/~0/g, "~");

/** Deep equality for JSON-like values (Date compared by time). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual(a[k], b[k]));
  }
  return Number.isNaN(a) && Number.isNaN(b);
}

/** Operations that turn `from` into `to`. */
export function diff(from: unknown, to: unknown, base = ""): PatchOp[] {
  if (jsonEqual(from, to)) return [];
  if (!isObj(from) || !isObj(to)) return [{ op: "replace", path: base, value: to }];
  const ops: PatchOp[] = [];
  for (const k of Object.keys(from)) {
    if (from[k] === undefined) continue;
    const p = `${base}/${escape(k)}`;
    if (!Object.prototype.hasOwnProperty.call(to, k) || to[k] === undefined) ops.push({ op: "remove", path: p });
    else ops.push(...diff(from[k], to[k], p));
  }
  for (const k of Object.keys(to)) {
    if (to[k] === undefined) continue;
    if (!Object.prototype.hasOwnProperty.call(from, k) || from[k] === undefined) ops.push({ op: "add", path: `${base}/${escape(k)}`, value: to[k] });
  }
  return ops;
}

/** Applies ops to a deep copy of `doc` (input is never mutated). */
export function apply(doc: unknown, ops: PatchOp[]): unknown {
  let root: unknown = structuredClone(doc);
  for (const op of ops) {
    if (op.path === "") { root = op.op === "remove" ? undefined : structuredClone((op as any).value); continue; }
    const keys = op.path.split("/").slice(1).map(unescape);
    let cur = root as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) {
      if (!isObj(cur[k])) throw new Error(`patch path not found: ${op.path}`);
      cur = cur[k] as Record<string, unknown>;
    }
    const last = keys[keys.length - 1]!;
    if (op.op === "remove") delete cur[last];
    else cur[last] = structuredClone(op.value);
  }
  return root;
}

/** Top-level section names touched by a patch — for a readable history ("Kundendaten, Rabatt"). */
export function touchedSections(ops: PatchOp[]): string[] {
  return [...new Set(ops.map((o) => unescape(o.path.split("/")[1] ?? "") || "(gesamt)"))].sort();
}
