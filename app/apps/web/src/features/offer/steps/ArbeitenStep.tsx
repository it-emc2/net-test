import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Wand2 } from "lucide-react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { TASK_GROUPS, TASK_MINUTES } from "../arbeitenTasks";
import { computeArbeitszeit, hoursToHHMM } from "../arbeitszeit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ArbeitenStep() {
  const { payload, patchSection } = useOffer();
  const workTasks: string[] = Array.isArray(payload.duschwanne.workTasks)
    ? payload.duschwanne.workTasks
    : [];
  const extraTasks: string[] = Array.isArray(payload.duschwanne.extraTasks)
    ? payload.duschwanne.extraTasks
    : [];

  const setDusch = (patch: Record<string, any>) => patchSection("duschwanne", patch);

  function toggleTask(key: string) {
    const next = workTasks.includes(key)
      ? workTasks.filter((k) => k !== key)
      : [...workTasks, key];
    setDusch({ workTasks: next });
  }

  // Sum minutes of checked catalogue tasks → fill the Arbeitszeit work-hours field.
  function suggestHours() {
    const minutes = workTasks.reduce((a, k) => a + (TASK_MINUTES[k] || 0), 0);
    const hhmm = hoursToHHMM(minutes / 60);
    const az = { ...payload.Arbeitszeit, laborHoursHHMM: hhmm };
    patchSection("Arbeitszeit", { laborHoursHHMM: hhmm, ...computeArbeitszeit(az) });
  }

  const suggestedMinutes = workTasks.reduce((a, k) => a + (TASK_MINUTES[k] || 0), 0);

  return (
    <div className="space-y-6">
      <StepHeader title="Auszuführende Arbeiten" hint="Alle durchzuführenden Arbeiten auswählen." />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {workTasks.length} Arbeit(en) gewählt · ca. {hoursToHHMM(suggestedMinutes / 60)} Std
        </span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={suggestHours} disabled={workTasks.length === 0}>
          <Wand2 /> Arbeitszeit vorschlagen
        </Button>
      </div>

      <div className="space-y-3">
        {TASK_GROUPS.map((group) => (
          <TaskGroupCard
            key={group.title}
            title={group.title}
            selectedCount={group.tasks.filter((t) => workTasks.includes(t.key)).length}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {group.tasks.map((t) => (
                <label
                  key={t.key}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={workTasks.includes(t.key)}
                    onChange={() => toggleTask(t.key)}
                    className="size-4 rounded border-input accent-[hsl(var(--primary))]"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </TaskGroupCard>
        ))}
      </div>

      <WeitereArbeiten
        items={extraTasks}
        onChange={(next) => setDusch({ extraTasks: next })}
      />
    </div>
  );
}

function TaskGroupCard({
  title,
  selectedCount,
  children,
}: {
  title: string;
  selectedCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-medium">
          {title}
          {selectedCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {selectedCount}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </div>
  );
}

function WeitereArbeiten({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function edit(i: number, value: string) {
    onChange(items.map((v, idx) => (idx === i ? value : v)));
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 font-medium">Weitere Arbeiten</div>
      <div className="space-y-2 px-4 py-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Eigene Positionen hinzufügen — Reihenfolge frei anpassbar.</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Nach oben"
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label="Nach unten"
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
            <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
            <Input value={item} onChange={(e) => edit(i, e.target.value)} className="flex-1" />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Entfernen"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="z. B. Fliesenspiegel erneuern"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
            <Plus /> Hinzufügen
          </Button>
        </div>
      </div>
    </div>
  );
}
