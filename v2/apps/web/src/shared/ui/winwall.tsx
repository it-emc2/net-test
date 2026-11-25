// winwall plates and decors, shared by the Wandverkleidung simple view and the Fußboden mode
// "Wandverkleidung als Fußboden" (today both draw the same `.wvs-plate` cards and `.wvs-color` tiles).
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button.js";
import { cn } from "../lib/cn.js";
import { scalePlates } from "./plate-scale.js";
import { SwatchFace, SwatchGrid, swatchTile } from "./swatch.js";

/** px of the largest dimension of a plate group (the plates are drawn to one scale) */
export const PLATE_PX = 132;

/** A panel drawn to scale (`w` × `h` px), filled with the decor's picture, else a neutral surface. */
export function PlateShape({ w, h, img, children }: { w: number; h: number; img?: string; children?: ReactNode }) {
  return (
    <span data-part="plate" className="relative block shrink-0 overflow-hidden rounded-[3px] border-2 border-foreground/45 bg-muted bg-cover bg-center shadow-sm" style={{ width: w, height: h, backgroundImage: img ? `url("${img}")` : undefined }}>
      {children}
    </span>
  );
}

/** width × height in cm come from the catalog's numbers (WINWALL_FORMATS), not from the label */
export interface PlateCard { code: string; size: string; qty: number; img: string; note: string; widthCm: number; heightCm: number }

/** The plates: each drawn to scale on one baseline in the decor, its size, a note, − / + and "Menge".
 *  The amount is shown once, in the stepper (no badge on the plate, owner 2026-11-25); a plate with
 *  an amount is framed and tinted. `testId` names each card, `notePart` the note's data-part (tests read both). */
/** a plate card's frame; `on`: it has an amount / is the chosen format */
export const plateCard = (on: boolean, className?: string): string =>
  cn("grid min-w-0 content-start justify-items-center gap-1 rounded-xl border-2 p-1.5 text-center sm:p-2", on ? "border-primary bg-primary/10 ring-1 ring-primary dark:bg-primary/25" : "border-border bg-card", className);

/** the plate on its baseline (all plates of a group stand on one line of `height` px) */
export function PlateOnBaseline({ w, h, height, img }: { w: number; h: number; height: number; img?: string | undefined }) {
  return (
    <span aria-hidden className="flex w-full items-end justify-center border-b-2 border-border pt-1" style={{ height: height + 6 }}>
      <PlateShape w={w} h={h} img={img} />
    </span>
  );
}

/** − amount + with 2.5 rem (45 px, phone) / 3 rem (tablet) targets; `less` / `more` name the two buttons */
export function PlateStepper({ qty, onStep, less, more }: { qty: number; onStep: (d: number) => void; less: string; more: string }) {
  return (
    <span className="flex items-center">
      <Button variant="outline" size={null} className="size-10 sm:size-12" aria-label={less} onClick={() => onStep(-1)}><Minus aria-hidden /></Button>
      <output data-part="qty" className="w-7 text-center font-semibold sm:w-8">{qty}</output>
      <Button variant="outline" size={null} className="size-10 sm:size-12" aria-label={more} onClick={() => onStep(1)}><Plus aria-hidden /></Button>
    </span>
  );
}

export function PlateCards({ plates, onStep, testId, notePart }: { plates: readonly PlateCard[]; onStep: (fmt: string, d: number) => void; testId: string; notePart: string }) {
  const { boxes, height } = scalePlates(plates.map((x) => ({ width: x.widthCm, height: x.heightCm })), PLATE_PX);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {plates.map((x, i) => (
        <div key={x.code} data-testid={testId} data-code={x.code} data-img={x.img} className={plateCard(x.qty > 0)}>
          <PlateOnBaseline w={boxes[i]!.w} h={boxes[i]!.h} height={height} img={x.img ? `/assets/winwall/${x.img}.jpg` : undefined} />
          <span data-part="size" className="whitespace-nowrap text-[0.9rem] font-semibold">{x.size}</span>
          <small data-part={notePart} className="min-h-5 text-muted-foreground">{x.note}</small>
          <PlateStepper qty={x.qty} onStep={(d) => onStep(x.code, d)} less={`Weniger ${x.size}`} more={`Mehr ${x.size}`} />
          <small className="text-muted-foreground">Menge</small>
        </div>
      ))}
    </div>
  );
}

/** a panel format, its size in cm from the catalog's numbers */
export interface PanelFormat { code: string; size: string; widthCm: number; heightCm: number }

/** One row's panels (VIGOUR, Badolux): its formats drawn to scale on one baseline — the same cards
 *  as the winwall plates. A row has ONE format and one amount: tapping a format picks it (the amount
 *  stays), the chosen one carries − / + and "Menge". With one format there is nothing to pick.
 *  `label` names the group ("Breite Zeile 1"), `stepLabel` the stepper ("Zeile 1": "Zeile 1: mehr"). */
export function RowPlates({ formats, picked, qty, img, label, stepLabel, onPick, onStep }: {
  formats: readonly PanelFormat[]; picked: string; qty: number; img?: string | undefined; label: string; stepLabel: string; onPick: (code: string) => void; onStep: (d: number) => void;
}) {
  const { boxes, height } = scalePlates(formats.map((f) => ({ width: f.widthCm, height: f.heightCm })), PLATE_PX);
  const many = formats.length > 1;
  return (
    <div role={many ? "radiogroup" : "group"} aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {formats.map((f, i) => {
        const on = f.code === picked;
        const face = <><PlateOnBaseline w={boxes[i]!.w} h={boxes[i]!.h} height={height} img={img} /><span data-part="size" className="text-[0.9rem] font-semibold sm:whitespace-nowrap">{f.size}</span></>;
        return (
          <div key={f.code} data-part="format" data-code={f.code} className={plateCard(on)}>
            {many ? (
              <button type="button" role="radio" aria-checked={on} data-code={f.code} aria-label={`${label}: ${f.size}`} onClick={() => onPick(f.code)}
                className="grid w-full min-w-0 cursor-pointer justify-items-center gap-1 rounded-lg border-0 bg-transparent p-0 text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">{face}</button>
            ) : <span className="grid w-full justify-items-center gap-1">{face}</span>}
            {on ? <><PlateStepper qty={qty} onStep={onStep} less={`${stepLabel}: weniger`} more={`${stepLabel}: mehr`} /><small className="text-muted-foreground">Menge</small></>
              : <button type="button" tabIndex={-1} aria-hidden onClick={() => onPick(f.code)} className="min-h-11 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-[0.9rem] font-semibold text-primary-text">Wählen</button>}
          </div>
        );
      })}
    </div>
  );
}

export interface DecorTile { code: string; name: string; small: string; checked: boolean; swatch: boolean; label: string }
/** The decor palette: a tile per decor (its swatch, else its number), name and number below. */
export function DecorPalette({ tiles, onPick, label }: { tiles: readonly DecorTile[]; onPick: (code: string) => void; label: string }) {
  return (
    <SwatchGrid role="radiogroup" aria-label={label}>
      {tiles.map((d) => (
        <button key={d.code} type="button" role="radio" aria-checked={d.checked} data-code={d.code} onClick={() => onPick(d.code)} className={swatchTile(d.checked)}>
          <SwatchFace on={d.checked} img={d.swatch ? `/assets/winwall/${d.code}.jpg` : undefined} label={d.label} />
          <span data-part="name">{d.name}</span><small data-part="small" className="font-normal text-muted-foreground">{d.small}</small>
        </button>
      ))}
    </SwatchGrid>
  );
}
