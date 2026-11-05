// Drift guard: verbatim ports must equal the legacy files on this branch (fails after a main
// sync that changed them → run `node v2/scripts/port-verbatim.mjs`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script
import { PORTS, expected } from "../../../scripts/port-verbatim.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
describe("verbatim ports in sync with legacy", () => {
  it.each(PORTS.map((p: { from: string; to: string; transforms?: unknown[] }) => [p.from, p.to, p.transforms ?? []]))("%s ≡ %s", (from, to, transforms) => {
    expect(fs.readFileSync(path.join(ROOT, to as string), "utf8")).toBe(expected(from, transforms));
  });
});
