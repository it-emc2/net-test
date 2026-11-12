// The frame of an offer: step list, total, saving state, and the active step (an <Outlet>, so
// only the active step is mounted). The address decides which offer is open.
import { isDraftKey } from "@oc/api-contract";
import { isNewOfferType, type NewOfferType } from "@oc/domain";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { euro } from "../../shared/lib/format.js";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { applyOfferTheme } from "../../shared/lib/theme.js";
import { Alert, Button, Card, CardTitle, Page, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { flushDraft, legacyAddress, newTempKey, openInLegacy, useAutosave, useOpenOffer, type SaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";
import { usePrice } from "./model/usePrice.js";
import { OFFER_TITLES, STEPS, firstStep, groupStartingAt, isStepOf, stepLabel } from "./steps.js";

function Total() {
  const { total, pending, error } = usePrice();
  if (error) return <Alert kind="error">Der Preis kann gerade nicht berechnet werden.</Alert>;
  return (
    <p className="m-0 text-lg" aria-live="polite">
      <span>Gesamt</span> <strong>{euro(total)}</strong>
      {pending ? <span className="text-[0.95rem] text-muted-foreground"> wird berechnet …</span> : null}
    </p>
  );
}

const hhmm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
function SaveState({ status }: { status: SaveStatus }) {
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  // a failed save is also shown as a toast — it must not be overlooked while typing further down
  useEffect(() => {
    if (status.state === "conflict") toast.error("Dieses Angebot wurde an anderer Stelle geändert. Bitte laden Sie die Seite neu.", { duration: Infinity, id: "save" });
    else if (status.state === "failed") toast.error(`Nicht gespeichert: ${status.message}`, { duration: Infinity, id: "save" });
    else if (status.state === "saved") toast.dismiss("save");
  }, [status]);
  if (status.state === "conflict") return <Alert kind="error">Dieses Angebot wurde an anderer Stelle geändert. Bitte laden Sie die Seite neu, bevor Sie weiterarbeiten.</Alert>;
  if (status.state === "failed") return <Alert kind="error">Nicht gespeichert: {status.message}</Alert>;
  const text = status.state === "saving" ? "Speichert …" : dirty ? "Änderungen werden gleich gespeichert" : status.state === "saved" ? `Automatisch gespeichert · ${hhmm(status.at)}` : "";
  return <p className="m-0 min-h-6 text-[0.95rem] text-muted-foreground" role="status">{text}</p>;
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

export function OfferShell() {
  const { dealId = "", type: typeParam } = useParams();
  if (!isNewOfferType(typeParam) || !isDraftKey(dealId)) return <Navigate to="/" replace />;
  return <OpenOffer dealId={dealId} type={typeParam} />;
}

function OpenOffer({ dealId, type }: { dealId: string; type: NewOfferType }) {
  const navigate = useNavigate();
  const open = useOpenOffer(dealId, type);
  useEffect(() => { applyOfferTheme(type); return () => applyOfferTheme(null); }, [type]); // the offer's accent colour, as today
  const save = useAutosave();
  const step = useLocation().pathname.split("/")[4]; // /deal/<id>/<type>/<step>
  const base = `/deal/${dealId}/${type}`;

  if (open.status === "loading") return <Page title="Einen Moment …" lead="Das Angebot wird geöffnet." />;
  if (open.status === "error") return <Page title="Das Angebot kann nicht geöffnet werden"><Alert kind="error">{open.message}</Alert></Page>;
  if (open.status === "other-type") return <Navigate to={`/deal/${dealId}/${open.type}`} replace />;
  if (!isStepOf(type, step)) return <Navigate to={`${base}/${firstStep(type)}`} replace />;

  const temp = dealId.startsWith("t-");
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-6 md:grid-cols-[minmax(240px,300px)_1fr]">
      <nav className="grid content-start gap-4" aria-label="Schritte">
        <p className="m-0 font-bold">{OFFER_TITLES[type]}{temp ? " · noch ohne Auftragsnummer" : ` · Auftrag ${dealId}`}</p>
        <StepList type={type} base={base} current={step} />
        <Total />
        <SaveState status={save} />
        {/* save first, then leave; the Hauptmenü empties the store when it opens (one assignment) */}
        <Button variant="secondary" onClick={() => { void flushDraft().then(() => navigate("/")); }}>Zum Hauptmenü</Button>
      </nav>
      <main className="grid content-start gap-4">
        <Outlet />
      </main>
    </div>
  );
}
