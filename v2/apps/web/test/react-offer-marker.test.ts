// Every offer the React app saves says who saved it (`client: "react"`): the server pins the
// price of every offer the old app stored, always, and prices fresh only an offer the React app
// created and never sent (ADR 023, addendum 2026-11-18; server: sends/origin.ts). A save without
// the marker would be taken for an old-app offer — safe, but the price of a changed, unsent
// React offer would stay frozen again (audit finding F1).
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../src");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

it("every saveOffer call carries client: \"react\"", () => {
  const calls = files(ROOT).flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((line, i) => (line.includes('call("saveOffer"') ? [{ at: `${f.slice(ROOT.length + 1)}:${i + 1}`, marked: /call\("saveOffer", \{ body: \{ client: "react",/.test(line) }] : [])));
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.filter((c) => !c.marked).map((c) => c.at)).toEqual([]);
});
