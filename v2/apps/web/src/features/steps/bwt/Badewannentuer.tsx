// Badewannentür (BWT), slice 1: the existing tub (shape, Umbau-Check, material), the five door
// cards, the hinge and the four grab bars. The stored fields are exactly today's
// (test/bwt-tuer.test.tsx compares with what today's UI stores and shows for the same inputs).
// Slice 2 (free items, note, sketch, the two note texts) is in Extras.tsx.
import { Card, CardTitle, Check, Choices, Input, Label, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { Doors } from "./Doors.js";
import { Extras } from "./Extras.js";
import { set, str, useBwt, write, type Fields } from "./store.js";
import { GRIPS, MATERIALS, SHAPES, UMBAU, gripOn, setMaterial, toggleGrip, toggleUmbau, umbauOn, bwtMissing, bwtProblem } from "./rules.js";

const Num = ({ label, field, b, step = 1, min }: { label: string; field: string; b: Fields; step?: number; min?: number }) => (
  <Input type="number" aria-label={label} inputMode="decimal" step={step} min={min} value={str(b[field])} onChange={(e) => set(field, e.target.value)} />
);

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
        <Choices legend="Anschlag der Tür" name="bwtAnschlag" options={[{ value: "Links", label: "← Links" }, { value: "Rechts", label: "Rechts →" }]} value={str(b.bwtAnschlag)} onChange={(v) => set("bwtAnschlag", v)} />
        <p className="m-0 text-muted-foreground">Hinweis: Zusätzlicher Verschluss 49 € EK-Preis wird grundsätzlich automatisch mitkalkuliert. Die Farbe von Tür und Rahmen kann individuell angepasst werden. Jede Farbe wird gleich berechnet.</p>
      </Card>
      <Card aria-labelledby="bwt-zubehoer">
        <CardTitle id="bwt-zubehoer">Optionale Haltegriffe</CardTitle>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
          {GRIPS.map((g) => {
            const on = gripOn(b, g.n);
            return (
              <div key={g.n} data-testid="bwt-grip" data-n={g.n} className="grid content-start gap-2 rounded-lg border-2 border-input bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-accent-weak">
                <Check id={`bwt-grip-${g.n}`} checked={on} onChange={() => write((x) => toggleGrip(x, g.n))}>{g.label}</Check>
                {on ? <div className="grid gap-1"><Label>Menge {g.label}</Label><Num label={`Menge ${g.label}`} field={g.qty} b={b} min={1} /></div> : null}
              </div>
            );
          })}
        </div>
      </Card>
      <Extras />
    </div>
  );
}
