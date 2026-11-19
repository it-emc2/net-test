// winwall plates and decors, shared by the Wandverkleidung simple view and the Fußboden mode
// "Wandverkleidung als Fußboden" (today both draw the same `.wvs-plate` cards and `.wvs-color` tiles).
import { Minus, Plus } from "lucide-react";
import { Button } from "./button.js";
import { cn } from "../lib/cn.js";
import { IMG } from "./index.js";

/** width × height of each winwall plate in cm (the picture is drawn to scale) */
const PLATE_CM: Record<string, [number, number]> = { 13: [100, 205], 15: [100, 250], 16: [125, 250], 17: [150, 250] };
export interface PlateCard { code: string; size: string; qty: number; img: string; note: string }

/** The four plates: a picture of the plate in the decor, its size, a note, − / + and "Menge".
 *  `testId` names each card, `notePart` the note's data-part (tests read both). */
export function PlateCards({ plates, onStep, testId, notePart }: { plates: readonly PlateCard[]; onStep: (fmt: string, d: number) => void; testId: string; notePart: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {plates.map((x) => {
        const [cw, ch] = PLATE_CM[x.code] ?? [100, 250];
        return (
          <div key={x.code} data-testid={testId} data-code={x.code} data-img={x.img} className={cn("grid justify-items-center gap-1 rounded-lg border-2 bg-card p-2 text-center", x.qty ? "border-primary" : "border-input")}>
            <span aria-hidden className="relative grid place-items-end rounded bg-muted bg-cover bg-center" style={{ width: cw * 0.4, height: ch * 0.4, backgroundImage: x.img ? `url(/assets/winwall/${x.img}.jpg)` : undefined }}>
              <span className="m-1 rounded-full bg-card px-2 text-sm font-semibold">{x.qty}</span>
            </span>
            <span data-part="size">{x.size}</span>
            <small data-part={notePart} className="min-h-5 text-muted-foreground">{x.note}</small>
            <span className="flex items-center gap-1">
              <Button variant="outline" size="icon" aria-label={`Weniger ${x.size}`} onClick={() => onStep(x.code, -1)}><Minus aria-hidden /></Button>
              <output data-part="qty" className="w-8 text-center font-semibold">{x.qty}</output>
              <Button variant="outline" size="icon" aria-label={`Mehr ${x.size}`} onClick={() => onStep(x.code, 1)}><Plus aria-hidden /></Button>
            </span>
            <small className="text-muted-foreground">Menge</small>
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
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {tiles.map((d) => (
        <button key={d.code} type="button" role="radio" aria-checked={d.checked} data-code={d.code} onClick={() => onPick(d.code)} className={cn("grid w-28 cursor-pointer justify-items-center gap-1 rounded-lg border-2 bg-card p-2 text-center text-[0.9rem] text-foreground [overflow-wrap:anywhere]", d.checked ? "border-primary bg-accent-weak font-bold" : "border-input")}>
          <i aria-hidden data-part="label" className={cn(IMG.swatch, "grid place-items-center rounded bg-muted bg-cover bg-center not-italic text-sm")} style={d.swatch ? { backgroundImage: `url(/assets/winwall/${d.code}.jpg)` } : undefined}>{d.label}</i>
          <span data-part="name">{d.name}</span><small data-part="small" className="text-muted-foreground">{d.small}</small>
        </button>
      ))}
    </div>
  );
}
