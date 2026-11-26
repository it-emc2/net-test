// The Umbauart as picture tiles (owner sketches 2026-11-26): what is there → what comes, drawn from
// two icons with an arrow; „Ohne Rückbau“ as an „add“ pictogram. Only the look: the values and the
// full texts (offer documents, Angebotscheck, the ticked works) are KINDS in rules.ts, unchanged —
// the full text stays the tile's accessible name.
import { ArrowRight, Bath, CirclePlus, type LucideProps } from "lucide-react";
import type { ReactNode } from "react";
import type { ChoiceTile } from "../../../shared/ui/choice-tiles.js";
import { KINDS } from "./rules.js";

/** a shower: tray, pole with the head and its drops — drawn in lucide's grid and stroke (lucide's
 *  ShowerHead alone does not read as „Dusche“ at this size) */
function Shower({ className, strokeWidth = 2 }: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h18v3H3z" />
      <path d="M18 18V6a3 3 0 0 0-3-3h-3v2" />
      <path d="M9 5h6" />
      <path d="M10 8.5v.01M12 9v.01M14 8.5v.01M9.5 11.5v.01M12 12v.01M14.5 11.5v.01M11 14.5v.01M13 14.5v.01" />
    </svg>
  );
}

type Thing = { icon: (p: LucideProps) => ReactNode; word: string };
const BATH: Thing = { icon: Bath, word: "Wanne" }, SHOWER: Thing = { icon: Shower, word: "Dusche" };
const FROM_TO: Record<string, readonly [Thing, Thing]> = {
  wanne_dusche: [BATH, SHOWER], dusche_dusche: [SHOWER, SHOWER], wanne_wanne: [BATH, BATH], dusche_wanne: [SHOWER, BATH],
};

const Icon = ({ icon: I, now }: { icon: Thing["icon"]; now?: boolean }) => <I className={now ? "size-8 text-[var(--primary-text)]" : "size-8"} strokeWidth={1.75} />;

/** what is there (muted) → what comes (in the accent colour); low in the picture, clear of the tick badge */
function FromTo({ from, to }: { from: Thing; to: Thing }) {
  return <span className="flex items-center gap-1 self-end pb-1"><Icon icon={from.icon} /><ArrowRight className="size-4 shrink-0" strokeWidth={2.5} /><Icon icon={to.icon} now /></span>;
}

export const KIND_TILES: readonly ChoiceTile[] = KINDS.map((k) => {
  const pair = FROM_TO[k.value];
  return pair
    ? { value: k.value, name: k.label, label: `${pair[0].word} → ${pair[1].word}`, picture: <FromTo from={pair[0]} to={pair[1]} /> }
    : { value: k.value, name: k.label, label: k.label, picture: <CirclePlus className="size-10 self-end text-[var(--primary-text)]" strokeWidth={1.75} /> };
});
