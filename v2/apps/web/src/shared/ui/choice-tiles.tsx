// One question with a few answers as picture tiles (owner sketches 2026-11-26: Umbauart, Wandverkleidung
// „Welche Wände werden verkleidet?“). The look is the swatch language (swatch.tsx): the chosen tile with a
// 3 px primary frame, the filled check badge in the picture's corner and a light primary tint.
// The semantics are native radio buttons in a radiogroup: arrow keys move and choose, space chooses,
// the browser and screen readers know the state — and forms and tests read `input:checked` as before.
// Each tile shows a short label; its accessible name (and tooltip) is the full text of the answer.
import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { TickBadge, swatchTile } from "./swatch.js";

export interface ChoiceTile {
  value: string;
  /** the short text on the tile */
  label: string;
  /** the full text of the answer — the accessible name and tooltip; the label when not given */
  name?: string | undefined;
  /** a second, smaller line under the label */
  sublabel?: string | undefined;
  /** the picture or icon above the label (decorative: hidden from screen readers) */
  picture?: ReactNode;
}

/** tiles per row on the tablet (5: 3 + 2 on a narrow tablet); always 2 on a phone */
const PER_ROW = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-3 md:grid-cols-5" } as const;

export function ChoiceTiles({ legend, name, options, value, onChange, perRow = 3, required, invalid }: {
  legend: string; name: string; options: readonly ChoiceTile[]; value: string | undefined;
  onChange: (value: string) => void; perRow?: keyof typeof PER_ROW; required?: boolean | undefined; invalid?: boolean | undefined;
}) {
  const id = useId();
  return (
    <fieldset role="radiogroup" aria-labelledby={id} className={cn("m-0 grid min-w-0 gap-1.5 border-0 p-0", invalid && "rounded-lg outline outline-2 outline-offset-4 outline-destructive")}>
      <legend id={id} className="mb-1.5 p-0 font-semibold">{legend}</legend>
      <div className={cn("grid min-w-0 grid-cols-2 gap-3", PER_ROW[perRow])}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label key={o.value} title={o.name ?? o.label} data-value={o.value} className={swatchTile(on, cn("min-h-12 grid-cols-1 pb-2", !on && "hover:bg-muted"))}>
              <input type="radio" className="sr-only" name={name} value={o.value} checked={on} required={required} aria-label={o.name ?? o.label} aria-invalid={invalid || undefined} onChange={() => onChange(o.value)} />
              <span aria-hidden className="relative block w-full">
                <span data-part="picture" className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-border bg-background p-2 text-muted-foreground">{o.picture}</span>
                {on ? <TickBadge /> : null}
              </span>
              <span aria-hidden data-part="label">{o.label}</span>
              {o.sublabel ? <span aria-hidden data-part="sublabel" className="text-[0.9rem] font-normal text-muted-foreground">{o.sublabel}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
