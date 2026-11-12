// Module boundary guard (ADR 026). Rules:
//  server  apps/server/src/modules/<a>/…  may import another module only through modules/<b>/index
//          apps/server/src/platform/… and integrations/… never import modules/…
//  web     apps/web/src/features/<a>/…    may import another feature only through features/<b>/index
//          apps/web/src/shared/… never imports features/…
//          features never register document/window listeners (state comes from the store)
// Usage: node v2/scripts/module-boundaries.mjs  → prints violations, exit 1 if any.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AREAS = [
  { root: "apps/server/src", units: "modules", closed: ["platform", "integrations"] },
  { root: "apps/web/src", units: "features", closed: ["shared"] },
];
const IMPORT_RE = /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
const LISTENER_RE = /\b(document|window)\s*\.\s*addEventListener\s*\(/;

/** "modules/offers/service.ts" → { kind: "unit", name: "offers", rest: "service.ts" } (paths relative to the area root) */
function place(rel, area) {
  const parts = rel.split("/");
  if (parts[0] === area.units && parts.length >= 2) return { kind: "unit", name: parts[1], rest: parts.slice(2).join("/") };
  if (area.closed.includes(parts[0])) return { kind: "closed", name: parts[0] };
  return { kind: "other" };
}
const isIndex = (rest) => rest === "" || /^index(\.(js|ts|tsx|mjs))?$/.test(rest);

/** One import seen in `fromRel` (both paths relative to the area root, "/" separators). Returns a message or null. */
export function checkImport(fromRel, spec, area) {
  if (!spec.startsWith(".")) return null; // packages are always allowed
  const targetRel = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  const from = place(fromRel, area), to = place(targetRel, area);
  if (to.kind !== "unit") return null;
  if (from.kind === "closed") return `${area.root}/${fromRel}: ${from.name}/ must not import ${area.units}/${to.name}`;
  if (from.kind === "unit" && from.name !== to.name && !isIndex(to.rest)) {
    return `${area.root}/${fromRel}: import "${spec}" reaches into ${area.units}/${to.name} — use ${area.units}/${to.name}/index`;
  }
  return null;
}

/** Source text of one file → messages. */
export function checkSource(fromRel, source, area) {
  const out = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const msg = checkImport(fromRel, m[1] || m[2] || m[3], area);
    if (msg) out.push(msg);
  }
  if (area.units === "features" && place(fromRel, area).kind === "unit" && !/\.test\.tsx?$/.test(fromRel) && LISTENER_RE.test(source)) {
    out.push(`${area.root}/${fromRel}: features must not register document/window listeners (ADR 026)`);
  }
  return out;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "dist") yield* walk(full); }
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) yield full;
  }
}

export function violations() {
  const out = [];
  for (const area of AREAS) {
    const root = path.join(V2, area.root);
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      out.push(...checkSource(rel, fs.readFileSync(file, "utf8"), area));
    }
  }
  return out;
}
export { AREAS };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = violations();
  if (v.length) { console.error(v.join("\n")); process.exit(1); }
  console.log("module boundaries: ok");
}
