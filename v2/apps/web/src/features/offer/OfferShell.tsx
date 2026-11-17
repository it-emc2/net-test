// The frame of an offer: step list, total, saving state, and the active step (an <Outlet>, so
// only the active step is mounted). The address decides which offer is open.
import { isDraftKey } from "@oc/api-contract";
import { isNewOfferType, type NewOfferType } from "@oc/domain";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { euro } from "../../shared/lib/format.js";
import { ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Minus, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePrefs } from "../../shared/lib/prefs.js";
import { Alert, Button, ButtonLink, Card, CardTitle, Page, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { SelfPayPill, SelfPayRows } from "./EigenAnteil.js";
import { flushDraft, legacyAddress, newTempKey, openInLegacy, useAutosave, useOpenOffer, useSaveStatus } from "./model/draft.js";
import { useNav, useWide } from "./model/nav.js";
import { useOfferField, useOfferStore } from "./model/store.js";
import { StepDrawer } from "./StepDrawer.js";
import { usePrice } from "./model/usePrice.js";
import { OFFER_TITLES, STEPS, checkStep, firstStep, groupStartingAt, isStepOf, stepLabel, stepStatuses, type StepStatus } from "./steps.js";

function Total({ bar = false }: { bar?: boolean }) {
  const { total, pending, error } = usePrice();
  // Kassenkunde: the Eigenanteil pill is the main number, the total steps back
  const small = bar && useOfferField<string>("Kundendaten", "payer") === "Kassenkunde";
  if (error) return <Alert kind="error">Der Preis kann gerade nicht berechnet werden.</Alert>;
  return (
    <p className={cn("m-0 whitespace-nowrap", small ? "text-[0.8rem] text-muted-foreground" : "text-lg")} aria-live="polite">
      <span>Gesamt</span> {small ? <span className="tabular-nums">{euro(total)}</span> : <strong>{euro(total)}</strong>}
      {pending ? <span className="hidden text-[0.95rem] text-muted-foreground lg:inline"> wird berechnet …</span> : null}
    </p>
  );
}

/** status of every step, derived from the offer (memoized; follows typing with a delay, never blocks it) */
function useStatuses(type: NewOfferType): Record<string, StepStatus> {
  const offer = useDeferredValue(useOfferStore((s) => s.offer));
  const price = usePrice().data;
  // the step checks read the store itself, which holds exactly this offer
  return useMemo(() => stepStatuses(type, offer, price), [type, offer, price]);
}
const countsIn = (st: Record<string, StepStatus>) => {
  const k = Object.values(st).map((v) => v.kind).filter((v) => v !== "off" && v !== "none");
  return { done: k.filter((v) => v === "done").length, total: k.length };
};
/** the missing items only: no "Bitte in „Schritt“ ausfüllen:" prefix, short forms of long field labels */
const SHORT: [RegExp, string][] = [[/Genehmigung des Vermieters erforderlich\??/g, "Vermieter-Genehmigung"], [/\?/g, ""]];
export const shortReason = (m: string): string => SHORT.reduce((t, [re, to]) => t.replace(re, to), m.replace(/^Bitte in „[^“]*“ ausfüllen:\s*/, "")).trim();
const WORDS: Partial<Record<StepStatus["kind"], string>> = { done: "erledigt", open: "offen", off: "nicht gewählt" };
function StatusIcon({ s }: { s: StepStatus }) {
  const c = "size-5 shrink-0";
  switch (s.kind) {
    case "done": return <CircleCheck aria-hidden className={cn(c, "text-step-done")} />;
    case "warn": return <TriangleAlert aria-hidden className={cn(c, "text-amber-500")} />;
    case "check": return <CircleAlert aria-hidden className={cn(c, "text-destructive")} />;
    case "off": return <Minus aria-hidden className={cn(c, "text-muted-foreground")} />;
    case "open": return <Circle aria-hidden className={cn(c, "text-muted-foreground")} />;
    default: return <span aria-hidden className="size-2 shrink-0 rounded-full bg-step-idle mx-1.5" />;
  }
}

/** The step list with a status per step (done / warning / open / not chosen) and the progress on top. */
function StepList({ type, base, current, statuses }: { type: NewOfferType; base: string; current: string; statuses: Record<string, StepStatus> }) {
  const { done, total } = countsIn(statuses);
  return (
    <div className="grid gap-2">
      {total ? (
        <div>
          <p className="m-0 text-[0.9rem] text-muted-foreground" data-testid="step-progress">{done} von {total} Schritten erledigt</p>
          <div role="progressbar" aria-label="Fortschritt" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-step-done transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      ) : null}
      <ol className="m-0 grid list-none gap-1 p-0">
        {STEPS[type].map((s) => {
          const group = groupStartingAt(type, s);
          const st = statuses[s] ?? { kind: "none" as const };
          const active = s === current;
          const right = st.kind === "check" ? `${st.open} offen` : "";
          const said = st.kind === "warn" ? st.reason : st.kind === "check" ? `${st.open} offen` : WORDS[st.kind];
          return (
            <li key={s}>
              {group ? <p className="mb-1 mt-3 text-[0.85rem] font-semibold uppercase tracking-wide text-muted-foreground">{group.num ? `${group.num} · ` : ""}{group.title}</p> : null}
              <NavLink
                to={`${base}/${s}`} data-state={st.kind} aria-label={said ? `${stepLabel(s)} – ${said}` : stepLabel(s)} title={said ? `${stepLabel(s)} – ${said}` : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border border-transparent px-3 py-1.5 text-foreground no-underline transition-colors hover:bg-accent-weak",
                  active && "border-accent bg-accent-weak font-bold", st.kind === "off" && "text-muted-foreground",
                )}
              >
                <StatusIcon s={st} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{stepLabel(s)}</span>
                  {st.kind === "warn" ? <span className="line-clamp-2 text-[0.85rem] font-normal text-amber-700 dark:text-amber-400">{shortReason(st.reason)}</span> : null}
                  {st.kind === "off" ? <span className="text-[0.85rem] font-normal">nicht gewählt</span> : null}
                </span>
                {right ? <span className={cn("ml-2 shrink-0 text-[0.85rem] font-normal", st.kind === "check" ? "text-destructive" : "text-muted-foreground")}>{right}</span> : null}
              </NavLink>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A step that has no React screen yet: continue with the same offer and step in today's UI. */
export function StepInLegacy() {
  const { dealId = "", step = "" } = useParams();
  return (
    <Card>
      <CardTitle>{stepLabel(step)}</CardTitle>
      <p className="m-0">Dieser Schritt wird noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
      <LegacyLink dealId={dealId} step={step}>In der bisherigen Ansicht öffnen</LegacyLink>
    </Card>
  );
}

/** Link to today's UI for this offer; unsaved changes are saved first so nothing is lost on the way. */
export function LegacyLink({ dealId, step, children }: { dealId: string; step: string; children: string }) {
  const type = useOfferStore((s) => s.offer?.activeOffer as NewOfferType | undefined);
  return (
    <Button asChild variant="secondary" className="justify-self-start">
      <a
        href={legacyAddress(dealId, step)}
        onClick={(e) => {
          e.preventDefault();
          if (type) void openInLegacy(dealId, type, step).then((ok) => { if (!ok) toast.error("Der Wechsel wurde abgebrochen, weil das Angebot nicht gespeichert werden konnte."); });
        }}
      >
        {children}
      </a>
    </Button>
  );
}

/** /neu/<type>: an offer without a deal number gets a temporary key; the address carries it. */
export function NewOffer() {
  const { type } = useParams();
  return isNewOfferType(type) ? <Navigate to={`/deal/${newTempKey()}/${type}`} replace /> : <Navigate to="/" replace />;
}

/** the pending "put the focus on the missing entry" — one at a time, and none once the offer is left */
let focusTimer: ReturnType<typeof setTimeout> | undefined;
const cancelFocus = () => { clearTimeout(focusTimer); focusTimer = undefined; };

/** "Weiter": may the user go on? If the step still needs something, say what, show where (on
 *  the step it is on) and stay. */
function goOn(step: string, open: (step: string) => void): boolean {
  cancelFocus();
  const problem = checkStep(step);
  if (!problem) { toast.dismiss("step-check"); return true; }
  toast.error("Angaben unvollständig", { description: problem.message, id: "step-check" });
  const elsewhere = !!problem.goTo && problem.goTo !== step;
  if (elsewhere) open(problem.goTo!);
  const { focus } = problem;
  // on another step the control exists only once that step is on the page
  if (focus) focusTimer = setTimeout(() => {
    focusTimer = undefined;
    const el = document.querySelector<HTMLElement>(focus);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus({ preventScroll: true });
  }, elsewhere ? 300 : 0);
  return false;
}

export function OfferShell() {
  const { dealId = "", type: typeParam } = useParams();
  if (!isNewOfferType(typeParam) || !isDraftKey(dealId)) return <Navigate to="/" replace />;
  return <OpenOffer dealId={dealId} type={typeParam} />;
}

const barBtn = "grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground";

function OpenOffer({ dealId, type }: { dealId: string; type: NewOfferType }) {
  const navigate = useNavigate();
  const step = useLocation().pathname.split("/")[4]; // /deal/<id>/<type>/<step>
  const open = useOpenOffer(dealId, type);
  const setOfferType = usePrefs((p) => p.setOfferType);
  useEffect(() => { setOfferType(type); return () => setOfferType(null); }, [type, setOfferType]); // the offer's accent colour, as today
  useAutosave();
  const statuses = useStatuses(type);
  useEffect(() => cancelFocus, []); // leaving the offer: nothing is focused afterwards
  // a failed save is also a toast — it must not be overlooked while typing further down
  const saving = useSaveStatus();
  useEffect(() => {
    if (saving.state === "conflict") toast.error("Dieses Angebot wurde an anderer Stelle geändert. Bitte laden Sie die Seite neu.", { duration: Infinity, id: "save" });
    else if (saving.state === "failed") toast.error(`Nicht gespeichert: ${saving.message}`, { duration: Infinity, id: "save" });
    else if (saving.state === "saved") toast.dismiss("save");
  }, [saving]);
  const { sidebar, setDrawer } = useNav();
  const wide = useWide();
  useEffect(() => { setDrawer(false); }, [step, setDrawer]); // a step was chosen → the drawer folds away
  useEffect(() => () => setDrawer(false), [setDrawer]); // leaving the offer
  const base = `/deal/${dealId}/${type}`;

  if (open.status === "loading") return <Page title="Einen Moment …" lead="Das Angebot wird geöffnet." />;
  if (open.status === "error") return <Page title="Das Angebot kann nicht geöffnet werden"><Alert kind="error">{open.message}</Alert></Page>;
  if (open.status === "other-type") return <Navigate to={`/deal/${dealId}/${open.type}`} replace />;
  if (!isStepOf(type, step)) return <Navigate to={`${base}/${firstStep(type)}`} replace />;

  const temp = dealId.startsWith("t-");
  const steps = STEPS[type];
  const at = steps.indexOf(step);
  const prev = steps[at - 1], next = steps[at + 1];
  const goHome = () => { void flushDraft().then(() => navigate("/")); };
  const title = `${OFFER_TITLES[type]}${temp ? " · noch ohne Auftragsnummer" : ` · Auftrag ${dealId}`}`;
  return (
    // Wide screens (iPad landscape, desktop): the step list is a sidebar that stays in view (the
    // burger in the header hides/shows it). Narrower (iPad portrait, 834 px): no sidebar, the form
    // has the full width; a slim bar under the header names the step (‹ ›), shows the total, and
    // the burger opens the list as a drawer.
    <div className={cn("mx-auto grid max-w-6xl gap-4 px-4 pb-16 lg:gap-6 lg:pt-6", sidebar && "lg:grid-cols-[minmax(240px,300px)_1fr]")}>
      {/* the total shows once: in this bar, or (wide, sidebar shown) in the sidebar */}
      {!wide || !sidebar ? <div role="group" aria-label="Schrittleiste" className={cn("sticky top-16 z-30 -mx-4 flex items-center gap-2 border-b border-border bg-background px-4 py-2", sidebar && "lg:hidden")}>
        {prev ? <Link to={`${base}/${prev}`} aria-label="Vorheriger Schritt" className={barBtn}><ChevronLeft aria-hidden className="size-5" /></Link> : <span className={cn(barBtn, "opacity-40")} aria-hidden><ChevronLeft className="size-5" /></span>}
        <p className="m-0 min-w-0 flex-1 truncate text-center font-semibold"><span className="font-normal text-muted-foreground">{`Schritt ${at + 1}/${steps.length} · `}</span>{stepLabel(step)}</p>
        {next ? <Link to={`${base}/${next}`} aria-label="Nächster Schritt" onClick={(e) => { if (!goOn(step, (to) => navigate(`${base}/${to}`))) e.preventDefault(); }} className={barBtn}><ChevronRight aria-hidden className="size-5" /></Link> : <span className={cn(barBtn, "opacity-40")} aria-hidden><ChevronRight className="size-5" /></span>}
        <Total bar />
        <SelfPayPill base={base} />
      </div> : null}
      <StepDrawer onHome={goHome} total={<><Total /><SelfPayRows base={base} /></>}><StepList type={type} base={base} current={step} statuses={statuses} /></StepDrawer>
      <nav aria-label="Schritte" className={cn("hidden content-start gap-4 self-start overflow-y-auto pr-1 lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:sticky", sidebar && "lg:grid")}>
        <p className="m-0 font-bold">{title}</p>
        <StepList type={type} base={base} current={step} statuses={statuses} />
        {wide && sidebar ? <><Total /><SelfPayRows base={base} /></> : null}
        {/* save first, then leave; the Hauptmenü empties the store when it opens (one assignment) */}
        <Button variant="secondary" onClick={goHome}>Zum Hauptmenü</Button>
      </nav>
      <main className="grid content-start gap-4 pt-2 lg:pt-0">
        <Outlet />
        {/* with the sidebar closed these two are the way through the offer */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {prev ? <ButtonLink to={`${base}/${prev}`} aria-label={`Zurück zu ${stepLabel(prev)}`}><ChevronLeft aria-hidden />Zurück</ButtonLink> : <span />}
          {next ? <Button asChild><Link to={`${base}/${next}`} aria-label={`Weiter zu ${stepLabel(next)}`} onClick={(e) => { if (!goOn(step, (to) => navigate(`${base}/${to}`))) e.preventDefault(); }}>Weiter<ChevronRight aria-hidden /></Link></Button> : null}
        </div>
      </main>
    </div>
  );
}
