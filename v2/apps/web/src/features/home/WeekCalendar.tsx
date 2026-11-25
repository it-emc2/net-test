// „Wochenkalender Vertrieb“ on the lean week API: loaded only when the calendar is on screen. Agenda layout
// at every width: one row per day — a narrow day label (today tinted, „Heute“) and the day's appointments
// as a wrapping grid (3 per row in the 768 px page, 1 on a phone). Empty days are one slim line, an empty
// weekend one line together (weekRows). A tap loads that day (full customer data, ~3 KB) and opens the
// same offer picker as the list.
import { useQuery } from "@tanstack/react-query";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "../../shared/api/index.js";
import { Button, Card, CardTitle, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { Chip } from "./Planning.js";
import { emptyLabel, mondayKey, termine, todayModel, typeTone, weekBadge, weekModel, weekRows, type PlanningEntry, type TodayPayload, type WeekPayload } from "./planning-rules.js";
import { CLASSIC_HOME } from "../../shared/lib/classic-ui.js";

/** label column + appointments; today: the primary tint, pulled out to the card edge */
const ROW = "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]";
const TODAY = "-mx-3 rounded-lg border-transparent bg-accent-weak px-3";

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
      {q.isError ? <p role="alert" className="m-0">Die Wochenplanung konnte nicht geladen werden. <Button variant="link" onClick={() => void q.refetch()}>Erneut versuchen</Button> <a className="text-primary underline" href={CLASSIC_HOME}>Planung in der bisherigen Ansicht</a></p>
        : !seen || q.isPending ? <p className="m-0">Lade Wochenplanung…</p> : !view?.days.length ? (
          <p className="m-0 flex items-center gap-2"><CalendarX aria-hidden className="size-5" />Keine Planungstermine in dieser Woche</p>
        ) : (
          <div className="grid divide-y divide-border" data-testid="week-agenda">
            {weekRows(view.days).map((r) => {
              if (r.kind === "empty") {
                const l = emptyLabel(r.days), today = r.days.some((d) => d.today);
                return (
                  <p key={r.days[0]!.date} data-testid="week-day-empty" aria-current={today ? "date" : undefined} className={cn(ROW, "m-0 items-baseline py-2 text-muted-foreground", today && TODAY)}>
                    <span className={cn("font-semibold", today ? "text-primary-text" : "text-foreground")}>{l.name}</span>
                    <span><span className="text-foreground">{l.date}</span> · keine Termine</span>
                  </p>
                );
              }
              const d = r.day;
              return (
                <section key={d.date} data-testid="week-day" aria-current={d.today ? "date" : undefined} className={cn(ROW, "py-3", d.today && TODAY)}>
                  <header className="grid content-start gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <strong className={cn("text-lg leading-tight", d.today && "text-primary-text")}>{d.name}</strong>
                      {d.today ? <span className="rounded-full bg-primary px-2 text-[0.8rem] font-semibold leading-5 text-primary-foreground">Heute</span> : null}
                    </span>
                    <span className="font-semibold">{d.dateNum}. {d.month}</span>
                    <span className="text-[0.9rem] leading-snug text-muted-foreground">{termine(d.active)}{d.cancelled ? <><br />{d.cancelled} abgesagt</> : null}</span>
                  </header>
                  <div className="grid content-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]">
                    {d.entries.map((e) => (
                      <button key={e.id} type="button" disabled={e.status === "cancelled"} onClick={() => void tap(d.date, e.id)}
                        className="grid min-h-11 min-w-0 cursor-pointer content-start gap-1 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent-weak disabled:cursor-default disabled:opacity-60 disabled:hover:bg-card">
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-semibold tabular-nums">{e.start || "–"}</span>
                          {e.offerType ? <Chip tone={typeTone(e.offerType)} className="min-h-6 px-2 text-[0.85rem]">{e.offerType.toUpperCase()}</Chip> : null}
                          <span className="ml-auto text-[0.85rem] text-muted-foreground">{weekBadge(e.status)}</span>
                        </span>
                        <span className={cn("break-words leading-snug", e.status === "cancelled" && "line-through")}>{e.name || "Unbekannt"}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
    </Card>
  );
}
