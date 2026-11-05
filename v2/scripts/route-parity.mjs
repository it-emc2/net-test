// Drift guard helper: every legacy route (src/app.js + mounted routers) vs. every v2 route.
// Usage: node v2/scripts/route-parity.mjs  → prints legacy routes missing in v2.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const M = "get|post|put|delete|patch";

export function legacyRoutes() {
  const app = read("src/app.js");
  const imports = Object.fromEntries(
    [...app.matchAll(/import (\w+)(?:,\s*\{[^}]*\})? from ["']\.\/routes\/([\w-]+)\.js["']/g)].map((m) => [m[1], m[2]]),
  );
  const out = new Set();
  for (const m of app.matchAll(new RegExp(`app\\.(${M})\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g"))) out.add(`${m[1].toUpperCase()} ${m[2]}`);
  for (const m of app.matchAll(/app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g)) {
    const file = imports[m[2]];
    if (!file) continue;
    const src = read(`src/routes/${file}.js`);
    const vars = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:express\.)?Router\(/g)].map((x) => x[1]);
    const re = new RegExp(`\\b(?:${vars.join("|") || "router"})\\.(${M})\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g");
    for (const r of src.matchAll(re)) out.add(`${r[1].toUpperCase()} ${(m[1] + (r[2] === "/" ? "" : r[2])).replace(/\/+/g, "/")}`);
  }
  return out;
}

export function v2Routes() {
  const out = new Set();
  const files = [
    ...fs.readdirSync(path.join(ROOT, "v2/apps/server/src/routes")).map((f) => `v2/apps/server/src/routes/${f}`),
    "v2/apps/server/src/app.ts",
  ];
  for (const f of files) {
    for (const m of read(f).matchAll(new RegExp(`app\\.(${M})\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g"))) out.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return out;
}

export const norm = (r) => r.replace(/:\w+/g, ":p");

export function missingInV2() {
  const v2 = new Set([...v2Routes()].map(norm));
  return [...legacyRoutes()].filter((r) => !v2.has(norm(r))).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = missingInV2();
  console.log(`legacy ${legacyRoutes().size} · v2 ${v2Routes().size} · missing ${missing.length}`);
  console.log(missing.join("\n"));
}
