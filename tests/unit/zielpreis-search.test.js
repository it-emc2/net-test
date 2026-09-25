// Zielpreis: findBestAufschlagUnits (src/public/script.js) must always land
// strictly below the target, as close as possible, from any starting estimate.
import fs from "fs";

const src = fs.readFileSync(new URL("../../src/public/script.js", import.meta.url), "utf8");
const fn = src.match(/  async function findBestAufschlagUnits[\s\S]*?\n  }\n/)[0];
const find = new Function(`${fn}; return findBestAufschlagUnits;`)();
const r2 = (x) => Math.round(x * 100) / 100;

test.each([
  [2000, 1500, 4180],
  [3137.77, 812.4, 8360],
  [900, 2900, 4180],
])("base %p fixed %p target %p", async (base, fixed, target) => {
  const price = async (u) => r2(r2(fixed + r2((base * u) / 1e6)) * 1.19);
  const goal = Math.round(target * 100 - 1) / 100;
  for (const u0 of [0, 297312, 999999]) {
    const best = await find(price, u0, goal);
    expect(await price(best)).toBeLessThan(target);
    expect(await price(best + 1)).toBeGreaterThan(goal);
  }
});

test("target below cost → -1", async () => {
  expect(await find(async () => 5000, 100, 4179.99)).toBe(-1);
});
