// Accessory cards (Wandverkleidung: winwall, VIGOUR, Badolux; owner 2026-11-25): the picture on top
// (the product photo the old UI shows, IMG.product; a neutral icon tile where there is none), the
// name, the article / detail line, the tick box and − / +. 2 per row on a phone, 3 on the tablet; a
// ticked card is framed and tinted like a chosen decor tile. Only the look — each place keeps its
// own fields, ids and semantics (the tick box, the quantity, the suggestions).
import type { ChangeEvent, HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { IMG } from "./index.js";

/** the grid the cards sit in */
export function AccGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3", className)} {...props} />;
}

/** One accessory. `check`: the tick box (none for a plain count); `stepper`: − / + under the text. */
export function AccCard({ testId, on, img, icon, check, caption, small, stepper }: {
  testId: string; on: boolean; img?: string | undefined; icon?: ReactNode;
  check?: { checked: boolean; onChange: (e: ChangeEvent<HTMLInputElement>) => void; id?: string } | undefined;
  caption: ReactNode; small: ReactNode; stepper?: ReactNode;
}) {
  const body = (
    <>
      <span className="relative block">
        {img
          ? <img src={img} alt="" loading="lazy" className={cn(IMG.product, "w-full rounded-lg object-contain")} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          : <span aria-hidden data-part="icon" className={cn(IMG.product, "grid w-full place-items-center rounded-lg text-muted-foreground [&_svg]:size-12")}>{icon}</span>}
        {check ? <input id={check.id} type="checkbox" className="absolute left-1.5 top-1.5 size-6 cursor-pointer accent-[var(--primary)]" checked={check.checked} onChange={check.onChange} /> : null}
      </span>
      <span data-part="caption" className="font-semibold leading-snug">{caption}</span>
      <small data-part="small" className="leading-snug text-muted-foreground">{small}</small>
    </>
  );
  const text = "grid min-w-0 content-start gap-1 hyphens-auto [overflow-wrap:anywhere]";
  return (
    <div data-testid={testId} data-on={on} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-between gap-2 rounded-xl border-2 p-1 sm:p-2", on ? "border-primary bg-primary/10 ring-1 ring-primary dark:bg-primary/25" : "border-border bg-card")}>
      {check ? <label className={cn(text, "cursor-pointer")}>{body}</label> : <div className={text}>{body}</div>}
      {stepper ? <div className="flex justify-center">{stepper}</div> : null}
    </div>
  );
}
