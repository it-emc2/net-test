#!/usr/bin/env node
// Makes a mechanically ported legacy JS file compile under `strict` using TYPE-ONLY edits,
// driven by exact compiler diagnostics (positions from the TypeScript API). Repeats until no
// error is left or no progress is made. It never changes runtime behaviour on purpose — and
// that is not trusted: the drift guard (packages/pricing/test/sync-with-legacy.test.ts)
// proves the emitted JS is identical to the legacy file.
//
//   node scripts/strictify.mjs packages/pricing/src/core.ts
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const file = process.argv[2];
const OPTS = {
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, types: [],
};

function diagnostics(text) {
  const host = ts.createCompilerHost(OPTS, true);
  const orig = host.getSourceFile;
  host.getSourceFile = (name, lang, ...rest) =>
    name === file ? ts.createSourceFile(name, text, lang, true) : orig.call(host, name, lang, ...rest);
  host.readFile = ((r) => (name) => (name === file ? text : r(name)))(host.readFile);
  const program = ts.createProgram([file], OPTS, host);
  const sf = program.getSourceFile(file);
  return { sf, diags: [...program.getSemanticDiagnostics(sf), ...program.getSyntacticDiagnostics(sf)], checker: program.getTypeChecker() };
}

const nodeAt = (sf, pos) => {
  let found;
  const visit = (n) => { if (pos >= n.getStart(sf) && pos < n.getEnd()) { found = n; ts.forEachChild(n, visit); } };
  visit(sf);
  return found;
};
const up = (n, pred) => { while (n && !pred(n)) n = n.parent; return n; };

