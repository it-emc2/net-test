// Kundendaten (ADR 026, phase 4). Rebuilt so far: contact, address, customer type and the
// contact person. The stored fields are exactly today's (test/kundendaten.test.tsx compares with
// what today's UI stores for the same inputs). The other sections of this step — payer, care
// level and budget, markup, property details, notes — are still edited in today's UI.
import { useParams } from "react-router";
import { LegacyLink, useOfferField } from "../../offer/index.js";
import { OfferChoice, OfferText } from "../fields.js";

const KD = "Kundendaten";

function Contact() {
  return (
    <section className="card" aria-labelledby="kd-contact">
      <h2 id="kd-contact">Kontaktdaten des Kunden</h2>
      <OfferChoice section={KD} name="salutation" label="Anrede" options={["Frau", "Herr", "Familie"]} required />
      <div className="grid-2">
        <OfferText section={KD} name="firstName" label="Vorname" required autoComplete="off" />
        <OfferText section={KD} name="lastName" label="Nachname" required autoComplete="off" />
      </div>
      <OfferText section={KD} name="date" label="Datum" type="date" required />
      <div className="grid-2">
        <OfferText section={KD} name="phone" label="Telefonnummer" type="tel" placeholder="+49 ..." autoComplete="off" />
        <OfferText section={KD} name="email" label="E-Mail" type="email" placeholder="name@example.com" autoComplete="off" />
      </div>
      <OfferText section={KD} name="emailCc" label="E-Mail (CC)" type="email" multiple placeholder="cc@example.com" autoComplete="off" />
    </section>
  );
}

function Address() {
  return (
    <section className="card" aria-labelledby="kd-address">
      <h2 id="kd-address">Adressdaten des Kunden</h2>
      <OfferText section={KD} name="street" label="Adresse" placeholder="Straße und Hausnummer" autoComplete="off" />
      <div className="grid-2">
        <OfferText section={KD} name="postalCode" label="PLZ / Postleitzahl" inputMode="numeric" autoComplete="off" />
        <OfferText section={KD} name="city" label="Stadt" autoComplete="off" />
      </div>
      <OfferText section={KD} name="state" label="Bundesland / Provinz" autoComplete="off" />
      <OfferText section={KD} name="deployment" label="Abweichender Einsatzort" autoComplete="off" />
      <OfferChoice section={KD} name="customerType" label="Neukunde oder Bestandskunde?" options={["Neu", "Bestandskunde"]} required />
    </section>
  );
}

function ContactPerson() {
  const has = useOfferField<string>(KD, "hasContactPerson") === "Ja";
  return (
    <section className="card" aria-labelledby="kd-cp">
      <h2 id="kd-cp">Ansprechpartner</h2>
      <OfferChoice
        section={KD} name="hasContactPerson" label="Ansprechpartner vorhanden?" options={["Ja", "Nein"]} required
        // as today: switching back to "Nein" empties the name; the other entries are kept
        onChoose={(v) => (v === "Nein" ? { cp_name: "" } : {})}
      />
      {has ? (
        <>
          <OfferChoice section={KD} name="cp_salutation" label="Anrede des Ansprechpartners" options={["Frau", "Herr"]} />
          <div className="grid-2">
            <OfferText section={KD} name="cp_name" label="Abweichender Ansprechpartner" placeholder="Name des Ansprechpartners" autoComplete="off" />
            <OfferText section={KD} name="cp_phone" label="Telefonnummer des Ansprechpartners" type="tel" placeholder="+49 ..." autoComplete="off" />
          </div>
          <OfferText section={KD} name="cp_email" label="E-Mail des Ansprechpartners (CC)" type="email" placeholder="name@example.com" autoComplete="off" />
          <OfferText section={KD} name="cp_street" label="Adresse des Ansprechpartners" placeholder="Straße und Hausnummer" autoComplete="off" />
          <div className="grid-2">
            <OfferText section={KD} name="cp_postalCode" label="PLZ des Ansprechpartners" inputMode="numeric" autoComplete="off" />
            <OfferText section={KD} name="cp_city" label="Stadt des Ansprechpartners" autoComplete="off" />
          </div>
          <OfferText section={KD} name="cp_state" label="Bundesland des Ansprechpartners" autoComplete="off" />
        </>
      ) : null}
    </section>
  );
}

export function Kundendaten() {
  const { dealId = "" } = useParams();
  return (
    <>
      <Contact />
      <Address />
      <ContactPerson />
      <section className="card" aria-labelledby="kd-more">
        <h2 id="kd-more">Weitere Angaben</h2>
        <p>Kostenträger, Pflegegrad und Budget, Aufschlag, Angaben zum Objekt und Notizen werden noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
        <LegacyLink dealId={dealId} step="Kundendaten">Weitere Angaben in der bisherigen Ansicht</LegacyLink>
      </section>
    </>
  );
}
