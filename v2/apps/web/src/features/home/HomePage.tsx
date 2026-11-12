// Hauptmenü. Opening it ends the offer in progress: one assignment in the store, nothing else.
import { NEW_OFFER_TYPES } from "@oc/domain";
import { useEffect, useState } from "react";
import { OFFER_TITLES, useOfferStore } from "../offer/index.js";
import { Card, Field, Page, Tile } from "../../shared/ui/index.js";

export function HomePage() {
  const close = useOfferStore((s) => s.close);
  useEffect(() => { close(); }, [close]);
  const [deal, setDeal] = useState("");
  const dealId = deal.trim();
  const valid = /^\d{1,12}$/.test(dealId);
  const base = valid ? `/deal/${dealId}` : "/neu";

  return (
    <Page title="Hauptmenü" lead="Wählen Sie eine Angebotsart. Mit einer Auftragsnummer wird das Angebot dem Auftrag zugeordnet.">
      <Card>
        <Field
          label="Auftragsnummer (optional)" id="home-deal" inputMode="numeric" autoComplete="off" value={deal}
          onChange={(e) => setDeal(e.target.value)} aria-invalid={dealId !== "" && !valid}
          {...(dealId && !valid ? { hint: "Die Auftragsnummer besteht nur aus Ziffern." } : {})}
        />
      </Card>
      <h2>Angebotsarten</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {NEW_OFFER_TYPES.map((t) => (
          <Tile key={t} to={`${base}/${t}`} title={OFFER_TITLES[t]} text={t.toUpperCase()} />
        ))}
      </div>
      {/* a plain link: today's UI is a different page at "/" */}
      <p className="text-[0.95rem] text-muted-foreground"><a className="text-primary underline" href="/">Zur bisherigen Ansicht</a></p>
    </Page>
  );
}
