// Auszuführende Arbeiten (Badumbau; ADR 026, phase 4): the Umbauart, the work tasks in their
// seven groups, dry-wall positions and free tasks. The stored fields are exactly today's
// (test/arbeiten.test.tsx compares with what today's UI stores for the same inputs).
// Not yet here: ticking a task because its product was chosen — that follows with the steps
// the products are chosen on (today's UI does it there).
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardTitle, Choices, Input, cn } from "../../../shared/ui/index.js";
import { useOfferField, useOfferStore } from "../../offer/index.js";
import { KINDS, WALL_MINUTES, arbeitenChanges, chooseKind, filledCount, freeTasksOf, storedFreeTasks, storedWall, toggleTask, wallRowsOf } from "./rules.js";
import { TASK_GROUPS, type Task } from "./tasks.js";

const DW = "duschwanne";
type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** change the tasks; the work-time suggestion (and the time on site) follow in the same change */
function write(change: (dw: Fields) => Fields, laborDelta = 0) {
  const o = offerNow();
  useOfferStore.getState().patchAll(arbeitenChanges(o, change(o.duschwanne ?? {}), laborDelta));
}
const Badge = ({ n, id }: { n: number; id: string }) => (n ? <span data-testid={id} className="ml-2 rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold text-primary-foreground">{n}</span> : null);
const GROUP = "rounded-lg border-2 border-border bg-card";
const SUMMARY = "flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 font-semibold [&::-webkit-details-marker]:hidden";

function TaskCard({ task, checked }: { task: Task; checked: boolean }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border-2 border-input bg-card px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-accent-weak">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" checked={checked} onChange={(e) => write((dw) => toggleTask(dw, task.value, e.target.checked))} />
      <span className="grid gap-0.5"><span className={cn(checked && "font-bold")}>{task.title}</span>{task.hint ? <span className="text-[0.9rem] text-muted-foreground">{task.hint}</span> : null}</span>
    </label>
  );
}

/** Dry wall instead of a connecting profile: one row per position, with its width. */
function DryWall() {
  const stored = useOfferField(DW, "trockenbauAusgleich");
  const remembered = useOfferStore((s) => s.scratch.wallRows);
  const rows = wallRowsOf({ trockenbauAusgleich: stored }, remembered);
  const set = (next: string[], laborDelta = 0) => { useOfferStore.getState().remember("wallRows", next); write(() => storedWall(next), laborDelta); };
  return (
    <div className="grid gap-2 rounded-lg border-2 border-dashed border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Aluprofil für Trockenbau statt Verbindungsprofil</strong>
        <Button variant="outline" onClick={() => set([...rows, ""], WALL_MINUTES)}><Plus aria-hidden />Weitere Stelle</Button>
      </div>
      <p className="m-0 text-[0.9rem] text-muted-foreground">Wenn zwischen Wand und Dusche ein Spalt/Kanal besteht und kein Verbindungsprofil passt: Ausgleich in Trockenbau. Breite je Stelle angeben — mehrfach möglich. Je Position pauschal 50 € Material + 2 Std Arbeitszeit.</p>
      {rows.map((width, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span>Breite</span>
          <div className="w-28"><Input aria-label={`Breite Stelle ${i + 1} in mm`} type="number" min={0} step={1} inputMode="numeric" placeholder="z. B. 130" value={width} onChange={(e) => set(rows.map((r, j) => (j === i ? e.target.value : r)))} /></div>
          <span>mm</span>
          <span className="text-muted-foreground">+50,00 € · +2 Std</span>
          <Button variant="ghost" size="icon" aria-label={`Stelle ${i + 1} entfernen`} onClick={() => set(rows.filter((_, j) => j !== i), -WALL_MINUTES)}><Trash2 aria-hidden /></Button>
        </div>
      ))}
    </div>
  );
}

