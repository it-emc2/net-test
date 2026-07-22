import { useState } from "react";
import { Plus, Trash2, X, Zap } from "lucide-react";
import { useAhOffer } from "./AhOfferContext";
import type { AhSchedule, AhService, AhServiceType } from "./ahPayload";
import {
  REGELMAESSIGKEIT,
  SERVICE_META,
  tasksFor,
  formatDurationHHMM,
  parseDurationMinutes,
  rowMinutes,
} from "./ahServices";
import { optimizeDauerMinutes } from "./ahPricing";
import { AhKostenOverview } from "./AhKostenOverview";
import { useAhTotals, ENTLASTUNGSBETRAG } from "./useAhTotals";
import { StepHeader } from "../steps/KundendatenStep";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function AhLeistungenStep() {
  const { payload, patchSection } = useAhOffer();
  const { services, travelMinutes, entlastungAuto } = payload.ah;
  const { totals, zone, reisezeitH } = useAhTotals();

  function setServices(next: AhService[]) {
    patchSection("ah", { services: next });
  }
  function get(type: AhServiceType) {
    return services.find((s) => s.type === type);
  }
  function add(type: AhServiceType) {
    if (get(type)) return;
    setServices([...services, { type, schedules: [{ dauer: "", regelmaessigkeit: "" }], tasks: [] }]);
  }
  function remove(type: AhServiceType) {
    setServices(services.filter((s) => s.type !== type));
  }
  function update(type: AhServiceType, patch: Partial<AhService>) {
    setServices(services.map((s) => (s.type === type ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-8">
      <StepHeader title="Alltagshilfe" hint="Leistungen erfassen — je Bereich eine Leistung mit Zeitzeilen und Aufgaben." />

      {/* Reisezone + Entlastungsbetrag options */}
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Fahrtzeit (Hinfahrt, Min.)</label>
          <Input
            value={travelMinutes}
            onChange={(e) => patchSection("ah", { travelMinutes: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric"
            placeholder="z. B. 15"
            className="max-w-[10rem]"
          />
          <p className="text-xs text-muted-foreground">
            {zone ? `Zone ${zone.zone} · ${zone.billMin} min pro Einsatz` : "Noch keine Zone — Reisezeit wird nicht berechnet."}
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={entlastungAuto}
            onChange={(e) => patchSection("ah", { entlastungAuto: e.target.checked })}
            className="mt-0.5 size-4 rounded border-input accent-[hsl(var(--primary))]"
          />
          <span>
            Dauer automatisch auf Entlastungsbetrag optimieren
            <span className="block text-xs text-muted-foreground">
              Passt die HnD-Dauer an, sodass die monatlichen Kosten ≤ {ENTLASTUNGSBETRAG} € bleiben.
            </span>
          </span>
        </label>
      </section>

      {SERVICE_META.map((meta) => {
        const svc = get(meta.type);
        const isHnd = meta.type === "Haushaltsnahedienstleistungen";
        return (
          <section key={meta.type} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</h2>
            {svc ? (
              <ServiceCard
                service={svc}
                onChange={(patch) => update(meta.type, patch)}
                onRemove={() => remove(meta.type)}
                optimize={isHnd ? (r) => optimizeDauerMinutes(r, { reisezeitH, entlastungsbetrag: ENTLASTUNGSBETRAG }) : undefined}
                autoOptimize={isHnd && entlastungAuto}
              />
            ) : (
              <button
                type="button"
                onClick={() => add(meta.type)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
              >
                <Plus className="size-4" /> Leistung hinzufügen
              </button>
            )}
          </section>
        );
      })}

      {/* Freie Notiz (ahNote) */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notiz zur Alltagshilfe</h2>
        <textarea
          value={payload.ah.note}
          onChange={(e) => patchSection("ah", { note: e.target.value })}
          rows={3}
          placeholder="Freie Notiz zu den Leistungen …"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </section>

      <AhKostenOverview totals={totals} />
    </div>
  );
}

function ServiceCard({
  service,
  onChange,
  onRemove,
  optimize,
  autoOptimize,
}: {
  service: AhService;
  onChange: (patch: Partial<AhService>) => void;
  onRemove: () => void;
  /** HnD only: given a Regelmäßigkeit, returns the optimal Dauer in minutes. */
  optimize?: (regelmaessigkeit: string) => number;
  autoOptimize?: boolean;
}) {
  // Period is a display-only scale (Monat / Jahr) — not persisted, matching legacy.
  const [periodMonths, setPeriodMonths] = useState(1);
  const periodLabel = periodMonths === 12 ? "/ Jahr" : "/ Monat";
  const tasks = tasksFor(service.type);
  const checked = new Set(service.tasks);

  function setSchedules(next: AhSchedule[]) {
    onChange({ schedules: next });
  }
  function updateRow(i: number, patch: Partial<AhSchedule>) {
    setSchedules(service.schedules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  // Optimizer helpers (HnD only). minutes → "H:MM".
  const minsToHHMM = (m: number) => (m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : "");
  function optimizeRow(i: number, regelmaessigkeit: string) {
    if (!optimize) return;
    updateRow(i, { regelmaessigkeit, dauer: minsToHHMM(optimize(regelmaessigkeit)) });
  }
  function addRow() {
    setSchedules([...service.schedules, { dauer: "", regelmaessigkeit: "" }]);
  }
  function removeRow(i: number) {
    if (service.schedules.length <= 1) return;
    setSchedules(service.schedules.filter((_, idx) => idx !== i));
  }
  function toggleTask(id: string) {
    const next = checked.has(id) ? service.tasks.filter((t) => t !== id) : [...service.tasks, id];
    onChange({ tasks: next });
  }

  // Card total: sum of calculable rows.
  let totalMins = 0;
  let hasValid = false;
  for (const r of service.schedules) {
    const m = rowMinutes(r.dauer, r.regelmaessigkeit, periodMonths);
    if (m != null) {
      totalMins += m;
      hasValid = true;
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="mr-auto text-sm font-semibold">Leistung</span>
        <Select value={String(periodMonths)} onValueChange={(v) => setPeriodMonths(Number(v))}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">/ Monat</SelectItem>
            <SelectItem value="12">/ Jahr</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-3.5" /> Entfernen
        </button>
      </div>

      {/* Schedule rows */}
      <div className="space-y-2">
        <div className={cn("grid items-center gap-2 px-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground", optimize ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto]")}>
          <span>Dauer (Std:Min)</span>
          <span>Regelmäßigkeit</span>
          <span className="text-right text-primary">{periodLabel}</span>
          {optimize && <span />}
          <span />
        </div>
        {service.schedules.map((row, i) => {
          const rm = rowMinutes(row.dauer, row.regelmaessigkeit, periodMonths);
          return (
            <div key={i} className={cn("grid items-center gap-2", optimize ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[auto_1fr_auto_auto]")}>
              <DauerInput value={row.dauer} onChange={(v) => updateRow(i, { dauer: v })} />
              <Select
                value={row.regelmaessigkeit || undefined}
                onValueChange={(v) =>
                  autoOptimize && optimize ? optimizeRow(i, v) : updateRow(i, { regelmaessigkeit: v })
                }
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Regelm. …" /></SelectTrigger>
                <SelectContent>
                  {REGELMAESSIGKEIT.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="min-w-[5rem] text-right text-sm font-semibold tabular-nums text-primary">
                {rm != null ? `${formatDurationHHMM(rm)} ${periodMonths === 12 ? "/ J." : "/ Mo."}` : "—"}
              </span>
              {optimize && (
                <button
                  type="button"
                  onClick={() => optimizeRow(i, row.regelmaessigkeit)}
                  disabled={!row.regelmaessigkeit}
                  title={`Dauer auf Entlastungsbetrag optimieren`}
                  aria-label="Dauer optimieren"
                  className="flex size-8 items-center justify-center rounded-md border text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Zap className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={service.schedules.length <= 1}
                aria-label="Zeile entfernen"
                className="flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          + Zeitzeile hinzufügen
        </button>
      </div>

      {/* Task checklist */}
      <div className="overflow-hidden rounded-md border">
        {tasks.map((t, i) => {
          const on = checked.has(t.id);
          return (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                i < tasks.length - 1 && "border-b",
                on && "bg-primary/10 text-primary",
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggleTask(t.id)}
                className="size-4 shrink-0 rounded border-input accent-[hsl(var(--primary))]"
              />
              {t.label}
            </label>
          );
        })}
      </div>

      {hasValid && (
        <div className="border-t pt-2 text-right text-sm font-semibold text-primary">
          Gesamt: {formatDurationHHMM(totalMins)} {periodLabel}
        </div>
      )}
    </div>
  );
}

/** Two small inputs (Std / Min) synced into a "H:MM" string. */
function DauerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mins = parseDurationMinutes(value);
  const h = mins ? String(Math.floor(mins / 60)) : "";
  const m = mins ? String(mins % 60) : "";

  function sync(hStr: string, mStr: string) {
    let hh = parseInt(hStr, 10);
    let mm = parseInt(mStr, 10);
    if (isNaN(hh) || hh < 0) hh = 0;
    if (isNaN(mm) || mm < 0) mm = 0;
    if (mm > 59) mm = 59;
    onChange(hh || mm ? `${hh}:${String(mm).padStart(2, "0")}` : "");
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={h}
        onChange={(e) => sync(e.target.value.replace(/\D/g, "").slice(0, 2), m)}
        inputMode="numeric"
        placeholder="hh"
        aria-label="Stunden"
        className="h-9 w-11 px-1 text-center font-mono text-sm"
      />
      <span className="text-sm text-muted-foreground">:</span>
      <Input
        value={m}
        onChange={(e) => sync(h, e.target.value.replace(/\D/g, "").slice(0, 2))}
        inputMode="numeric"
        placeholder="mm"
        aria-label="Minuten"
        className="h-9 w-11 px-1 text-center font-mono text-sm"
      />
    </div>
  );
}
