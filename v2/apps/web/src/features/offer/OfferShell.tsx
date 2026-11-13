// The frame of an offer: step list, total, saving state, and the active step (an <Outlet>, so
// only the active step is mounted). The address decides which offer is open.
import { isDraftKey } from "@oc/api-contract";
import { isNewOfferType, type NewOfferType } from "@oc/domain";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { euro } from "../../shared/lib/format.js";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { usePrefs } from "../../shared/lib/prefs.js";
import { Alert, Button, ButtonLink, Card, CardTitle, Page, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { flushDraft, legacyAddress, newTempKey, openInLegacy, useAutosave, useOpenOffer, useSaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";
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
  const [stepsOpen, setStepsOpen] = useState(false);
  useEffect(() => { setStepsOpen(false); }, [step]); // a step was chosen → fold the list away again (narrow screens)
  const base = `/deal/${dealId}/${type}`;

  if (open.status === "loading") return <Page title="Einen Moment …" lead="Das Angebot wird geöffnet." />;
  if (open.status === "error") return <Page title="Das Angebot kann nicht geöffnet werden"><Alert kind="error">{open.message}</Alert></Page>;
  if (open.status === "other-type") return <Navigate to={`/deal/${dealId}/${open.type}`} replace />;
  if (!isStepOf(type, step)) return <Navigate to={`${base}/${firstStep(type)}`} replace />;

  const temp = dealId.startsWith("t-");
  const steps = STEPS[type];
  const at = steps.indexOf(step);
  const prev = steps[at - 1], next = steps[at + 1];
  const title = `${OFFER_TITLES[type]}${temp ? " · noch ohne Auftragsnummer" : ` · Auftrag ${dealId}`}`;
  return (
    // Wide screens (iPad landscape, desktop): the step list is a sidebar that stays in view.
    // Narrower (iPad portrait, 834 px): the sidebar is CLOSED so the form has the full width; a
    // slim bar under the header names the step, shows the total and opens the list on demand.
    <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 lg:grid-cols-[minmax(240px,300px)_1fr] lg:gap-6 lg:pt-6">
      <nav
        aria-label="Schritte"
        className={cn(
          "sticky top-14 z-30 -mx-4 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-border bg-background px-4 py-2",
          "[grid-template-areas:'toggle_total''title_title''steps_steps''home_home']",
          "lg:top-20 lg:z-auto lg:mx-0 lg:max-h-[calc(100dvh-6rem)] lg:grid-cols-1 lg:content-start lg:gap-4 lg:self-start lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0 lg:pr-1",
          "lg:[grid-template-areas:'title''steps''total''home']",
        )}
      >
        <p className={cn(stepsOpen ? "block" : "hidden", "m-0 font-bold [grid-area:title] lg:block")}>{title}</p>
        <button
          type="button" aria-expanded={stepsOpen} aria-controls="offer-steps" onClick={() => setStepsOpen((o) => !o)}
          className="flex min-h-12 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border-2 border-input bg-card px-4 text-left font-semibold text-foreground [grid-area:toggle] lg:hidden"
        >
          <span className="truncate"><span className="font-normal text-muted-foreground">{`Schritt ${at + 1} von ${steps.length} · `}</span>{stepLabel(step)}</span>
          <ChevronDown aria-hidden className={cn("size-5 shrink-0 transition-transform", stepsOpen && "rotate-180")} />
        </button>
        <div className="[grid-area:total]"><Total /></div>
        <div id="offer-steps" className={cn(stepsOpen ? "block" : "hidden", "max-h-[60dvh] overflow-y-auto [grid-area:steps] lg:block lg:max-h-none lg:overflow-visible")}>
          <StepList type={type} base={base} current={step} />
        </div>
        {/* save first, then leave; the Hauptmenü empties the store when it opens (one assignment) */}
        {/* the wrapper carries the show/hide: the button's own display class must not be overridden (see cn) */}
        <div className={cn(stepsOpen ? "grid" : "hidden", "[grid-area:home] lg:grid")}>
          <Button variant="secondary" onClick={() => { void flushDraft().then(() => navigate("/")); }}>Zum Hauptmenü</Button>
        </div>
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
