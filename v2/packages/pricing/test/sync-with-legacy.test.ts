// Drift guard: the TS ports must compile to EXACTLY the legacy JavaScript (types erased,
// comments removed, whitespace normalised). Fails as soon as main changes
// src/logic/pricing-core.js or tray-search-core.js without the port being updated.
// Fix: re-port (see docs/rewrite/DECISIONS.md ADR 013, "Sync with main").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const emit = (src: string) =>
  ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, removeComments: true },
  }).outputText.replace(/\s+/g, " ").trim();

function firstDiff(a: string, b: string) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}:\n  legacy: …${a.slice(Math.max(0, i - 80), i + 120)}\n  port:   …${b.slice(Math.max(0, i - 80), i + 120)}`;
}

describe("TS ports are in sync with the legacy JavaScript on this branch", () => {
  it.each([
    ["../../../../src/logic/pricing-core.js", "../src/core.ts"],
    ["../../../../src/logic/tray-search-core.js", "../src/tray-search.ts"],
    ["../../../../src/logic/aufschlag-rules.js", "../src/aufschlag-rules.ts"],
  ])("%s ≡ %s", (legacyPath, portPath) => {
    const legacy = emit(read(legacyPath));
    const port = emit(read(portPath));
    if (legacy !== port) throw new Error(`port drifted from legacy ${firstDiff(legacy, port)}`);
    expect(port).toBe(legacy);
  });
});
