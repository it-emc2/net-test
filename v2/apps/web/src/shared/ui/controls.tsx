// Small touch controls built for the tablet at the customer's home (first used by Alltagshilfe ·
// Leistungen, meant for Finanzierung and others): a tick box row, a row of choice chips and a
// − / + stepper. Native inputs underneath (keyboard and screen readers work as they are); colours
// from the theme tokens only (light and dark), control borders ≥ 3:1 (--control).
import { Check, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** A tick box with its text; the whole row is the tap target (≥ 48 px high, or 42 px `compact`). */
export function TickRow({ id, checked, onChange, children, suffix, compact, className, disabled, "data-testid": testId }: {
  id: string; checked: boolean; onChange: (on: boolean) => void; children: ReactNode; suffix?: ReactNode;
  compact?: boolean; className?: string; disabled?: boolean; "data-testid"?: string;
}) {
  return (
    <label htmlFor={id} data-testid={testId} data-checked={checked ? "true" : "false"}
      className={cn("group flex cursor-pointer items-center gap-3 rounded-lg", compact ? "min-h-[42px] px-2 text-[14px] leading-snug" : "min-h-12 px-1", disabled && "cursor-default opacity-60", className)}>
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden data-part="box"
        className={cn("grid shrink-0 place-items-center rounded-[5px] border-2 transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          compact ? "size-[22px]" : "size-6",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-control bg-card text-transparent")}>
        <Check className={compact ? "size-4" : "size-[1.1rem]"} strokeWidth={3} />
      </span>
      <span className="min-w-0" data-part="text">{children}{suffix ? <>{" "}<span className="font-normal text-muted-foreground">{suffix}</span></> : null}</span>
    </label>
  );
}

/** One answer of a few, as chips (radio buttons). `children` go at the end of the row (e.g. a "Weitere" chip). */
export function ChipGroup({ legend, name, options, value, onChange, children, className }: {
  legend: string; name: string; options: readonly { value: string; label: string }[]; value: string;
  onChange: (value: string) => void; children?: ReactNode; className?: string;
}) {
  return (
    <fieldset className={cn("m-0 grid min-w-0 gap-2 border-0 p-0", className)}>
      <legend className="mb-2 p-0 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} data-part="chip" data-checked={value === o.value ? "true" : "false"}
            className={cn(CHIP, value === o.value ? CHIP_ON : CHIP_OFF, "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring")}>
            <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
        {children}
      </div>
    </fieldset>
  );
}
export const CHIP = "inline-flex min-h-12 cursor-pointer select-none items-center rounded-full border-2 px-4 font-medium transition-colors";
export const CHIP_ON = "border-primary bg-primary text-primary-foreground";
export const CHIP_OFF = "border-control bg-card text-foreground";

/** − value + ; buttons 48 px. `label` names the value for screen readers; `words` the two buttons
 *  (default „kürzer“ / „länger“ for a duration; amounts use „weniger“ / „mehr“). */
export function Stepper({ label, value, onStep, canDown, canUp, className, words = ["kürzer", "länger"], children, "data-testid": testId }: {
  label: string; value: ReactNode; onStep: (dir: 1 | -1) => void; canDown: boolean; canUp: boolean; className?: string; words?: readonly [string, string];
  /** replaces the shown value (e.g. an input for a typed amount) */
  children?: ReactNode; "data-testid"?: string;
}) {
  const btn = "grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-control bg-card text-foreground disabled:cursor-default disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className={cn("flex items-center gap-2", className)} data-testid={testId}>
      <button type="button" className={btn} aria-label={`${label} ${words[0]}`} disabled={!canDown} onClick={() => onStep(-1)}><Minus aria-hidden className="size-5" /></button>
      {children ?? <output aria-live="polite" className="min-w-[6.5rem] text-center text-[1.1rem] font-semibold tabular-nums" data-part="value">{value}</output>}
      <button type="button" className={btn} aria-label={`${label} ${words[1]}`} disabled={!canUp} onClick={() => onStep(1)}><Plus aria-hidden className="size-5" /></button>
    </div>
  );
}
