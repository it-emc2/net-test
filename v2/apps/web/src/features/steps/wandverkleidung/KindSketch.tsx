// „Welche Wände werden verkleidet?“ as picture tiles (owner sketches 2026-11-26): a small view into the
// bathroom — back wall, the two side walls, a shower tray in the right corner, a washbasin on the back
// wall — with the covered area in the accent colour. Only the look: the values (`wvKind`) and the full
// texts used elsewhere are KINDS in rules.ts, unchanged — the full text stays the accessible name.
// Drawn with theme colours only (currentColor, --primary), so it reads in light and dark.
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
  Fehlstellen: { label: "Fehlstellen", picture: <Room><Covered points={["52,22 66,22 66,34 52,34", "31,52 45,52 45,64 31,64"]} /></Room> },
  Deckenhoch: { label: "Duschbereich deckenhoch", picture: <Room><Covered points={showerArea(14)} /></Room> },
  Fliesenspiegel: { label: "Fliesenspiegel", picture: <Room><Covered points={["28,34 66,34 66,46 28,46"]} /></Room> },
  "Innenraum-der-Kabine": { label: "Kabine innen", picture: <Room cabin><Covered points={showerArea(30)} /></Room> },
  "alle-Bad-Wände": { label: "Alle Wände", picture: <Room><Covered points={[BACK, LEFT, RIGHT]} /></Room> },
};

export const KIND_TILES: readonly ChoiceTile[] = KINDS.map((k) => ({ value: k.value, name: k.label, ...(SKETCH[k.value] ?? { label: k.label, picture: <Room /> }) }));