function plan({ sf, diags, checker }) {
  const edits = []; // { pos, insert } or { start, end, replace }
  const seen = new Set();
  const once = (key, e) => { if (!seen.has(key)) { seen.add(key); edits.push(e); } };
  for (const d of diags) {
    if (d.start === undefined) continue;
    const n = nodeAt(sf, d.start);
    if (!n) continue;
    const c = d.code;
    if (c === 7006 || c === 7031) { // implicit any parameter
      const p = up(n, ts.isParameter);
      if (!p || p.type) continue;
      const fn = p.parent;
      const bare = ts.isArrowFunction(fn) && fn.parameters.length === 1 && !sf.text.slice(fn.getStart(sf), p.getStart(sf)).includes("(");
      if (bare) once(`p${p.pos}`, { start: p.getStart(sf), end: p.name.getEnd(), replace: `(${p.name.getText(sf)}: any)` });
      else once(`p${p.pos}`, { pos: (p.questionToken ?? p.name).getEnd(), insert: ": any" });
    } else if (c === 7034 || c === 7005) { // implicit any variable
      const sym = checker.getSymbolAtLocation(ts.isIdentifier(n) ? n : n.name ?? n);
      const decl = sym?.valueDeclaration ?? up(n, ts.isVariableDeclaration);
      if (decl && ts.isVariableDeclaration(decl) && !decl.type) {
        const isArr = decl.initializer && ts.isArrayLiteralExpression(decl.initializer);
        once(`v${decl.pos}`, { pos: decl.name.getEnd(), insert: isArr ? ": any[]" : ": any" });
      }
    } else if (c === 7023 || c === 7024) { // implicit any return
      const fn = up(n, (x) => ts.isFunctionDeclaration(x) || ts.isArrowFunction(x) || ts.isFunctionExpression(x));
      if (fn && !fn.type) {
        const close = fn.parameters.end; // position of ')'
        const at = sf.text.indexOf(")", close) + 1;
        once(`r${fn.pos}`, { pos: at, insert: ": any" });
      }
    } else if (c === 7053 || c === 2339 || c === 2362 || c === 2363 || c === 2365 || c === 2345 || c === 2698 || c === 2464 || c === 18046) {
      // untyped access / arithmetic / argument / spread → wrap the offending expression in (x as any)
      let target = n;
      if (c === 7053) target = up(n, ts.isElementAccessExpression)?.expression ?? n;
      else if (c === 2339) target = up(n, (x) => ts.isPropertyAccessExpression(x) && x.name === n)?.expression ?? n.parent?.expression ?? n;
      else if (c === 18046 && ts.isIdentifier(n)) {
        const sym = checker.getSymbolAtLocation(n);
        const decl = sym?.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && ts.isCatchClause(decl.parent) && !decl.type) { once(`c${decl.pos}`, { pos: decl.name.getEnd(), insert: ": any" }); continue; }
      } else {
        target = up(n, (x) => x.getStart(sf) === d.start && x.getEnd() === d.start + d.length) ?? n;
        // operator errors (2362/2363/2365): wrap the offending OPERAND, never the whole binary expression
        if (ts.isBinaryExpression(target)) {
          const t = checker.getTypeAtLocation(target.left);
          target = (t.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Object | ts.TypeFlags.Null | ts.TypeFlags.Undefined)) ? target.left : target.right;
        }
      }
      if (!target || !ts.isExpression(target)) continue;
      if (/ as any\)$/.test(target.getText(sf)) || (ts.isParenthesizedExpression(target.parent) && /^\(.* as any\)$/s.test(target.parent.getText(sf)))) continue;
      once(`w${target.getStart(sf)}:${target.getEnd()}`, { start: target.getStart(sf), end: target.getEnd(), replace: `(${target.getText(sf)} as any)` });
    } else if (c === 2532 || c === 18048 || c === 18047 || c === 2533) { // possibly undefined/null → non-null assertion
      const e = up(n, (x) => x.getStart(sf) === d.start && x.getEnd() === d.start + d.length) ?? n;
      if (sf.text[e.getEnd()] === "!") continue; // already asserted
      once(`n${e.getEnd()}`, { pos: e.getEnd(), insert: "!" });
    } else if (c === 2554) { // too few arguments → make trailing params optional
      const call = up(n, ts.isCallExpression);
      const sig = call && checker.getResolvedSignature(call);
      const decl = sig?.declaration;
      if (!decl || !decl.parameters) continue;
      decl.parameters.forEach((p, i) => {
        if (i >= call.arguments.length && !p.questionToken && !p.initializer && !p.dotDotDotToken) once(`o${p.pos}`, { pos: p.name.getEnd(), insert: "?" });
      });
    }
  }
  return edits;
}

function applyEdits(text, edits) {
  const norm = edits.map((e) => ("insert" in e ? { start: e.pos, end: e.pos, replace: e.insert } : e));
  // drop edits nested inside a larger replacement (they are re-planned next round)
  norm.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text, lastStart = Infinity;
  for (const e of norm) {
    if (e.end > lastStart) continue;
    out = out.slice(0, e.start) + e.replace + out.slice(e.end);
    lastStart = e.start;
  }
  return out;
}

let text = readFileSync(file, "utf8");
let prevCount = Infinity;
for (let round = 1; round <= 25; round++) {
  const info = diagnostics(text);
  const n = info.diags.length;
  console.log(`round ${round}: ${n} errors`);
  if (!n) break;
  if (n >= prevCount) { // no progress → report and stop (never loop edits)
    for (const d of info.diags.slice(0, 20)) {
      const { line } = info.sf.getLineAndCharacterOfPosition(d.start ?? 0);
      console.log(`  unresolved TS${d.code} line ${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 110)}`);
    }
    break;
  }
  prevCount = n;
  const edits = plan(info);
  if (!edits.length) {
    for (const d of info.diags.slice(0, 15)) {
      const { line } = info.sf.getLineAndCharacterOfPosition(d.start ?? 0);
      console.log(`  unresolved TS${d.code} line ${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 120)}`);
    }
    break;
  }
  text = applyEdits(text, edits);
}
writeFileSync(file, text);
