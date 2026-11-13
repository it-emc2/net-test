// Aufschlag / Rabatt (ADR 026, phase 4). Rebuilt so far: the markup. The discount part (Rabatt,
// Neukundenbonus, Haltegriff) is still edited in today's UI.
import { useParams } from "react-router";
import { Card, CardTitle } from "../../../shared/ui/index.js";
import { LegacyLink } from "../../offer/index.js";
import { Markup } from "../markup/Markup.js";

export function Rabatt() {
  const { dealId = "" } = useParams();
  return (
    <>
      <Markup />
      <Card aria-labelledby="rabatt-more">
        <CardTitle id="rabatt-more">Rabatt</CardTitle>
        <p className="m-0">Rabatt und Bonus werden noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
        <LegacyLink dealId={dealId} step="Rabatt">Rabatt in der bisherigen Ansicht</LegacyLink>
      </Card>
    </>
  );
}
