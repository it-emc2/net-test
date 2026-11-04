// Proves a typing change is type-only: transpiles the committed and the working version of a
// TS file to JS (types erased) and compares the output byte for byte.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
const [file, rev = "HEAD"] = process.argv.slice(2);
const rel = execFileSync("git", ["ls-files", "--full-name", file]).toString().trim();
const before = execFileSync("git", ["show", `${rev}:${rel}`]).toString();
const after = readFileSync(file, "utf8");
const emit = (src) => ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText.replace(/\s+/g, " ");
const a = emit(before), b = emit(after);
if (a === b) { console.log(`IDENTICAL JS: ${rel} (${rev} vs working copy)`); process.exit(0); }
let i = 0; while (a[i] === b[i]) i++;
console.log(`DIFFERENT JS at char ${i}:\n  before: …${a.slice(Math.max(0, i - 80), i + 80)}\n  after:  …${b.slice(Math.max(0, i - 80), i + 80)}`);
process.exit(1);
