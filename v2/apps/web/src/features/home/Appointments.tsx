// Today's appointments (U-010 C5): first on the Hauptmenü. Opening one with a deal number = „Öffnen“.
import { useQuery } from "@tanstack/react-query";
import { call } from "../../shared/api/index.js";
import { Button, Card, CardTitle } from "../../shared/ui/index.js";
import { isCancelled, timeLabel, todaysAppointments, type Appointment } from "./rules.js";

export function Appointments({ onOpenDeal }: { onOpenDeal: (dealId: string) => void }) {
  const q = useQuery({ queryKey: ["planning-today"], queryFn: () => call("planningCurrent"), staleTime: 60_000, retry: false });
  const list = todaysAppointments(q.data?.planning as never);
  return (
    <Card data-testid="home-appointments">
      <CardTitle>Heutige Termine</CardTitle>
      {q.isPending ? <p className="m-0">Lade Termine …</p> : q.isError ? (
        <p className="m-0" role="alert">Die Termine konnten nicht geladen werden. <a className="text-primary underline" href="/">Planung in der bisherigen Ansicht</a></p>
      ) : !list.length ? <p className="m-0">Keine Planungstermine für heute gefunden.</p> : (
        <ul className="m-0 grid list-none gap-2 p-0">{list.map((a) => <Row key={a.id} a={a} onOpenDeal={onOpenDeal} />)}</ul>
      )}
    </Card>
  );
}

function Row({ a, onOpenDeal }: { a: Appointment; onOpenDeal: (dealId: string) => void }) {
  const cancelled = isCancelled(a);
  const deal = a.importDealId ? String(a.importDealId) : "";
  const phone = (a.phone ?? "").replace(/[^\d+]/g, "");
  return (
    <li className="grid gap-1 rounded-lg border border-border p-3" data-testid="appointment">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <strong className={cancelled ? "line-through" : ""}>{a.name || "Unbekannt"}</strong>
        <span>{timeLabel(a)}</span>
        {cancelled ? <span className="font-semibold">Abgesagt</span> : null}
        {deal ? <span className="text-muted-foreground">#{deal}</span> : null}
      </div>
      <span className="text-muted-foreground">{a.address || "Ort unbekannt"}</span>
      {a.hinweise ? <span>⚠ {a.hinweise}</span> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {phone ? <Button asChild variant="secondary"><a href={`tel:${phone}`}>Anrufen</a></Button> : null}
        {a.address ? <Button asChild variant="secondary"><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.address)}`} target="_blank" rel="noopener">Route</a></Button> : null}
        {cancelled ? null : deal ? <Button onClick={() => onOpenDeal(deal)}>In Konfigurator öffnen</Button>
          : <Button asChild variant="secondary"><a href="/">In der bisherigen Ansicht öffnen</a></Button>}
      </div>
    </li>
  );
}
