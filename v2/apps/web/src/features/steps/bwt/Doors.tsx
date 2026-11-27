// The door section of Badewannentür: one card per door with a large picture on top (IMG.hero, the whole door on the
// photo plate, not cropped) so it can be shown to the customer on the tablet — 2 per row on the tablet, 1 on a phone —
// name and short specs below; the chosen card in the swatch language (3 px primary frame, tick badge, light tint).
// The card is the control (a checkbox `bwtDoorType`; one door at a time); a small button in the picture's corner
// shows the doors large in the shared lightbox. Below the cards one full-width panel for the chosen door — sizes
// (Wien, Wien Glas), quantity as a stepper and colour. Layout only (UX-CHANGES U-034): the stored fields and
// the rules are slice 1's (rules.ts).
import { Maximize2 } from "lucide-react";
import { useState } from "react";
import { Card, CardTitle, IMG, Input, Lightbox, Stepper, cn } from "../../../shared/ui/index.js";
import { TickBadge, swatchTile } from "../../../shared/ui/swatch.js";
import { COLORS, DIMS, DOORS, dimField, doorOn, toggleDoor, type Door } from "./rules.js";
import { set, str, write, type Fields } from "./store.js";

const FIELD = "min-h-11";
const SILVER = "#c0c4c8";
/** the colours of a door: its own options, the same swatch control */
function colorsOf(d: Door): readonly (readonly [string, string, string])[] | null {
  if (d.colorKind === "pills") return COLORS;
  if (d.colorKind === "select") return [["weiß", "Weiß", "#fffdfa"], ["silber", "Silber", SILVER]];
  return null; // Wien Glas: the frame colour is typed
}

function Tile({ d, b, invalid, onZoom }: { d: Door; b: Fields; invalid: boolean; onZoom: () => void }) {
  const on = doorOn(b, d);
  return (
    <div data-testid="bwt-door" data-key={d.key} className="relative grid min-w-0">
      <label className={swatchTile(on, "gap-2 p-2 pb-3 text-base")}>
        <input type="checkbox" name="bwtDoorType" className="sr-only" aria-label={d.value} aria-invalid={invalid || undefined} checked={on} onChange={() => write((x) => toggleDoor(x, d))} />
        <span className="relative block">
          <img src={d.img} alt="" loading="lazy" data-part="door-image" className={cn(IMG.hero, "w-full rounded-lg object-contain")} />
          {on ? <TickBadge /> : null}
        </span>
        <strong className="px-1 leading-tight">{d.value}</strong>
        {d.spec ? <span data-part="spec" className="px-1 text-[0.9rem] font-normal text-muted-foreground">{d.spec}</span> : null}
      </label>
      {/* beside the label, not in it: a tap on it shows the picture large and never picks the door */}
      <button type="button" aria-label={`Bild vergrößern: ${d.value}`} onClick={onZoom}
        className="absolute left-3.5 top-3.5 grid size-11 cursor-zoom-in place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-md">
        <Maximize2 aria-hidden className="size-5" />
      </button>
    </div>
  );
}

/** a quantity (door, grab bar): the shared − / + stepper (48 px buttons) with the typed field in the middle; never below 1 */
export function Qty({ field, b, label, inputLabel }: { field: string; b: Fields; label: string; inputLabel: string }) {
  const now = Number.parseInt(str(b[field]), 10);
  const step = (dir: 1 | -1) => set(field, String(Math.max(1, (Number.isFinite(now) ? now : dir > 0 ? 0 : 1) + dir)));
  return (
    <Stepper label={label} words={["weniger", "mehr"]} value={str(b[field])} canDown={!Number.isFinite(now) || now > 1} canUp onStep={step}>
      <Input type="number" aria-label={inputLabel} inputMode="numeric" min={1} step={1} className="w-20 text-center tabular-nums" value={str(b[field])} onChange={(e) => set(field, e.target.value)} />
    </Stepper>
  );
}

