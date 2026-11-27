// Badewannentür (BWT), slice 1: the existing tub (shape, Umbau-Check, material), the five door
// cards, the hinge and the four grab bars (cards with a product photo). The stored fields are exactly today's
// (test/bwt-tuer.test.tsx compares with what today's UI stores and shows for the same inputs).
// Slice 2 (free items, note, sketch, the two note texts) is in Extras.tsx.
import { Card, CardTitle, Check, Choices, IMG, cn } from "../../../shared/ui/index.js";
import { Internal } from "../../../shared/ui/internal.js";
import { TickBadge, swatchTile } from "../../../shared/ui/swatch.js";
import { useOfferStore } from "../../offer/index.js";
import { Anschlag } from "./Anschlag.js";
import { Doors, Qty } from "./Doors.js";
import { Extras } from "./Extras.js";
import { set, str, useBwt, write, type Fields } from "./store.js";
import { GRIPS, MATERIALS, SHAPES, UMBAU, gripOn, setMaterial, toggleGrip, toggleUmbau, umbauOn, bwtMissing, bwtProblem } from "./rules.js";

export function Badewannentuer() {
  const b = useBwt();
  const tried = useOfferStore((s) => s.scratch["tried:bwt"]) === true, problem = tried ? bwtProblem(b) : null;
  const missing = tried ? bwtMissing(b) : { shape: false, door: false }; // after "Weiter" was refused: what is still missing, on the page itself
  return (
    <div className="grid gap-4" data-testid="bwt-step">
      {problem ? <p role="alert" data-testid="bwt-missing" className="m-0 rounded-lg border-2 border-destructive bg-card px-4 py-3 font-semibold text-destructive">{problem.message}</p> : null}
      <Card aria-labelledby="bwt-bestand">
        <CardTitle id="bwt-bestand">Badewanne — Bestandsaufnahme</CardTitle>
        <Choices legend="Wählen Sie Ihre bestehende Wannenform" name="bwtShape" required invalid={missing.shape} options={SHAPES.map((s) => ({ value: s, label: s }))} value={str(b.bwtShape)} onChange={(v) => set("bwtShape", v)} />
        <fieldset className="m-0 grid gap-2 border-0 p-0"><legend className="mb-1.5 p-0 font-semibold">Umbau-Check</legend>
          {UMBAU.map(([key, label]) => <Check key={key} id={`bwt-umbau-${key}`} checked={umbauOn(b, key)} onChange={() => write((x) => toggleUmbau(x, key))}>{label}</Check>)}
        </fieldset>
        <Choices legend="Wählen Sie das Material, aus dem Ihre Wanne besteht" name="bwtMaterial" options={MATERIALS.map(([value, label]) => ({ value, label }))} value={str(b.bwtMaterial)} onChange={(v) => write((x) => setMaterial(x, v))} />
      </Card>
      <Doors b={b} invalid={missing.door} />
      <Card aria-labelledby="bwt-konfig">
        <CardTitle id="bwt-konfig">Türanschlag</CardTitle>
        <Anschlag />
        <p className="m-0 text-muted-foreground"><Internal>Hinweis: Zusätzlicher Verschluss 49 € EK-Preis wird grundsätzlich automatisch mitkalkuliert. </Internal>Die Farbe von Tür und Rahmen kann individuell angepasst werden. Jede Farbe wird gleich berechnet.</p>
      </Card>
      <Card aria-labelledby="bwt-zubehoer">
        <CardTitle id="bwt-zubehoer">Optionale Haltegriffe</CardTitle>
        {/* every card keeps the room of its quantity, and is wide enough (15 rem) for the bold ticked name on one line, so ticking
            one never makes the row jump (U-059); the picture is a product photo (IMG.product) and, like the tick, picks the grab bar */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-3">
          {GRIPS.map((g) => {
            const on = gripOn(b, g.n);
            return (
              <div key={g.n} data-testid="bwt-grip" data-n={g.n} className={swatchTile(on, "cursor-default gap-2 p-2 pb-3 text-base")}>
                <label htmlFor={`bwt-grip-${g.n}`} aria-hidden className="relative block cursor-pointer">
                  <img src="/assets/5b817c33100c0121ede70f11e341601c.jpg" alt="" loading="lazy" data-part="grip-image" className={cn(IMG.product, "w-full rounded-lg object-contain")} />
                  {on ? <TickBadge /> : null}
                </label>
                <Check id={`bwt-grip-${g.n}`} checked={on} onChange={() => write((x) => toggleGrip(x, g.n))}>{g.label}</Check>
                <div data-part="grip-qty" aria-hidden={!on || undefined} className={cn("grid justify-items-center gap-1", !on && "invisible")}>
                  <span className="font-semibold">Menge</span>
                  <Qty field={g.qty} b={b} label={g.label} inputLabel={`Menge ${g.label}`} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Extras />
    </div>
  );
}
