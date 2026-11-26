// One look for every decor / colour choice in the wall and floor steps (Wandverkleidung,
// Fußboden, all modes): large square swatches — always 2 per row on a phone and 4 on the tablet,
// so every picker in both steps has the same tile size — name and number below; the chosen one with a 3 px primary frame, a filled
// check badge in the picture's corner and a light primary tint. Only the look is shared — each
// place keeps its own element and semantics (radio button, label + radio input, pressed button).
import { Check } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** the grid the tiles sit in: 2 columns on a phone, 4 on the tablet (owner 2026-11-25: one tile size everywhere) */
export function SwatchGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4", className)} {...props} />;
}

/** the classes of one tile; `on`: the chosen one */
export const swatchTile = (on: boolean, className?: string): string =>
  cn(
    "relative grid min-w-0 cursor-pointer content-start gap-1 rounded-xl border-2 p-1.5 text-center text-[0.9rem] leading-snug text-foreground hyphens-auto [overflow-wrap:break-word] transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
    on ? "border-primary bg-primary/10 font-semibold ring-1 ring-primary dark:bg-primary/25" : "border-border bg-card hover:border-input",
    className,
  );

/** the square picture (a background image, else `label` on a neutral surface) and, when chosen, the check badge */
export function SwatchFace({ img, label, on, dashed }: { img?: string; label?: ReactNode; on: boolean; dashed?: boolean }) {
  return (
    <span className="relative block w-full">
      <i aria-hidden data-part="label" className={cn("grid aspect-square w-full place-items-center rounded-lg border border-border bg-muted bg-cover bg-center not-italic text-muted-foreground", dashed && "border-2 border-dashed border-input bg-transparent text-3xl")} style={img ? { backgroundImage: `url("${img}")` } : undefined}>{label}</i>
      {on ? <TickBadge /> : null}
    </span>
  );
}

/** the filled check badge in the picture's top right corner of a chosen tile (swatches and ChoiceTiles) */
export function TickBadge() {
  return (
    <span aria-hidden data-part="check" className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card">
      <Check className="size-5" strokeWidth={3} />
    </span>
  );
}
