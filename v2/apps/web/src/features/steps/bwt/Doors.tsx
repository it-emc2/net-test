// The door section of Badewannentür: five equal tiles in one row (the tile is the control; one door
// at a time), and below them one full-width panel for the chosen door — specs, sizes (Wien, Wien
// Glas), quantity as a stepper and colour. Layout only (UX-CHANGES U-034): the stored fields and
// the rules are slice 1's (rules.ts).
import { Check as Tick, Info, Minus, Plus } from "lucide-react";
import { Card, CardTitle, IMG, Input, cn } from "../../../shared/ui/index.js";
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

function Tile({ d, b, invalid }: { d: Door; b: Fields; invalid: boolean }) {
  const on = doorOn(b, d);
  return (
    <label data-testid="bwt-door" data-key={d.key} className={cn("relative grid cursor-pointer grid-rows-[6rem_auto] gap-2 rounded-lg border-2 bg-card p-2 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", on ? "border-primary bg-accent-weak" : "border-input")}>
      <input type="checkbox" name="bwtDoorType" className="sr-only" aria-label={d.value} aria-invalid={invalid || undefined} checked={on} onChange={() => write((x) => toggleDoor(x, d))} />
      <img src={d.img} alt="" loading="lazy" className={cn(IMG.tile, "mx-auto object-contain")} />
      <strong className="grid min-h-[2.75rem] content-center text-[0.95rem] leading-tight">{d.value}</strong>
      {on ? <span aria-hidden data-part="tick" className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-4" /></span> : null}
    </label>
  );
}

function Stepper({ field, b }: { field: string; b: Fields }) {
  const now = Number.parseInt(str(b[field]), 10);
  const to = (n: number) => set(field, String(Math.max(1, n)));
  const btn = "grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-input bg-card text-foreground";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Menge verringern" className={btn} onClick={() => to((Number.isFinite(now) ? now : 1) - 1)}><Minus aria-hidden className="size-4" /></button>
      <Input type="number" aria-label="Menge" inputMode="numeric" min={1} step={1} className="w-20 text-center tabular-nums" value={str(b[field])} onChange={(e) => set(field, e.target.value)} />
      <button type="button" aria-label="Menge erhöhen" className={btn} onClick={() => to((Number.isFinite(now) ? now : 0) + 1)}><Plus aria-hidden className="size-4" /></button>
    </div>
  );
}

function Panel({ d, b }: { d: Door; b: Fields }) {
  const colors = colorsOf(d), label = d.colorKind === "text" ? "Rahmen-Farbe" : "Farbe";
  return (
    <div data-testid="bwt-door-panel" data-key={d.key} className="grid gap-4 rounded-lg border-2 border-primary bg-card p-4">
      <div className="grid gap-1">
        <h3 className="m-0 text-[1.05rem] font-semibold">{d.value}</h3>
        {d.spec ? <p className="m-0 flex items-start gap-2 text-muted-foreground"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{d.spec}</p> : null}
      </div>
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
        <div className="grid gap-1"><span className="font-semibold">Menge</span><Stepper field={d.qty} b={b} /></div>
        {colors ? (
          <div className="grid gap-1" role="radiogroup" aria-label={label}>
            <span className="font-semibold">{label}</span>
            <div className="flex flex-wrap gap-2">
              {colors.map(([value, text, dot]) => (
                <button key={value} type="button" role="radio" aria-checked={str(b[d.color]) === value} onClick={() => set(d.color, value)}
                  className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 px-3", str(b[d.color]) === value ? "border-primary bg-accent-weak font-bold" : "border-input bg-card")}>
                  <span aria-hidden className="size-4 rounded-full border border-border" style={{ background: dot }} />{text}
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

export function Doors({ b, invalid }: { b: Fields; invalid: boolean }) {
  const chosen = DOORS.find((d) => doorOn(b, d));
  return (
    <Card aria-labelledby="bwt-tuer">
      <CardTitle id="bwt-tuer">Wählen Sie Ihren gewünschten Tür-Typen</CardTitle>
      <div className={cn("grid grid-cols-3 gap-3 min-[760px]:grid-cols-5", invalid && "rounded-lg outline outline-2 outline-offset-4 outline-destructive")}>{DOORS.map((d) => <Tile key={d.key} d={d} b={b} invalid={invalid} />)}</div>
      {chosen ? <Panel key={chosen.key} d={chosen} b={b} /> : null}
    </Card>
  );
}
