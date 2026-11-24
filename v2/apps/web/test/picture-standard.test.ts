// The picture standard (UX-CHANGES U-011 A6): every product picture on a step takes its size from
// IMG in shared/ui — one size per role, everywhere, large enough to read on the tablet. A picture
// with a size of its own would bring back the mix of eight sizes (28–96 px) there was before.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IMG } from "../src/shared/ui/index.js";

const ROOT = resolve(import.meta.dirname, "../src/features/steps");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : []));
/** pictures that are not product pictures of a fixed role: the before/after photos, and the gallery with its lightbox */
const OWN_SIZE = [/aspect-square w-full object-cover/, /max-h-\[80vh\]/, /max-h-64 max-w-full/, /className="size-full object-cover"/];

describe("the picture standard", () => {
  // in rem: at the app's text size (18 px) that is 45 / 72 / 90 / 108 px and 144 px tall — before: 28 to 96 px in eight sizes
  it("the sizes: mini 2.5 rem, a row picture 4 rem, a swatch 5 rem, a tile 6 rem, a product photo 8 rem tall", () => {
    expect(IMG).toEqual({ mini: "size-10 photo-plate", row: "size-16 photo-plate", swatch: "size-20", tile: "size-24 photo-plate", product: "h-32 photo-plate" });
  });

  it("product photos sit on the photo plate (white light, inset light plate dark); a decor swatch does not (U-059)", () => {
    for (const role of ["mini", "row", "tile", "product"] as const) expect(IMG[role]).toContain("photo-plate");
    expect(IMG.swatch).not.toContain("photo-plate");
  });

  it("every picture on a step takes its size from the standard", () => {
    const own = files(ROOT).flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((line, i) =>
      [...line.matchAll(/<img\b.*?\/>/g)].map((m) => m[0]).filter((tag) => !/IMG\.(mini|row|swatch|tile|product)\b/.test(tag) && !OWN_SIZE.some((r) => r.test(tag))).map((tag) => `${f.slice(ROOT.length + 1)}:${i + 1} ${tag.slice(0, 90)}`)));
    expect(own).toEqual([]);
  });
});
