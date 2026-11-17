// Badewannentür (BWT), slice 1: the existing tub (shape, Umbau-Check, material), the five door
// cards, the hinge and the four grab bars. The stored fields are exactly today's
// (test/bwt-tuer.test.tsx compares with what today's UI stores and shows for the same inputs).
// Slice 2 (free items, note, sketch, the two note texts) is in Extras.tsx.
import { Card, CardTitle, Check, Choices, Input, Label, cn, IMG } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { Extras } from "./Extras.js";
import { set, str, useBwt, write, type Fields } from "./store.js";
import { COLORS, DIMS, DOORS, GRIPS, MATERIALS, SHAPES, UMBAU, dimField, doorOn, gripOn, setMaterial, toggleDoor, toggleGrip, toggleUmbau, umbauOn, bwtMissing, bwtProblem, type Door } from "./rules.js";

const CARD = "grid content-start gap-2 rounded-lg border-2 border-input bg-card p-3 has-[input[name=bwtDoorType]:checked]:border-primary has-[input[name=bwtDoorType]:checked]:bg-accent-weak";
const Num = ({ label, field, b, step = 1, min }: { label: string; field: string; b: Fields; step?: number; min?: number }) => (
  <Input type="number" aria-label={label} inputMode="decimal" step={step} min={min} value={str(b[field])} onChange={(e) => set(field, e.target.value)} />
);

function DoorCard({ d, b, invalid }: { d: Door; b: Fields; invalid: boolean }) {
  const on = doorOn(b, d);
  return (
    <div data-testid="bwt-door" data-key={d.key} className={CARD}>
      <label className="grid cursor-pointer justify-items-center gap-2">
        <input type="checkbox" name="bwtDoorType" className="size-5 accent-[var(--primary)]" aria-label={d.value} aria-invalid={invalid || undefined} checked={on} onChange={() => write((x) => toggleDoor(x, d))} />
        <img src={d.img} alt="" loading="lazy" className={cn(IMG.product, "object-contain")} />
        <strong>{d.value}</strong>
        {d.facts.map((f) => <small key={f} className="text-muted-foreground">{f}</small>)}
      </label>
      {d.dims && on ? (
        <div className="grid gap-1.5" data-part="dims">
          {DIMS.map(([suffix, name]) => {
            const field = dimField(d, suffix), label = `${name} ${d.value}`;
            return (
              <label key={suffix} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-[0.95rem]">
                <span>{suffix === "DepthTop" ? "Tiefe O" : suffix === "DepthBottom" ? "Tiefe U" : suffix === "StdWidth" ? "Standardbreiten" : name}</span>
                {suffix === "StdWidth"
                  ? <select aria-label={label} value={str(b[field])} onChange={(e) => set(field, e.target.value)} className="min-h-12 w-full cursor-pointer rounded-lg border-2 border-input bg-card px-3"><option value="">–</option><option value="30,5 cm">30,5</option><option value="45,5 cm">45,5</option></select>
                  : <Num label={label} field={field} b={b} step={0.5} />}
                <span>cm</span>
              </label>
            );
          })}
        </div>
      ) : null}
      {on ? (
        <div className="grid gap-2" data-part="extra">
          <div className="grid gap-1"><Label>Menge {d.value}</Label><Num label={`Menge ${d.value}`} field={d.qty} b={b} min={1} /></div>
          {d.colorKind === "pills" ? (
            <div className="grid gap-1" role="radiogroup" aria-label={`Farbe ${d.value}`}>
              <span className="font-semibold">Farbe {d.value}</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(([value, label, dot]) => (
                  <button key={value} type="button" role="radio" aria-checked={str(b[d.color]) === value} onClick={() => set(d.color, value)}
                    className={cn("inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 px-3", str(b[d.color]) === value ? "border-primary bg-accent-weak font-bold" : "border-input bg-card")}>
                    <span aria-hidden className="size-4 rounded-full border border-border" style={{ background: dot }} />{label}
                  </button>
                ))}
              </div>
            </div>
          ) : d.colorKind === "select" ? (
            <div className="grid gap-1"><Label>Farbe {d.value}</Label>
              <select aria-label={`Farbe ${d.value}`} value={str(b[d.color])} onChange={(e) => set(d.color, e.target.value)} className="min-h-12 w-full cursor-pointer rounded-lg border-2 border-input bg-card px-3"><option value="weiß">weiß</option><option value="silber">silber</option></select>
            </div>
          ) : (
            <div className="grid gap-1"><Label>Rahmen-Farbe</Label><Input type="text" aria-label="Rahmen-Farbe" value={str(b[d.color])} onChange={(e) => set(d.color, e.target.value)} /></div>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
      <Card aria-labelledby="bwt-tuer">
        <CardTitle id="bwt-tuer">Wählen Sie Ihren gewünschten Tür-Typen</CardTitle>
        <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] items-start gap-3", missing.door && "rounded-lg outline outline-2 outline-offset-4 outline-destructive")}>{DOORS.map((d) => <DoorCard key={d.key} d={d} b={b} invalid={missing.door} />)}</div>
      </Card>
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
