// The frame of an offer: step list, total, saving state, and the active step (an <Outlet>, so
// only the active step is mounted). The address decides which offer is open.
import { isDraftKey } from "@oc/api-contract";
import { isNewOfferType, type NewOfferType } from "@oc/domain";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { euro } from "../../shared/lib/format.js";
import { Button, Notice, Page } from "../../shared/ui/index.js";
import { flushDraft, legacyAddress, newTempKey, openInLegacy, useAutosave, useOpenOffer, type SaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";
import { usePrice } from "./model/usePrice.js";
import { OFFER_TITLES, STEPS, firstStep, isStepOf, stepLabel } from "./steps.js";

function Total() {
  const { total, pending, error } = usePrice();
  if (error) return <Notice kind="error">Der Preis kann gerade nicht berechnet werden.</Notice>;
  return (
    <p className="total" aria-live="polite">
      <span className="total-label">Gesamt</span> <strong>{euro(total)}</strong>
      {pending ? <span className="total-pending"> wird berechnet …</span> : null}
    </p>
  );
}

const hhmm = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
function SaveState({ status }: { status: SaveStatus }) {
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  if (status.state === "conflict") return <Notice kind="error">Dieses Angebot wurde an anderer Stelle geändert. Bitte laden Sie die Seite neu, bevor Sie weiterarbeiten.</Notice>;
  if (status.state === "failed") return <Notice kind="error">Nicht gespeichert: {status.message}</Notice>;
  const text = status.state === "saving" ? "Speichert …" : dirty ? "Änderungen werden gleich gespeichert" : status.state === "saved" ? `Automatisch gespeichert · ${hhmm(status.at)}` : "";
  return <p className="save-state" role="status">{text}</p>;
}

/** A step that has no React screen yet: continue with the same offer and step in today's UI. */
export function StepInLegacy() {
  const { dealId = "", step = "" } = useParams();
  return (
    <section className="card">
      <h2>{stepLabel(step)}</h2>
      <p>Dieser Schritt wird noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
      <LegacyLink dealId={dealId} step={step}>In der bisherigen Ansicht öffnen</LegacyLink>
    </section>
  );
}

/** Link to today's UI for this offer; unsaved changes are saved first so nothing is lost on the way. */
export function LegacyLink({ dealId, step, children }: { dealId: string; step: string; children: string }) {
  const type = useOfferStore((s) => s.offer?.activeOffer as NewOfferType | undefined);
  return (
    <a
      className="button-secondary" href={legacyAddress(dealId, step)}
      onClick={(e) => { e.preventDefault(); if (type) void openInLegacy(dealId, type, step); }}
    >
      {children}
    </a>
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
  const save = useAutosave();
  const step = useLocation().pathname.split("/")[4]; // /deal/<id>/<type>/<step>
  const base = `/deal/${dealId}/${type}`;

  if (open.status === "loading") return <Page title="Einen Moment …" lead="Das Angebot wird geöffnet." />;
  if (open.status === "error") return <Page title="Das Angebot kann nicht geöffnet werden"><Notice kind="error">{open.message}</Notice></Page>;
  if (open.status === "other-type") return <Navigate to={`/deal/${dealId}/${open.type}`} replace />;
  if (!isStepOf(type, step)) return <Navigate to={`${base}/${firstStep(type)}`} replace />;

  const temp = dealId.startsWith("t-");
  return (
    <div className="offer">
      <nav className="offer-steps" aria-label="Schritte">
        <p className="offer-title">{OFFER_TITLES[type]}{temp ? " · noch ohne Auftragsnummer" : ` · Auftrag ${dealId}`}</p>
        <ol>
          {STEPS[type].map((s) => (
            <li key={s}><NavLink to={`${base}/${s}`}>{stepLabel(s)}</NavLink></li>
          ))}
        </ol>
        <Total />
        <SaveState status={save} />
        {/* save first, then leave; the Hauptmenü empties the store when it opens (one assignment) */}
        <Button variant="secondary" onClick={() => { void flushDraft().then(() => navigate("/")); }}>Zum Hauptmenü</Button>
      </nav>
      <main className="offer-step">
        <Outlet />
      </main>
    </div>
  );
}
