// „Welche Wände werden verkleidet?“ as picture tiles (owner sketches 2026-11-26): a small view into the
// bathroom — back wall, the two side walls, a shower tray in the right corner, a washbasin on the back
// wall — with the covered area in the accent colour. Only the look: the values (`wvKind`) and the full
// texts used elsewhere are KINDS in rules.ts — the full text stays the accessible name.
// Drawn with theme colours only (currentColor, --primary), so it reads in light and dark.
// 2026-11-27: „Fliesenspiegel Duschbereich“ (the shower corner up to the tiles' height, with tile
// joints) and „Alle Wände halbhoch“ (every wall up to half its height, with a height arrow).
// 2026-11-27 (owner): „Fehlstellen“ is ONE picture — the strip of wall a removed bathtub leaves open
// (bathtub → shower), not two loose patches.
import type { ReactNode } from "react";
import type { ChoiceTile } from "../../../shared/ui/choice-tiles.js";
import { KINDS } from "./rules.js";

// the room, in a 120 × 90 box: the back wall and the side walls meeting it
const BACK = "28,14 92,14 92,70 28,70";
const LEFT = "0,0 28,14 28,70 0,90";
const RIGHT = "120,0 92,14 92,70 120,90";
// the shower corner (back wall right, right wall near the back) and its tray on the floor
const SHOWER_BACK_X = 68, SIDE_X = 106; // where the shower ends on the back wall / on the right wall
const sideTop = (x: number) => 14 - ((x - 92) * 14) / 28, sideFloor = (x: number) => 70 + ((x - 92) * 20) / 28;
const showerArea = (top: number) => {
  const t = (top - 14) / 56; // the share of the wall height left out above
  const sideY = sideTop(SIDE_X) + t * (sideFloor(SIDE_X) - sideTop(SIDE_X));
  return [`${SHOWER_BACK_X},${top} 92,${top} 92,70 ${SHOWER_BACK_X},70`, `92,${top} ${SIDE_X},${sideY} ${SIDE_X},${sideFloor(SIDE_X)} 92,70`];
};

/** every wall from the floor up to `t` (0 = ceiling … 1 = floor) of its height */
const wallsUpTo = (t: number) => {
  const at = (top: number, floor: number) => Math.round((top + t * (floor - top)) * 10) / 10;
  const back = at(14, 70), side = at(0, 90);
  return [`28,${back} 92,${back} 92,70 28,70`, `0,${side} 28,${back} 28,70 0,90`, `120,${side} 92,${back} 92,70 120,90`];
};
const TUB_BACK_X = 40, TUB_TOP = 58; // the removed bathtub: where it began on the back wall, and its rim
const TILE_TOP = 42; // the tiles' height in the shower corner (half the wall)

const HL = { fill: "var(--primary)", fillOpacity: 0.4, stroke: "var(--primary-text)", strokeWidth: 1.5, strokeLinejoin: "round" } as const;
const Covered = ({ points }: { points: readonly string[] }) => <>{points.map((p) => <polygon key={p} points={p} {...HL} />)}</>;

function Room({ children, cabin }: { children?: ReactNode; cabin?: boolean }) {
  return (
    <svg viewBox="-2 -2 124 94" className="h-auto w-full max-w-36" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round">
      {children}
      <polygon points={BACK} /><polygon points={LEFT} /><polygon points={RIGHT} />
      {/* washbasin on the back wall, tray in the shower corner */}
      <path d="M38 46 h16 v2 a8 6 0 0 1 -16 0 z" />
      <polygon points={`${SHOWER_BACK_X},70 92,70 ${SIDE_X},${sideFloor(SIDE_X)} ${SHOWER_BACK_X - 4},${sideFloor(SIDE_X)}`} />
      <path d="M86 22 v6 m-3 0 h6" />
      {cabin ? <path d={`M${SHOWER_BACK_X - 4} ${sideFloor(SIDE_X)} V32 H${SIDE_X} V${sideFloor(SIDE_X)} M${SHOWER_BACK_X - 4} 32 L${SHOWER_BACK_X} 28`} strokeDasharray="3 2" /> : null}
    </svg>
  );
}

/** value → short label and the covered area */
const SKETCH: Record<string, { label: string; picture: ReactNode }> = {
  Fehlstellen: { label: "Fehlstellen", picture: (
    <Room>
      {/* the strip of wall the removed bathtub left open: along the back wall, longer than the new tray, and round the corner */}
      <Covered points={[`${TUB_BACK_X},${TUB_TOP} 92,${TUB_TOP} 92,70 ${TUB_BACK_X},70`, showerArea(TUB_TOP)[1]!]} />
      {/* where the bathtub stood */}
      <path d={`M${TUB_BACK_X} 70 L${TUB_BACK_X - 4} ${sideFloor(SIDE_X)} H${SHOWER_BACK_X - 4}`} strokeDasharray="3 2" strokeWidth={1} />
    </Room>
  ) },
  Fliesenspiegel: { label: "Fliesenspiegel", picture: <Room><Covered points={["28,34 66,34 66,46 28,46"]} /></Room> },
  "Fliesenspiegel-Duschbereich": { label: "Fliesenspiegel Duschbereich", picture: (
    <Room>
      <Covered points={showerArea(TILE_TOP)} />
      {/* tile joints on the covered back wall */}
      <path d={`M${SHOWER_BACK_X} 51 H92 M${SHOWER_BACK_X} 60 H92 M76 ${TILE_TOP} V70 M84 ${TILE_TOP} V70`} strokeWidth={0.9} />
    </Room>
  ) },
  "Innenraum-der-Kabine": { label: "Kabine innen", picture: <Room cabin><Covered points={showerArea(30)} /></Room> },
  Deckenhoch: { label: "Duschbereich deckenhoch", picture: <Room><Covered points={showerArea(14)} /></Room> },
  "alle-Bad-Wände-halbhoch": { label: "Alle Wände halbhoch", picture: (
    <Room>
      <Covered points={wallsUpTo(0.5)} />
      {/* the height, up from the floor on the left wall */}
      <path d="M11 82 V46 M8 49 l3 -3.5 l3 3.5 M8 82 h6" />
    </Room>
  ) },
  "alle-Bad-Wände": { label: "Alle Wände", picture: <Room><Covered points={[BACK, LEFT, RIGHT]} /></Room> },
};

export const KIND_TILES: readonly ChoiceTile[] = KINDS.map((k) => ({ value: k.value, name: k.label, ...(SKETCH[k.value] ?? { label: k.label, picture: <Room /> }) }));
