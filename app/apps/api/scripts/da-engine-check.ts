// Golden check for the ported Duschabtrennung wizard engine (1:1 of the legacy
// src/public/configurator/engine.js). Run: npx tsx apps/api/scripts/da-engine-check.ts
// Not part of the API build (tsconfig includes src/** only).
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as E from "../../web/src/features/offer/duschabtrennung/daEngine.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(resolve(dir, "../data/duschabtrennung/" + f), "utf-8"));
const vigour: any = load("vigour.json");
const badolux: any = load("badolux.json");

// Structure params: correct set + order, finish/size params excluded.
assert.deepStrictEqual(
  E.structureParamIds(vigour),
  ["1_EBS_Einbausituationen", "2_EBA_Einbauart", "4_AufbauDuschabtrennung", "Serie", "C-35238", "Montageart", "Duschabtrennung"],
);

// Initial step gating.
const s0 = E.initialState();
const step0 = E.currentStep(vigour, s0);
assert.strictEqual(step0.phase, "structure");
assert.strictEqual((step0 as any).paramId, "1_EBS_Einbausituationen");
assert.strictEqual(E.availableOptions(vigour, s0, "1_EBS_Einbausituationen").length, 6);

// Leaf resolution from a full structure selection.
const leaf = vigour.leaves[0];
let st: any = { selections: { ...leaf.selections }, sizes: {} };
assert.strictEqual(E.resolvedLeaf(vigour, st), leaf);

// Finish + size → article resolution, verified against an independent recomputation.
const dimOf = (id: string) =>
  id === "Glasart" ? "glasart" : /Beschichtung/i.test(id) ? "beschichtung" : id === "Profilfarbe" ? "profilfarbe" : /Einzugsautomatik/i.test(id) ? "einzugsautomatik" : null;
const target = leaf.components[0].articles[0].finish || {};
for (const fp of leaf.finish) {
  const d = dimOf(fp.id);
  if (d && target[d] != null) {
    const v = fp.values.find((x: any) => x.cat === target[d]);
    if (v) st.selections[fp.id] = v.value;
  }
}
let expectedNet = 0;
for (const c of leaf.components) {
  const offered = (dim: string) => c.articles.some((x: any) => x.finish && x.finish[dim] != null);
  const a =
    c.articles.find((x: any) =>
      ["glasart", "beschichtung", "profilfarbe", "einzugsautomatik"].every(
        (d) => target[d] == null || !offered(d) || (x.finish && x.finish[d] === target[d]),
      ),
    ) || c.articles[0];
  st = E.setComponentSize(st, c.key, a.width, a.height);
  expectedNet += a.net;
}
const r = E.resolveConfiguration(vigour, st);
assert.ok(r, "vigour resolve non-null");
assert.strictEqual(r!.net, expectedNet, "net matches independent sum");
assert.strictEqual(r!.currency, "EUR");
assert.strictEqual(r!.lines[0].article.articleNumber, "V2PT83LC");
assert.strictEqual(r!.lines[0].article.net, 501);

// Badolux: single param, no finish, discount baked into net.
assert.deepStrictEqual(E.structureParamIds(badolux), ["Produkt"]);
const bleaf = badolux.leaves[0];
let bs: any = { selections: { Produkt: bleaf.selections.Produkt }, sizes: {} };
assert.strictEqual(E.resolvedLeaf(badolux, bs), bleaf);
assert.strictEqual(E.finishParams(bleaf).length, 0);
const ba = bleaf.components[0].articles[0];
bs = E.setComponentSize(bs, bleaf.components[0].key, ba.width, ba.height);
const br = E.resolveConfiguration(badolux, bs);
assert.ok(br, "badolux resolve non-null");
assert.strictEqual(br!.net, ba.net);

// eslint-disable-next-line no-console
console.log("da-engine-check: ALL PASSED");
