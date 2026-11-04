// Route table. URLs are the primary navigation (owner requirement, ADR 006):
//   /                         start page
//   /deal/:dealId             open the deal's offer directly (deep link from Bitrix)
//   /deal/:dealId/:step       a wizard step of that deal — reload/bookmark keeps the place
//   /offer/:offerNumber       read-only view of a sent offer (legacy: /?offer=ANG…)
// Legacy deep link /?offer=<ANG> keeps working via redirect.
import { Link, Navigate, useParams, useSearchParams, type RouteObject } from "react-router";

function Home() {
  const [params] = useSearchParams();
  const legacyOffer = params.get("offer");
  if (legacyOffer) return <Navigate to={`/offer/${encodeURIComponent(legacyOffer)}`} replace />;
  return (
    <main className="page">
      <h1>Angebotskonfigurator</h1>
      <p className="lead">Neue Version im Aufbau. Öffnen Sie einen Auftrag über seine Deal-Nummer.</p>
      <OpenDealForm />
    </main>
  );
}

function OpenDealForm() {
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        const id = new FormData(e.currentTarget).get("dealId");
        if (typeof id === "string" && /^\d+$/.test(id.trim())) window.location.assign(`/deal/${id.trim()}`);
      }}
    >
      <label htmlFor="dealId">Deal-Nummer</label>
      <input id="dealId" name="dealId" inputMode="numeric" pattern="\d+" required autoComplete="off" />
      <button type="submit">Auftrag öffnen</button>
    </form>
  );
}

function Deal() {
  const { dealId = "", step } = useParams();
  if (!/^\d+$/.test(dealId)) return <NotFound what={`Deal „${dealId}“`} />;
  return (
    <main className="page">
      <h1>Auftrag {dealId}</h1>
      <p className="lead">{step ? `Schritt: ${step}` : "Übersicht"}</p>
      <p>Hier entsteht der Angebots-Assistent dieses Auftrags (ein Entwurf pro Auftrag, mit Verlauf).</p>
      <Link className="button-secondary" to="/">Zur Startseite</Link>
    </main>
  );
}

function Offer() {
  const { offerNumber = "" } = useParams();
  return (
    <main className="page">
      <h1>Angebot {offerNumber}</h1>
      <p className="lead">Versendetes Angebot – nur ansehen.</p>
      <Link className="button-secondary" to="/">Zur Startseite</Link>
    </main>
  );
}

function NotFound({ what = "Diese Seite" }: { what?: string }) {
  return (
    <main className="page">
      <h1>Nicht gefunden</h1>
      <p className="lead">{what} gibt es nicht.</p>
      <Link className="button-secondary" to="/">Zur Startseite</Link>
    </main>
  );
}

export const routes: RouteObject[] = [
  { path: "/", element: <Home /> },
  { path: "/deal/:dealId", element: <Deal /> },
  { path: "/deal/:dealId/:step", element: <Deal /> },
  { path: "/offer/:offerNumber", element: <Offer /> },
  { path: "*", element: <NotFound /> },
];
