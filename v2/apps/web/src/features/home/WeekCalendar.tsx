// „Wochenkalender Vertrieb“ on the lean week API: loaded only when the calendar is on screen. At tablet
// width (834 px) the days are rows, from 1024 px columns. Empty days are one line. A tap loads that day
// (full customer data, ~3 KB) and opens the same offer picker as the list.
import { useQuery } from "@tanstack/react-query";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "../../shared/api/index.js";
import { Button, Card, CardTitle, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { Chip } from "./Planning.js";
import { mondayKey, todayModel, typeTone, weekBadge, weekModel, type PlanningEntry, type TodayPayload, type WeekPayload } from "./planning-rules.js";

/** true once the element has been on screen (without IntersectionObserver: at once) */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver((r) => { if (r.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

export function WeekCalendar({ onPick }: { onPick: (e: PlanningEntry) => void }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [offset, setOffset] = useState(0);
  const from = useMemo(() => mondayKey(new Date(), offset), [offset]);
  const q = useQuery({ queryKey: ["planning-week", from], enabled: seen, queryFn: () => call("planningWeek", { query: `from=${from}` }) as Promise<WeekPayload>, staleTime: 60_000, retry: false });
  const view = useMemo(() => (q.data ? weekModel(q.data, offset) : null), [q.data, offset]);
  const tap = async (date: string, id: string) => {
    try {
      const day = todayModel((await call("planningToday", { query: `date=${date}` })) as TodayPayload);
      const e = day.entries.find((x) => x.entryId === id);
      if (e) onPick(e); else toast.error("Der Termin wurde nicht gefunden. Bitte laden Sie den Kalender neu.");
    } catch { toast.error("Der Termin konnte nicht geladen werden."); }
  };
  return (
    <Card data-testid="week-calendar" aria-labelledby="week-title">
      <div ref={ref} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle id="week-title">Wochenkalender Vertrieb</CardTitle>
          <p className="m-0" data-testid="week-meta">{view ? view.meta : q.isError ? "Kalender konnte nicht geladen werden" : "Lade Kalender…"}</p>
        </div>
        <div role="group" aria-label="Woche wechseln" className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Vorherige Woche" title="Vorherige Woche" onClick={() => setOffset(offset - 1)}><ChevronLeft aria-hidden /></Button>
          <Button variant={offset === 0 ? "default" : "outline"} className="min-w-12 px-3" title="Zur aktuellen Woche" disabled={offset === 0} onClick={() => setOffset(0)}>Diese Woche</Button>
          <Button variant="outline" size="icon" aria-label="Nächste Woche" title="Nächste Woche" onClick={() => setOffset(offset + 1)}><ChevronRight aria-hidden /></Button>
        </div>
      </div>
      {q.isError ? <p role="alert" className="m-0">Die Wochenplanung konnte nicht geladen werden. <Button variant="link" onClick={() => void q.refetch()}>Erneut versuchen</Button> <a className="text-primary underline" href="/">Planung in der bisherigen Ansicht</a></p>
        : !seen || q.isPending ? <p className="m-0">Lade Wochenplanung…</p> : !view?.days.length ? (
          <p className="m-0 flex items-center gap-2"><CalendarX aria-hidden className="size-5" />Keine Planungstermine in dieser Woche</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-4">
            {view.days.map((d) => d.entries.length ? (
              <section key={d.date} data-testid="week-day" aria-current={d.today ? "date" : undefined} className={cn("grid content-start gap-2 rounded-lg border-2 p-3", d.today ? "border-primary bg-accent-weak" : "border-border")}>
                <header className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="text-lg">{d.name}</strong>
                  {d.today ? <Chip tone="bu">Heute</Chip> : null}
                  <span className="font-semibold">{d.dateNum}. {d.month}</span>
                  <span className="w-full text-muted-foreground">{d.active} Termin{d.active !== 1 ? "e" : ""}{d.cancelled ? ` · ${d.cancelled} abg.` : ""}</span>
                </header>
                {d.entries.map((e) => (
                  <button key={e.id} type="button" disabled={e.status === "cancelled"} onClick={() => void tap(d.date, e.id)}
                    className={cn("grid min-h-14 cursor-pointer gap-0.5 rounded-lg border border-border bg-card p-2 text-left disabled:cursor-default disabled:opacity-60", e.status === "cancelled" && "line-through")}>
                    <span className="flex items-center justify-between gap-2"><span className="font-semibold">{e.start || "–"}</span>
                      <span className="flex items-center gap-1.5">{e.offerType ? <Chip tone={typeTone(e.offerType)} className="min-h-6 px-2 text-[0.85rem]">{e.offerType.toUpperCase()}</Chip> : null}<span className="text-[0.95rem] text-muted-foreground">{weekBadge(e.status)}</span></span></span>
                    <span>{e.name || "Unbekannt"}</span>
                  </button>
                ))}
              </section>
            ) : (
              <p key={d.date} data-testid="week-day-empty" className="m-0 flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-muted-foreground"><CalendarX aria-hidden className="size-5" /><strong className="font-semibold text-foreground">{d.name} {d.dateNum}. {d.month}</strong> · keine Termine</p>
            ))}
          </div>
        )}
    </Card>
  );
}