/** Free tasks that are not in the lists above. */
function FreeTasks() {
  const stored = useOfferField(DW, "extraTasks");
  const remembered = useOfferStore((s) => s.scratch.freeTasks);
  const rows = freeTasksOf({ extraTasks: stored }, remembered);
  const set = (next: string[]) => { const kept = next.length ? next : [""]; useOfferStore.getState().remember("freeTasks", kept); write(() => storedFreeTasks(kept)); };
  const swap = (i: number, j: number) => set(rows.map((r, k) => (k === i ? rows[j]! : k === j ? rows[i]! : r)));
  const filled = filledCount(rows);
  return (
    <details className={GROUP}>
      <summary className={SUMMARY}><span>8. Weitere Arbeiten (optional)<Badge n={filled} id="free-count" /></span><ChevronDown aria-hidden className="size-5" /></summary>
      <div className="grid gap-2 p-3 pt-0">
        {rows.map((text, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-start gap-1">
            <textarea aria-label={`Zusätzliche Aufgabe ${i + 1}`} rows={2} placeholder="z. B. Estrich ausgleichen, Silikonfugen erneuern" value={text} onChange={(e) => set(rows.map((r, j) => (j === i ? e.target.value : r)))} className="w-full rounded-lg border-2 border-input bg-card px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground" />
            <Button variant="ghost" size="icon" aria-label={`Aufgabe ${i + 1} nach oben verschieben`} disabled={i === 0} onClick={() => swap(i, i - 1)}><ChevronUp aria-hidden /></Button>
            <Button variant="ghost" size="icon" aria-label={`Aufgabe ${i + 1} nach unten verschieben`} disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)}><ChevronDown aria-hidden /></Button>
            <Button variant="ghost" size="icon" aria-label={`Aufgabe ${i + 1} entfernen`} onClick={() => set(rows.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
          </div>
        ))}
        {filled ? null : <p className="m-0 text-muted-foreground">Noch keine zusätzliche Aufgabe erfasst.</p>}
        <div><Button variant="outline" onClick={() => set([...rows, ""])}><Plus aria-hidden />Aufgabe hinzufügen</Button></div>
        <p className="m-0 text-[0.9rem] text-muted-foreground">Ergänzen Sie hier freie Text-Aufgaben, die nicht in der Checkliste oben enthalten sind.</p>
      </div>
    </details>
  );
}

export function Arbeiten() {
  const kind = useOfferField<string>(DW, "umbauart");
  const ticked = useOfferField<string[]>(DW, "workTasks");
  const on = new Set(Array.isArray(ticked) ? ticked : []);
  return (
    <Card aria-labelledby="arbeiten-title">
      <CardTitle id="arbeiten-title">Auszuführende Arbeiten</CardTitle>
      <p className="m-0 text-muted-foreground">Wählen Sie die Arbeiten aus, die im Zuge des Einbaus ausgeführt werden sollen.</p>
      <Choices legend="Umbauart" name="duschwanne-umbauart" options={KINDS} value={kind} onChange={(v) => write((dw) => chooseKind(dw, v))} />
      <p className="m-0 text-[0.95rem] text-muted-foreground">Arbeiten werden automatisch aus der Umbauart angehakt. Manuelle Änderungen bleiben erhalten.</p>
      <div className="grid gap-2">
        {TASK_GROUPS.map((group, g) => {
          const n = group.tasks.filter((t) => on.has(t.value)).length;
          return (
            <details key={group.title} className={GROUP}>
              <summary className={SUMMARY}><span>{group.title}<Badge n={n} id={`count-${g + 1}`} /></span><ChevronDown aria-hidden className="size-5" /></summary>
              <div className="grid gap-2 p-3 pt-0">
                <div className="grid gap-2 sm:grid-cols-2">{group.tasks.map((t) => <TaskCard key={t.value} task={t} checked={on.has(t.value)} />)}</div>
                {g === 2 ? <DryWall /> : null}
              </div>
            </details>
          );
        })}
        <FreeTasks />
      </div>
    </Card>
  );
}
