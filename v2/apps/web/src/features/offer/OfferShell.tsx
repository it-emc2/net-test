// The frame of an offer: step list, total, and the active step. Only the active step is
// mounted. A step that has no React screen yet shows a link to the same step in today's UI.
import { isNewOfferType, type NewOfferType } from "@oc/domain";
import { useEffect } from "react";
import { NavLink, Navigate, useNavigate, useParams } from "react-router";
import { euro, todayIso } from "../../shared/lib/format.js";
import { Button, Notice } from "../../shared/ui/index.js";
import { useOfferStore, useOfferType } from "./model/store.js";
import { usePrice } from "./model/usePrice.js";
import { BUILT_STEPS, OFFER_TITLES, STEPS, firstStep, isStepOf, stepLabel } from "./steps.js";

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

function StepNotBuilt({ step, dealId }: { step: string; dealId: string | null }) {
  // today's UI runs at "/" and understands ?deal=<id>#<step> (ADR 006)
  const legacy = dealId ? `/?deal=${encodeURIComponent(dealId)}#${step}` : `/#${step}`;
  return (
    <section className="card">
      <h2>{stepLabel(step)}</h2>
      <p>Dieser Schritt wird noch in der bisherigen Ansicht bearbeitet.</p>
      <a className="button-secondary" href={legacy}>In der bisherigen Ansicht öffnen</a>
    </section>
  );
}

export function OfferShell() {
  const { type: typeParam, dealId = null, step } = useParams();
  const navigate = useNavigate();
  const type = useOfferType();
  const storeDeal = useOfferStore((s) => s.dealId);
  const start = useOfferStore((s) => s.start);
  const wanted: NewOfferType | null = isNewOfferType(typeParam) ? typeParam : null;

  // the address decides which offer is open: /neu/<type>/… or /deal/<id>/<type>/…
  useEffect(() => {
    if (wanted && (type !== wanted || storeDeal !== dealId)) start(wanted, { date: todayIso() }, dealId);
  }, [wanted, type, storeDeal, dealId, start]);

  if (!wanted) return <Navigate to="/" replace />;
  if (type !== wanted) return null; // the store is being set up
  const base = dealId ? `/deal/${dealId}/${wanted}` : `/neu/${wanted}`;
  if (!isStepOf(wanted, step)) return <Navigate to={`${base}/${firstStep(wanted)}`} replace />;

  return (
    <div className="offer">
      <nav className="offer-steps" aria-label="Schritte">
        <p className="offer-title">{OFFER_TITLES[wanted]}{dealId ? ` · Auftrag ${dealId}` : ""}</p>
        <ol>
          {STEPS[wanted].map((s) => (
            <li key={s}><NavLink to={`${base}/${s}`}>{stepLabel(s)}</NavLink></li>
          ))}
        </ol>
        <Total />
        {/* the Hauptmenü empties the store when it opens — one assignment, see HomePage */}
        <Button variant="secondary" onClick={() => navigate("/")}>Zum Hauptmenü</Button>
      </nav>
      <main className="offer-step">
        {BUILT_STEPS.has(step) ? null : <StepNotBuilt step={step} dealId={dealId} />}
      </main>
    </div>
  );
}
