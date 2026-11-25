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
    <span data-part="plate" className="relative block shrink-0 overflow-hidden rounded-[3px] border-2 border-foreground/45 bg-muted bg-cover bg-center shadow-sm" style={{ width: w, height: h, backgroundImage: img ? `url(${img})` : undefined }}>
      {children}
    </span>
  );
}

/** width × height in cm come from the catalog's numbers (WINWALL_FORMATS), not from the label */
export interface PlateCard { code: string; size: string; qty: number; img: string; note: string; widthCm: number; heightCm: number }

/** The plates: each drawn to scale on one baseline in the decor, its size, a note, − / + and "Menge".
 *  `testId` names each card, `notePart` the note's data-part (tests read both). */
export function PlateCards({ plates, onStep, testId, notePart }: { plates: readonly PlateCard[]; onStep: (fmt: string, d: number) => void; testId: string; notePart: string }) {
  const { boxes, height } = scalePlates(plates.map((x) => ({ width: x.widthCm, height: x.heightCm })), PLATE_PX);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {plates.map((x, i) => (
        <div key={x.code} data-testid={testId} data-code={x.code} data-img={x.img} className={cn("grid min-w-0 content-start justify-items-center gap-1 rounded-xl border-2 p-1.5 text-center sm:p-2", x.qty ? "border-primary bg-primary/10 ring-1 ring-primary dark:bg-primary/25" : "border-border bg-card")}>
          <span aria-hidden className="flex w-full items-end justify-center border-b-2 border-border pt-1" style={{ height: height + 6 }}>
            <PlateShape w={boxes[i]!.w} h={boxes[i]!.h} img={x.img ? `/assets/winwall/${x.img}.jpg` : undefined}>
              <span className={cn("absolute right-1 top-1 grid min-w-6 place-items-center rounded-full px-1.5 text-sm font-bold shadow", x.qty ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>{x.qty}</span>
            </PlateShape>
          </span>
          <span data-part="size" className="whitespace-nowrap text-[0.9rem] font-semibold">{x.size}</span>
          <small data-part={notePart} className="min-h-5 text-muted-foreground">{x.note}</small>
          <span className="flex items-center">
            <Button variant="outline" size="icon" className="size-11 sm:size-12" aria-label={`Weniger ${x.size}`} onClick={() => onStep(x.code, -1)}><Minus aria-hidden /></Button>
            <output data-part="qty" className="w-7 text-center font-semibold sm:w-8">{x.qty}</output>
            <Button variant="outline" size="icon" className="size-11 sm:size-12" aria-label={`Mehr ${x.size}`} onClick={() => onStep(x.code, 1)}><Plus aria-hidden /></Button>
          </span>
          <small className="text-muted-foreground">Menge</small>
        </div>
      ))}
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
