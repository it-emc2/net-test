// "Diagnose Planung" — replaces today's debug panel of the Hauptmenü (initHomeDebugPanel: only on
// localhost; counts of today's appointments and planning entries, the endpoints, reload, raw data to
// the browser console). Here for admins on every host; the raw data are shown on the page instead of
// the console. Reads only — nothing is changed.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiFailure, call } from "../../shared/api/index.js";
import { Alert, Button } from "../../shared/ui/index.js";
import { Badge } from "./parts.js";

const failText = (e: unknown) => (e instanceof ApiFailure ? e.message : e instanceof Error ? e.message : "Fehler beim Laden.");
const monday = (d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

/** how many entries an answer holds (the list it carries, or the keys of a map) */
export function countOf(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;
  if ("plan" in d) return Array.isArray(d.plan?.termine) ? d.plan.termine.length : 0;
  if (Array.isArray(d.days)) return d.days.reduce((n: number, day: any) => n + (Array.isArray(day?.entries) ? day.entries.length : 0), 0);
  if (d.byDealId && typeof d.byDealId === "object") return Object.keys(d.byDealId).length;
  return null;
}

function Panel({ id, title, endpoint, load }: { id: string; title: string; endpoint: string; load: (signal: AbortSignal) => Promise<unknown> }) {
  const q = useQuery({ queryKey: ["admin", "diagnose", id], queryFn: ({ signal }) => load(signal), retry: false, staleTime: 0 });
  const [raw, setRaw] = useState(false);
  const n = countOf(q.data);
  return (
    <section className="grid gap-2 rounded-xl border border-border bg-card p-4" data-testid={`diag-${id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 flex-1">{title}</h3>
        {q.isFetching ? <Badge>Lädt …</Badge> : q.error ? <Badge tone="bad">Fehler</Badge> : <Badge tone="ok">{n === null ? "geladen" : `${n} Einträge`}</Badge>}
      </div>
      <code className="break-all text-[0.85rem] text-muted-foreground">{endpoint}</code>
      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>Neu laden</Button>
        <Button variant="outline" aria-expanded={raw} onClick={() => setRaw(!raw)}>{raw ? "Rohdaten ausblenden" : "Rohdaten anzeigen"}</Button>
      </div>
      {raw ? <pre className="m-0 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-[0.8rem]" data-testid={`diag-${id}-raw`}>{q.data === undefined ? "–" : JSON.stringify(q.data, null, 2)}</pre> : null}
    </section>
  );
}

export function PlanningDebugPage() {
  const from = monday();
  return (
    <section className="grid gap-4" data-testid="admin-planning">
      <h2 className="m-0 text-[1.3rem]">Diagnose Planung</h2>
      <p className="m-0 text-muted-foreground">Was der Hauptmenü-Bereich „Heutige Termine Planung“ und der Wochenkalender gerade vom Server bekommen. Nur lesen – hier wird nichts geändert.</p>
      <Panel id="today" title="Heutige Planung" endpoint="GET /api/planning/v2/today" load={(signal) => call("planningToday", { signal })} />
      <Panel id="activities" title="Heutige Termine (Bitrix-Kalender)" endpoint="GET /api/bitrix/activities/today" load={(signal) => call("bitrixActivitiesToday", { signal })} />
      <Panel id="week" title="Wochenkalender" endpoint={`GET /api/planning/v2/week?from=${from}`} load={(signal) => call("planningWeek", { signal, query: `from=${from}` })} />
      <Panel id="health" title="Server" endpoint="GET /health" load={async (signal) => {
        const r = await fetch("/health", { credentials: "include", signal });
        if (!r.ok) throw new Error(`Der Server hat mit einem Fehler geantwortet (${r.status}).`);
        return r.json();
      }} />
    </section>
  );
}
