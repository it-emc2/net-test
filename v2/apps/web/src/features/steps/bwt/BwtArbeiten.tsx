// Auszuführende Arbeiten (Badewannentür; ADR 026, phase 4, slice 3): the one door task and the
// free tasks. Stored as today's UI does: `bwt.workTasks` (always written, `[]` when unticked) and
// `bwt.extraTasks` (trimmed, no empty, no doubles; `[]` when none) — test/bwt-arbeiten.test.tsx.
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardTitle, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { filledCount, freeTasksOf } from "../arbeiten/rules.js";
import { useBwt, write } from "./store.js";

export const DOOR_TASK = { value: "deliver_install_bwt_door", title: "Liefern und Montieren der nachfolgend aufgeführten Badewannentür" };
const GROUP = "rounded-lg border-2 border-border bg-card";
const SUMMARY = "flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 font-semibold [&::-webkit-details-marker]:hidden";
const Badge = ({ n, id }: { n: number; id: string }) => (n ? <span data-testid={id} className="ml-2 rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold text-primary-foreground">{n}</span> : null);

function FreeTasks() {
  const b = useBwt();
  const rows = freeTasksOf(b, useOfferStore((s) => s.scratch.bwtFreeTasks));
  const set = (next: string[]) => { const kept = next.length ? next : [""]; useOfferStore.getState().remember("bwtFreeTasks", kept); write(() => ({ extraTasks: [...new Set(kept.map((r) => r.trim()).filter(Boolean))] })); };
  const swap = (i: number, j: number) => set(rows.map((r, k) => (k === i ? rows[j]! : k === j ? rows[i]! : r)));
  const filled = filledCount(rows);
  return (
    <details className={GROUP} open>
      <summary className={SUMMARY}><span>2. Weitere Arbeiten (optional)<Badge n={filled} id="bwt-free-count" /></span><ChevronDown aria-hidden className="size-5" /></summary>
      <div className="grid gap-2 p-3 pt-0">
        {rows.map((text, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-start gap-1">
            <textarea aria-label="Zusätzliche Aufgabe" rows={2} placeholder="z. B. Demontage der alten Duschabtrennung" value={text} onChange={(e) => set(rows.map((r, j) => (j === i ? e.target.value : r)))} className="w-full rounded-lg border-2 border-input bg-card px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground" />
            <Button variant="ghost" size="icon" aria-label="Nach oben verschieben" disabled={rows.length <= 1 || i === 0} onClick={() => swap(i, i - 1)}><ChevronUp aria-hidden /></Button>
            <Button variant="ghost" size="icon" aria-label="Nach unten verschieben" disabled={rows.length <= 1 || i === rows.length - 1} onClick={() => swap(i, i + 1)}><ChevronDown aria-hidden /></Button>
            <Button variant="ghost" size="icon" aria-label="Diese Zeile entfernen" onClick={() => set(rows.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
          </div>
        ))}
        {filled ? null : <p className="m-0 text-muted-foreground">Noch keine zusätzliche Aufgabe erfasst.</p>}
        <div><Button variant="outline" onClick={() => set([...rows, ""])}><Plus aria-hidden />Aufgabe hinzufügen</Button></div>
        <p className="m-0 text-[0.9rem] text-muted-foreground">Diese Positionen erscheinen als zusätzliche Zeilen im Angebots-PDF.</p>
      </div>
    </details>
  );
}

export function BwtArbeiten() {
  const b = useBwt();
  const on = Array.isArray(b.workTasks) && (b.workTasks as unknown[]).includes(DOOR_TASK.value);
  return (
    <Card aria-labelledby="bwt-arbeiten-title" data-testid="bwt-arbeiten">
      <CardTitle id="bwt-arbeiten-title">Auszuführende Arbeiten</CardTitle>
      <p className="m-0 text-muted-foreground">Arbeiten, die im Zuge des Einbaus der Badewannentür ausgeführt werden.</p>
      <div className="grid gap-2">
        <details className={GROUP} open>
          <summary className={SUMMARY}><span>1. Badewannentür<Badge n={on ? 1 : 0} id="bwt-door-count" /></span><ChevronDown aria-hidden className="size-5" /></summary>
          <div className="grid gap-2 p-3 pt-0">
            <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border-2 border-input bg-card px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-accent-weak">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" checked={on} onChange={(e) => write(() => ({ workTasks: e.target.checked ? [DOOR_TASK.value] : [] }))} />
              <span className={cn(on && "font-bold")}>{DOOR_TASK.title}</span>
            </label>
          </div>
        </details>
        <FreeTasks />
      </div>
    </Card>
  );
}
