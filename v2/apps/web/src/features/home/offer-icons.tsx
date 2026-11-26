// One icon per offer type on the Hauptmenü tiles (owner sketches 2026-11-26). Decorative: the tile's
// name stays its title and abbreviation. lucide has no stairs, so the Handlauf icon is drawn here in
// lucide's grid and stroke (24 × 24, 2 px, round caps).
import type { NewOfferType } from "@oc/domain";
import type { ReactNode } from "react";
import { Accessibility, Bath, DoorOpen, HandHeart, Snowflake, Wrench, type LucideProps } from "lucide-react";

/** stairs with a handrail above them */
function Handrail({ className, strokeWidth = 2 }: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h5v-4h4v-4h4V9h5" />
      <path d="M3 14 19 3.3" />
      <path d="M5 12.7V21M14 6.6V13" />
    </svg>
  );
}

const ICONS: Record<NewOfferType, (p: LucideProps) => ReactNode> = {
  bu: Bath, bwt: DoorOpen, hl: Handrail, bl: Accessibility, ah: HandHeart, hms: Wrench, wd: Snowflake,
};

export function OfferIcon({ type }: { type: NewOfferType }) {
  const Icon = ICONS[type];
  return <Icon className="size-7" strokeWidth={1.75} />;
}