function Panel({ d, b }: { d: Door; b: Fields }) {
  const colors = colorsOf(d), label = d.colorKind === "text" ? "Rahmen-Farbe" : "Farbe";
  return (
    <div data-testid="bwt-door-panel" data-key={d.key} className="grid gap-4 rounded-lg border-2 border-primary bg-card p-4">
      <h3 className="m-0 text-[1.05rem] font-semibold">{d.value}</h3>
      {d.dims ? (
        <div className="grid gap-2" data-part="dims">
          <div className="font-semibold">Maße</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {DIMS.filter(([s]) => s !== "StdWidth").map(([suffix, name]) => {
              const field = dimField(d, suffix);
              return (
                <label key={suffix} className="grid gap-1 text-[0.95rem]">{suffix === "DepthTop" ? "Tiefe oben" : suffix === "DepthBottom" ? "Tiefe unten" : name}
                  <span className="relative block">
                    <Input type="number" aria-label={`${name} ${d.value}`} inputMode="decimal" step={0.5} className={cn(FIELD, "pr-12")} value={str(b[field])} onChange={(e) => set(field, e.target.value)} />
                    <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">cm</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div role="group" aria-label={`Standardbreite ${d.value}`} className="flex flex-wrap items-center gap-2">
            <span className="text-[0.95rem]">Standardbreite</span>
            {["30,5 cm", "45,5 cm"].map((v) => {
              const field = dimField(d, "StdWidth"), on = str(b[field]) === v;
              return <button key={v} type="button" aria-pressed={on} onClick={() => set(field, on ? "" : v)} className={cn("inline-flex min-h-11 cursor-pointer items-center rounded-lg border-2 px-3", on ? "border-primary bg-accent-weak font-bold" : "border-input bg-card")}>{v}</button>;
            })}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1"><span className="font-semibold">Menge</span><Qty field={d.qty} b={b} label={`Menge ${d.value}`} inputLabel="Menge" /></div>
        {colors ? (
          <div className="grid gap-1" role="radiogroup" aria-label={label}>
            <span className="font-semibold">{label}</span>
            <div className="flex flex-wrap gap-2">
              {colors.map(([value, text, dot]) => (
                <button key={value} type="button" role="radio" aria-checked={str(b[d.color]) === value} onClick={() => set(d.color, value)}
                  className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 px-3", str(b[d.color]) === value ? "border-primary bg-accent-weak font-bold" : "border-input bg-card")}>
                  <span aria-hidden className="size-4 shrink-0 rounded-full border border-control" style={{ background: dot }} />{text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <label className="grid gap-1 font-semibold">Rahmen-Farbe<Input type="text" aria-label="Rahmen-Farbe" className={FIELD} value={str(b[d.color])} onChange={(e) => set(d.color, e.target.value)} /></label>
        )}
      </div>
    </div>
  );
}

const PICTURES = DOORS.map((d) => ({ src: d.img, label: d.value }));

export function Doors({ b, invalid }: { b: Fields; invalid: boolean }) {
  const chosen = DOORS.find((d) => doorOn(b, d));
  const [shown, setShown] = useState<number | null>(null);
  return (
    <Card aria-labelledby="bwt-tuer">
      <CardTitle id="bwt-tuer">Wählen Sie Ihren gewünschten Tür-Typen</CardTitle>
      <div className={cn("grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2", invalid && "rounded-lg outline outline-2 outline-offset-4 outline-destructive")}>
        {DOORS.map((d, i) => <Tile key={d.key} d={d} b={b} invalid={invalid} onZoom={() => setShown(i)} />)}
      </div>
      {chosen ? <Panel key={chosen.key} d={chosen} b={b} /> : null}
      {shown != null ? <Lightbox images={PICTURES} start={shown} onClose={() => setShown(null)} testId="bwt-lightbox" /> : null}
    </Card>
  );
}
