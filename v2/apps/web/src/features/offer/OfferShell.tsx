// The frame of an offer: step list, total, saving state, and the active step (an <Outlet>, so
// only the active step is mounted). The address decides which offer is open.
import { isDraftKey } from "@oc/api-contract";
import { isNewOfferType, type NewOfferType } from "@oc/domain";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { euro } from "../../shared/lib/format.js";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { usePrefs } from "../../shared/lib/prefs.js";
import { Alert, Button, ButtonLink, Card, CardTitle, Page, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { flushDraft, legacyAddress, newTempKey, openInLegacy, useAutosave, useOpenOffer, useSaveStatus } from "./model/draft.js";
import { useNav, useWide } from "./model/nav.js";
import { useOfferStore } from "./model/store.js";
import { StepDrawer } from "./StepDrawer.js";
import { usePrice } from "./model/usePrice.js";
import { OFFER_TITLES, STEPS, checkStep, firstStep, groupStartingAt, isStepOf, stepLabel } from "./steps.js";

function Total() {
  const { total, pending, error } = usePrice();
  if (error) return <Alert kind="error">Der Preis kann gerade nicht berechnet werden.</Alert>;
  return (
    <p className="m-0 whitespace-nowrap text-lg" aria-live="polite">
      <span>Gesamt</span> <strong>{euro(total)}</strong>
      {pending ? <span className="hidden text-[0.95rem] text-muted-foreground lg:inline"> wird berechnet …</span> : null}
    </p>
  );
}

/** The step list with today's progress marks: steps before the open one are done. */
function StepList({ type, base, current }: { type: NewOfferType; base: string; current: string }) {
  const at = STEPS[type].indexOf(current);
  return (
    <ol className="m-0 grid list-none gap-1 p-0">
      {STEPS[type].map((s, i) => {
        const group = groupStartingAt(type, s);
        const state = i === at ? "active" : i < at ? "done" : "idle";
        return (
          <li key={s}>
            {group ? <p className="mb-1 mt-3 text-[0.85rem] font-semibold uppercase tracking-wide text-muted-foreground">{group.num ? `${group.num} · ` : ""}{group.title}</p> : null}
            <NavLink
              to={`${base}/${s}`} data-state={state}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg border border-transparent px-3 text-foreground no-underline transition-colors hover:bg-accent-weak",
                state === "active" && "border-accent bg-accent-weak font-bold",
              )}
            >
              <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", state === "idle" ? "border-step-idle" : state === "done" ? "border-step-done bg-step-done text-white" : "border-step-active")}>
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : state === "active" ? <span className="size-2 rounded-full bg-step-active" /> : null}
              </span>
              <span>{stepLabel(s)}</span>
              {state === "done" ? <span className="sr-only"> (erledigt)</span> : null}
            </NavLink>
          </li>
        );
      })}
    </ol>
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
        <Total />
      </div> : null}
      <StepDrawer onHome={goHome} total={<Total />}><StepList type={type} base={base} current={step} /></StepDrawer>
      <nav aria-label="Schritte" className={cn("hidden content-start gap-4 self-start overflow-y-auto pr-1 lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:sticky", sidebar && "lg:grid")}>
        <p className="m-0 font-bold">{title}</p>
        <StepList type={type} base={base} current={step} />
        {wide && sidebar ? <Total /> : null}
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
