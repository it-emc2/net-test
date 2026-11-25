// Panels drawn to scale: every format of one group shares one scale, so 100 × 205 is visibly
// shorter than 100 × 250 and 150 × 250 visibly wider. The largest dimension of the group (width
// or height) maps to `maxPx`; all boxes stand on one baseline of `height` px.

export interface PlateSize { width: number; height: number }
export interface PlateBox { w: number; h: number }

/** One scale for the whole group: px per unit = maxPx / the largest width or height in it.
 *  Sizes ≤ 0 or not finite draw as 0 × 0; an empty group (or one with no size) has height 0. */
export function scalePlates(sizes: readonly PlateSize[], maxPx = 132): { boxes: PlateBox[]; height: number; perUnit: number } {
  const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const max = Math.max(0, ...sizes.flatMap((s) => [ok(s.width), ok(s.height)]));
  const perUnit = max > 0 ? maxPx / max : 0;
  const boxes = sizes.map((s) => ({ w: Math.round(ok(s.width) * perUnit), h: Math.round(ok(s.height) * perUnit) }));
  return { boxes, height: Math.max(0, ...boxes.map((b) => b.h)), perUnit };
}
