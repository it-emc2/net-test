// „Heutige Termine Planung“ + the offer picker + „Kunde nicht erreicht“, as today's Hauptmenü.
// Starting an offer from an appointment: the customer data goes into Kundendaten (planning-rules.ts).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Car, Coffee, Hash, House, Mail, MapPin, Phone, PhoneOff, RefreshCw, Route, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { call, ApiFailure } from "../../shared/api/index.js";
import { Button, Card, CardTitle, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { newTempKey, prefillNextOffer, useOfferStore } from "../offer/index.js";
import { badge, cancelled, clock, departure, enrichmentOf, enrichmentPatch, fullRouteHref, pause, phoneHref, prefill, routeHref, searchEntries, subtitle, todayEntries, typeTone, type PlanningEntry, type PlanningPayload } from "./planning-rules.js";

export const PLANNING_KEY = ["planning-current"];
const DEAL_URL = (id: string) => `https://emczwei.bitrix24.de/crm/deal/details/${encodeURIComponent(id)}/`;

/** the week from the planning service; the times of today's Bitrix calendar entries replace the planned ones */
async function loadPlanning(): Promise<PlanningPayload> {
  const payload = (await call("planningCurrent")) as PlanningPayload;
  const times = await call("bitrixActivitiesToday").then((r) => (r.byDealId ?? {}) as Record<string, { startMinutes?: number | null; endMinutes?: number | null }>, () => ({}) as Record<string, never>);
  const fix = (c: PlanningEntry): PlanningEntry => {
    const t = times[String(c?.importDealId ?? "")];
    if (!t) return c;
    const out = { ...c };
    if (t.startMinutes != null) out.manualStartMinutes = t.startMinutes;
    if (t.endMinutes != null && t.startMinutes != null) out.duration = Math.max(0, t.endMinutes - t.startMinutes);
    return out;
  };
  const p = payload.planning;
  return p ? { ...payload, planning: { ...p, ...(p.futurePlanned ? { futurePlanned: p.futurePlanned.map(fix) } : {}), ...(p.days ? { days: p.days.map((d) => ({ ...d, customers: (d.customers ?? []).map(fix) })) } : {}) } } : payload;
}

/** the planning week, live: one query, pushed updates of the planning service replace it */
export function usePlanning() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: PLANNING_KEY, queryFn: loadPlanning, staleTime: 60_000, retry: false });
  useEffect(() => {
    if (typeof EventSource !== "function" || navigator.onLine === false) return;
    const es = new EventSource("/api/planning/stream");
    const on = (ev: MessageEvent) => { try { const p = JSON.parse(ev.data as string) as PlanningPayload; if (p?.planning) qc.setQueryData(PLANNING_KEY, p); } catch { /* not a planning update */ } };
    es.addEventListener("planning", on as EventListener); es.addEventListener("message", on as EventListener);
    return () => es.close();
  }, [qc]);
  return q;
}

/** Starts a new offer of `type` from an appointment (the picker's answer). */
export function useStartFromAppointment() {
  const nav = useNavigate();
  return (e: PlanningEntry, type: string) => {
    const { kunde, auftragId } = prefill(e);
    const key = e.importDealId ? String(e.importDealId) : newTempKey();
    // the Bitrix contact: Anrede + empty fields, in the background (the offer opens without waiting)
    const contact = (async () => {
      const deal = e.importDealId ? await call("bitrixDeal", { params: { id: String(e.importDealId) } }).then((r) => r.contact ?? null, () => null) : null;
      const c = deal ?? (e.contactId ? await call("bitrixContact", { params: { id: String(e.contactId) } }).then((r) => r.result ?? null, () => null) : null);
      return c ? enrichmentOf(c) : null;
    })();
    prefillNextOffer(key, () => {
      const st = useOfferStore.getState(), o = st.offer as Record<string, any>;
      st.patch("Kundendaten", kunde as never);
      st.setTop({ auftragId: auftragId || undefined, mail: { ...(o.mail ?? {}), auftragId }, postal: { ...(o.postal ?? {}), auftragId } });
      void contact.then((f) => {
        const now = useOfferStore.getState();
        if (!f || now.dealId !== key) return; // the offer was left meanwhile
        const patch = enrichmentPatch(f, (now.offer as Record<string, any>).Kundendaten ?? {});
        if (Object.keys(patch).length) now.patch("Kundendaten", patch as never);
      });
    });
    nav(`/deal/${key}/${type}`);
  };
}

