// Mechanical file moves inside v2/apps/server (ADR 026, phase 1): `git mv` + rewrite of every
// relative import that points at a moved file, in src/ and test/. No other change.
//   node v2/scripts/move-files.mjs <map.json>      map: { "src/auth.ts": "src/platform/auth.ts", "src/sends/": "src/modules/sends/" }
// A key ending in "/" moves the whole folder. Paths are relative to v2/apps/server.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/server");
const map = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist"].includes(e.name)) yield* walk(full); }
    else yield full;
  }
}
const rel = (abs) => path.relative(SERVER, abs).split(path.sep).join("/");
const all = [...walk(path.join(SERVER, "src")), ...walk(path.join(SERVER, "test"))].map(rel);

// old → new for every file
const moves = new Map();
for (const [from, to] of Object.entries(map)) {
  if (from.endsWith("/")) { for (const f of all) if (f.startsWith(from)) moves.set(f, to + f.slice(from.length)); }
  else { if (!all.includes(from)) throw new Error(`not found: ${from}`); moves.set(from, to); }
}
const newPath = (f) => moves.get(f) ?? f;

// a relative specifier seen in `file` → the file it means (TS sources are imported as .js)
function resolve(file, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  for (const c of [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), base.replace(/\.mjs$/, ".mts"), `${base}.ts`, `${base}/index.ts`]) {
    if (all.includes(c)) return c;
  }
  return null;
}
const SPEC_RE = /((?:from|import)\s*\(?\s*|vi\.mock\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g;

let rewritten = 0;
const code = all.filter((f) => /\.(ts|tsx|mts|mjs|js)$/.test(f));
const edits = new Map();
for (const file of code) {
  const src = fs.readFileSync(path.join(SERVER, file), "utf8");
  const out = src.replace(SPEC_RE, (m, lead, q, spec) => {
    const target = resolve(file, spec);
    if (!target) return m; // outside src/test (scripts, legacy files) — left alone, checked by hand
    const fromNew = newPath(file), toNew = newPath(target);
    if (fromNew === file && toNew === target) return m;
    let next = path.posix.relative(path.posix.dirname(fromNew), toNew);
    if (!next.startsWith(".")) next = `./${next}`;
    // keep the written extension style (.js for .ts sources)
    const ext = path.posix.extname(spec);
    if (ext) next = next.replace(/\.(ts|tsx|mts)$/, ext); else next = next.replace(/\.(ts|tsx|mts)$/, "");
    if (next === spec) return m;
    rewritten++;
    return `${lead}${q}${next}${q}`;
  });
  if (out !== src) edits.set(file, out);
}
for (const [file, out] of edits) fs.writeFileSync(path.join(SERVER, file), out);
for (const [from, to] of moves) {
  fs.mkdirSync(path.dirname(path.join(SERVER, to)), { recursive: true });
  execFileSync("git", ["mv", path.join(SERVER, from), path.join(SERVER, to)]);
}
console.log(`moved ${moves.size} files, rewrote ${rewritten} imports in ${edits.size} files`);
