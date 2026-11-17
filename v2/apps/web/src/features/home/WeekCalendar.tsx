// „Wochenkalender Vertrieb“: Mon–Fri of the week, as today's Hauptmenü. At tablet width (834 px) the
// days are rows, from 1024 px columns. Tapping an appointment = the same as on the list (offer picker).
import { CalendarX, ChevronLeft, ChevronRight, Lock, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardTitle, cn } from "../../shared/ui/index.js";
import { Chip, usePlanning } from "./Planning.js";
import { badge, cancelled, startClock, weekView, type PlanningEntry } from "./planning-rules.js";

export function WeekCalendar({ onPick }: { onPick: (e: PlanningEntry) => void }) {
  const q = usePlanning();
  const [want, setWant] = useState(0);
  const view = useMemo(() => (q.data?.planning ? weekView(q.data, want) : null), [q.data, want]);
  const nav = "min-w-12 px-3";
  return (
    <Card data-testid="week-calendar" aria-labelledby="week-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle id="week-title">Wochenkalender Vertrieb</CardTitle>
          <p className="m-0" data-testid="week-meta">{view ? view.meta : q.isError ? "Kalender konnte nicht geladen werden" : "Lade Kalender…"}</p>
        </div>
        <div role="group" aria-label="Woche wechseln" className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Vorherige Woche" title="Vorherige Woche" disabled={!view || view.offset <= view.bounds.min} onClick={() => setWant((view?.offset ?? 0) - 1)}><ChevronLeft aria-hidden /></Button>
          <Button variant={view?.offset === 0 ? "default" : "outline"} className={nav} title="Zur aktuellen Woche" disabled={!view || view.offset === 0} onClick={() => setWant(0)}>Diese Woche</Button>
          <Button variant="outline" size="icon" aria-label="Nächste Woche" title="Nächste Woche" disabled={!view || view.offset >= view.bounds.max} onClick={() => setWant((view?.offset ?? 0) + 1)}><ChevronRight aria-hidden /></Button>
        </div>
      </div>
      {q.isPending ? <p className="m-0">Lade Wochenplanung…</p> : !view ? null : !view.days.length ? (
        <p className="m-0 flex items-center gap-2"><CalendarX aria-hidden className="size-5" />Keine Planungstermine in dieser Woche</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {view.days.map((d) => (
            <section key={d.date} data-testid="week-day" aria-current={d.today ? "date" : undefined} className={cn("grid content-start gap-2 rounded-lg border-2 p-3", d.today ? "border-primary bg-accent-weak" : "border-border")}>
              <header className="flex flex-wrap items-baseline gap-x-2">
                <strong className="text-lg">{d.name}</strong>
                {d.today ? <Chip tone="bu">Heute</Chip> : null}
                {d.locked ? <Lock aria-label="Tag gesperrt" className="size-4" /> : null}
                <span className="font-semibold">{d.dateNum}. {d.month}</span>
                <span className="w-full text-muted-foreground">{d.active} Termin{d.active !== 1 ? "e" : ""}{d.cancelled ? ` · ${d.cancelled} abg.` : ""}</span>
                {d.zone ? <span className="flex w-full items-center gap-1 text-muted-foreground" title="Schwerpunkt-Region an diesem Tag"><MapPin aria-hidden className="size-4" />{d.zone}</span> : null}
              </header>
              {d.entries.length ? d.entries.map((e) => (
                <button key={e.entryId} type="button" disabled={cancelled(e)} onClick={() => onPick(e)}
                  className={cn("grid min-h-14 cursor-pointer gap-0.5 rounded-lg border border-border bg-card p-2 text-left disabled:cursor-default disabled:opacity-60", cancelled(e) && "line-through")}>
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold">{startClock(e) || "–"}</span><span className="text-[0.95rem] text-muted-foreground">{badge(e, true)}</span></span>
                  <span>{e.name || "Unbekannt"}</span>
                </button>
              )) : <p className="m-0 flex items-center gap-2 text-muted-foreground"><CalendarX aria-hidden className="size-5" />Keine Termine</p>}
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