const TYPES: [string, string][] = [["bu", "Badumbau"], ["bwt", "Badewannentür"], ["bl", "Badelift"], ["hl", "Handlauf"], ["ah", "Alltagshilfe"]];
const NOT_YET: [string, string][] = [["wd", "Winterdienst"], ["hms", "Hausmeister-Service"]];

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" data-testid="planning-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        className={cn("relative grid max-h-[90dvh] w-full gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl outline-none", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0">{title}</h3>
          <button type="button" aria-label="Schließen" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-lg border border-border"><X aria-hidden className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** „Welche Angebotsart möchten Sie öffnen?“ — also what a tap in the week calendar opens */
export function OfferPicker({ entry, onClose }: { entry: PlanningEntry; onClose: () => void }) {
  const start = useStartFromAppointment();
  return (
    <Modal title="Welche Angebotsart möchten Sie öffnen?" onClose={onClose} wide>
      <p className="m-0 text-muted-foreground">{entry.name || "Unbekannt"} · {entry.address || "Ort unbekannt"}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TYPES.map(([t, title]) => <Button key={t} variant="outline" size="lg" className="h-auto min-h-20 flex-col" data-offer-key={t} onClick={() => { onClose(); start(entry, t); }}>{title}</Button>)}
        {NOT_YET.map(([t, title]) => <Button key={t} asChild variant="secondary" size="lg" className="h-auto min-h-20 flex-col whitespace-normal text-center"><a href="/" data-offer-key={t}>{title}<span className="text-[0.95rem] font-normal">in der bisherigen Ansicht</span></a></Button>)}
      </div>
    </Modal>
  );
}

const REASONS = ["Kunde nicht erreichbar", "Kunde war nicht zu Hause", "Termin vom Kunden abgesagt", "Kunde wünscht neuen Termin", "Falsche / ungültige Kontaktdaten", "Sonstiges"];
function NoContact({ dealId, onClose, onMoved }: { dealId: string; onClose: () => void; onMoved: () => void }) {
  const [picked, setPicked] = useState<string[]>([REASONS[0]!]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const reasons = picked.length ? picked : [REASONS[0]!], n = note.trim();
    const comment = reasons.length === 1 ? `📵 Termin nicht zustande gekommen – ${reasons[0]}${n ? `\n${n}` : ""}` : `📵 Termin nicht zustande gekommen:\n${reasons.map((r) => `• ${r}`).join("\n")}${n ? `\n${n}` : ""}`;
    setBusy(true);
    try {
      const r = await call("moveBesichtigung", { params: { id: dealId }, body: { comment, reason: reasons.join(", ") + (n ? ` – ${n}` : "") } });
      onMoved(); onClose();
      if (r.commentFailed) toast.error("Deal verschoben — Kommentar konnte nicht gespeichert werden.");
      else if (r.plannerSynced === false) toast.error("Deal verschoben — Routenplaner nicht aktualisiert, bitte Innendienst informieren.");
      else toast.success("Deal auf „Besichtigungstermin vereinbaren“ verschoben.");
    } catch (e) { setBusy(false); toast.error(`Fehler: ${e instanceof ApiFailure ? e.message : "Verschieben fehlgeschlagen."}`); }
  };
  return (
    <Modal title="Kunde nicht erreicht" onClose={onClose}>
      <p className="m-0 text-muted-foreground">Der Deal wird zurück auf „Besichtigungstermin vereinbaren“ verschoben und der Grund als Kommentar hinterlegt.</p>
      <fieldset className="m-0 grid gap-2 border-0 p-0"><legend className="mb-1 font-semibold">Grund</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-input px-3 has-[:checked]:border-primary has-[:checked]:bg-accent-weak">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={picked.includes(r)} onChange={(e) => setPicked(e.target.checked ? [...picked, r] : picked.filter((x) => x !== r))} />{r}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1.5 font-semibold">Kommentar (optional)
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zusätzliche Anmerkung …" className="rounded-lg border-2 border-input bg-card p-3 text-base font-normal" />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button disabled={busy} onClick={() => void submit()}>{busy ? "Verschiebe…" : "Verschieben & kommentieren"}</Button>
      </div>
    </Modal>
  );
}

const TONE: Record<string, string> = { bu: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200", bwt: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200", hl: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200", ah: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200", hms: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200", manual: "bg-muted text-foreground" };
export const Chip = ({ children, tone = "manual", className }: { children: ReactNode; tone?: string; className?: string }) => <span className={cn("inline-flex min-h-7 items-center rounded-full px-3 text-[0.95rem] font-semibold", TONE[tone], className)}>{children}</span>;

/** the way to and from the company, from /api/routing/suggest-distance (cached per address): minutes and km one way */
function useTravel(e: PlanningEntry | undefined) {
  const street = e?.street || "", plz = e?.postalCode || "", city = e?.city || "";
  const a = e?.address ? { street: street || e.address.split(",")[0]?.trim() || "", postalCode: plz || /(\d{5})/.exec(e.address)?.[1] || "", city: city || /\d{5}\s+([^,]+)/.exec(e.address)?.[1] || "" } : { street, postalCode: plz, city };
  const on = !!(a.street || a.postalCode || a.city);
  return useQuery({ queryKey: ["company-travel", a.street, a.postalCode, a.city], enabled: on, staleTime: Infinity, retry: false,
    queryFn: () => call("suggestDistance", { body: { Kundendaten: a } }).then((r) => (r.ok && Number.isFinite(Number(r.oneWaySeconds)) ? { min: Math.round(Number(r.oneWaySeconds) / 60), km: r.oneWayKm != null ? Number(r.oneWayKm) : null } : null), () => null) }).data ?? null;
}
const Row = ({ children, className, ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) => <div {...p} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5", className)}>{children}</div>;
const Dot = ({ c }: { c: string }) => <span aria-hidden className={cn("size-2 shrink-0 rounded-full", c)} />;
const PRIO_DOT: Record<string, string> = { high: "bg-red-600", medium: "bg-amber-500", low: "bg-slate-400" };

export function PlanningToday({ onPick }: { onPick: (e: PlanningEntry) => void }) {
  const q = usePlanning();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [noShow, setNoShow] = useState<string | null>(null);
  const { entries, dateLabel } = useMemo(() => todayEntries(q.data), [q.data]);
  const shown = useMemo(() => searchEntries(entries, search), [entries, search]);
  const mark = (id: string) => setDone((d) => new Set(d).add(id));
  // a saved draft or offer of the deal hides „Termin hat nicht statt gefunden.“ (own database, once per deal)
  const checked = useRef(new Set<string>());
  useEffect(() => {
    for (const e of entries) {
      const id = String(e.importDealId ?? "");
      if (!id || checked.current.has(id)) continue;
      checked.current.add(id);
      void call("offersByDeal", { params: { dealId: id } }).then((l) => { if (l.length) mark(id); }, () => undefined);
    }
  }, [entries]);
  const first = shown[0], last = [...shown].reverse().find((e) => !cancelled(e)); // the day ends with the last appointment that takes place
  const startT = useTravel(first), endT = useTravel(last !== first ? last : undefined) ?? startT;
  const route = fullRouteHref(entries), p = pause(q.data?.planning?.todayPause, shown);
  const home = entries.find((e) => e.companyAddress)?.companyAddress || "Firma";
  const open = (e: PlanningEntry) => { void call("logAction", { body: { event: "termin_opened", dealId: e.importDealId || "" } }).catch(() => undefined); setActive(e.entryId); onPick(e); };
  const meta = q.isPending ? "Lade Termine…" : q.isError ? "Planungsdaten konnten nicht geladen werden" : `${entries.length} Termin(e) für ${dateLabel}`;
  const asked = async (e: PlanningEntry) => {
    const id = String(e.importDealId);
    const saved = await call("offersByDeal", { params: { dealId: id } }).then((l) => l.length > 0, () => false);
    if (saved) mark(id); else setNoShow(id);
  };
  const dep = first ? departure(first.manualStartMinutes, startT?.min) : null;
  const lastEnd = last && Number.isFinite(Number(last.manualStartMinutes)) && Number.isFinite(Number(last.duration)) ? Number(last.manualStartMinutes) + Number(last.duration) : null;
  return (
    <Card data-testid="home-appointments" aria-labelledby="planning-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle id="planning-title">Heutige Termine Planung</CardTitle>
          <p className="m-0 flex items-center gap-2" aria-live="polite" data-testid="planning-meta">
            <span aria-hidden className={cn("size-3 rounded-full", q.isError ? "bg-destructive" : q.isPending ? "bg-muted-foreground" : "bg-step-done")} />{meta}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input type="text" aria-label="Termine suchen" placeholder="Name, Ort, Telefon, E-Mail…" autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={search} onChange={(e) => setSearch(e.target.value)} className="h-12 w-64 rounded-lg border-2 border-input bg-card pl-3 pr-12 text-base" />
            {search ? <button type="button" aria-label="Suche löschen" onClick={() => setSearch("")} className="absolute right-0.5 top-0.5 grid size-11 place-items-center"><X aria-hidden className="size-5" /></button> : null}
          </div>
          {route ? <Button asChild variant="secondary"><a href={route} target="_blank" rel="noopener" title="Alle heutigen Termine + Rückfahrt zur Firma als eine Route öffnen"><Route aria-hidden />Route (Google)</a></Button>
            : <Button variant="secondary" disabled aria-disabled><Route aria-hidden />Route (Google)</Button>}
          <Button variant="secondary" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw aria-hidden className={q.isFetching ? "animate-spin" : ""} />{q.isFetching ? "Lädt…" : "Aktualisieren"}</Button>
        </div>
      </div>
      <div className="grid gap-2" aria-live="polite">
        {q.isPending ? <p className="m-0">Lade Termine…</p> : q.isError ? (
          <div role="alert" className="flex items-start gap-3 rounded-lg border-2 border-destructive p-4">
            <TriangleAlert aria-hidden className="size-6 shrink-0 text-destructive" />
            <div className="grid gap-2"><strong>Planungstermine konnten nicht geladen werden</strong><p className="m-0">Die Verbindung zum Server ist fehlgeschlagen.</p>
              <Button variant="secondary" className="justify-self-start" onClick={() => void q.refetch()}><RefreshCw aria-hidden />Erneut versuchen</Button></div>
          </div>
        ) : !shown.length ? <p className="m-0">Keine Planungstermine für heute gefunden</p> : <>
          {first ? (
            <Row data-testid="departure" className="bg-accent-weak text-foreground">
              <Car aria-hidden className="size-6 shrink-0 text-primary" />
              {dep ? <>
                <strong className="text-lg">Abfahrt {dep}</strong>
                <span className="text-foreground/80">ab {home} · {startT!.min} Min{startT!.km != null ? ` · ${Math.round(startT!.km)} km` : ""} bis zum 1. Termin</span>
              </> : <span className="text-muted-foreground">Abfahrt: Fahrzeit unbekannt</span>}
              {route ? <Button asChild variant="secondary" className="ml-auto"><a href={route} target="_blank" rel="noopener"><Route aria-hidden />Route</a></Button> : null}
            </Row>
          ) : null}
          {shown.map((e, i) => {
            const off = cancelled(e), deal = e.importDealId ? String(e.importDealId) : "", tel = phoneHref(e.phone);
            const travel = Number(e.travelMinutesAfter), s = Number(e.manualStartMinutes), d = Number(e.duration);
            const hasStart = Number.isFinite(s) && s >= 0, hasDur = d > 0;
            return (
              <div key={e.entryId} className="grid gap-2">
                <article data-testid="appointment" data-id={e.entryId} className={cn("grid cursor-pointer grid-cols-[140px_1fr] gap-[14px] rounded-lg border-2 border-border p-4", active === e.entryId && "border-primary", off && "cursor-default opacity-70")} onClick={() => { if (!off) open(e); }}>
                  <div data-testid="appt-left" className="flex flex-col items-start gap-1.5 border-r border-border pr-3.5 text-[13px] text-muted-foreground">
                    <span className="text-[1.4rem] font-medium tabular-nums leading-tight text-foreground">{hasStart ? clock(s) : "–"}</span>
                    <span className="whitespace-nowrap">{hasStart && hasDur ? `bis ${clock(s + d)} · ${d} Min` : hasDur ? `${d} Min` : "Dauer offen"}</span>
                    {e.taetigkeitenBadge ? <span className="flex items-center gap-2"><Dot c="bg-primary" />{String(e.taetigkeitenBadge).toUpperCase()}</span> : null}
                    <span className="flex items-center gap-2"><Dot c={off ? "bg-slate-400" : e.locked ? "bg-primary" : PRIO_DOT[String(e.priority || "").toLowerCase()] ?? "bg-slate-400"} />{badge(e)}</span>
                    {deal ? <button type="button" aria-label={`Deal ${deal} in Bitrix öffnen`} className="-ml-1 flex min-h-11 cursor-pointer items-center gap-1.5 px-1" onClick={(ev) => { ev.stopPropagation(); window.open(DEAL_URL(deal), "_blank", "noopener"); }}><Hash aria-hidden className="size-4" />{deal}</button> : null}
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <div className={cn("text-[1.05rem] font-medium", off ? "text-muted-foreground line-through" : "text-foreground")}>{e.name || "Unbekannt"}</div>
                    <div className="text-muted-foreground">{subtitle(e)}</div>
                    <span className="flex items-center gap-2"><MapPin aria-hidden className="size-5 shrink-0" />{e.address || "Ort unbekannt"}</span>
                    <span className="flex items-center gap-2"><Phone aria-hidden className="size-5 shrink-0" />{e.phone || "Keine Telefonnummer"}</span>
                    <span className={cn("flex items-center gap-2", !e.email && "text-muted-foreground")}><Mail aria-hidden className="size-5 shrink-0" />{e.email || "Keine E-Mail"}</span>
                    {e.hinweise ? <p className="m-0 flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-amber-950 dark:bg-amber-950 dark:text-amber-100"><TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />{e.hinweise}</p> : null}
                    <div className="flex flex-wrap gap-2 pt-1.5">
                      <Button disabled={off} onClick={(ev) => { ev.stopPropagation(); open(e); }}>{off ? <><Ban aria-hidden />Nicht verfügbar</> : "In Konfigurator öffnen"}</Button>
                      {tel ? <Button asChild variant="secondary"><a href={`tel:${tel}`} aria-label={`Kunde anrufen: ${e.phone}`} onClick={(ev) => ev.stopPropagation()}><Phone aria-hidden />Anrufen</a></Button> : null}
                      {e.address ? <Button asChild variant="secondary"><a href={routeHref(e.address)} target="_blank" rel="noopener" aria-label={`Route zu ${e.address}`} onClick={(ev) => ev.stopPropagation()}>Route</a></Button> : null}
                      {!off && deal && !done.has(deal) ? <Button variant="outline" onClick={(ev) => { ev.stopPropagation(); void asked(e); }}><PhoneOff aria-hidden />Termin hat nicht statt gefunden.</Button> : null}
                    </div>
                  </div>
                </article>
                {i < shown.length - 1 && travel > 0 ? (
                  <Row data-testid="travel" className="border border-dashed border-border text-muted-foreground"><Car aria-hidden className="size-5" /><span className="font-medium text-foreground">{travel} Min Fahrt / Puffer</span>{Number.isFinite(s) && d > 0 ? <span>Ankunft ca. {clock(s + d + travel)}</span> : null}</Row>
                ) : null}
                {p && p.index === i ? (
                  <Row data-testid="pause" className="bg-amber-100 py-3.5 text-amber-950 dark:bg-amber-950 dark:text-amber-100"><Coffee aria-hidden className="size-6" /><span className="text-base font-medium">{p.text.replace(/^(Pause \d{2}:\d{2})–(\d{2}:\d{2}) · (\d+ Min)$/, "$1 – $2")}</span>{p.text.match(/(\d+ Min)$/) ? <span>{p.text.match(/(\d+ Min)$/)![1]}</span> : null}</Row>
                ) : null}
              </div>
            );
          })}
          {endT && lastEnd != null ? (
            <Row data-testid="return" className="bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100"><House aria-hidden className="size-5" /><span className="font-medium">Rückfahrt ab {clock(lastEnd)} · Ankunft ca. {clock(lastEnd + endT.min)}</span><span>nach {home} · {endT.min} Min</span></Row>
          ) : null}
        </>}
      </div>
      {noShow ? <NoContact dealId={noShow} onClose={() => setNoShow(null)} onMoved={() => mark(noShow)} /> : null}
    </Card>
  );
}
