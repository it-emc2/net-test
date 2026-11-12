// Kundendaten (ADR 026, phase 4). Rebuilt so far: contact, address, customer type, the contact
// person, and the payer with the insurance details. The stored fields are exactly today's (test/kundendaten.test.tsx compares with
// what today's UI stores for the same inputs). The other sections of this step — care level and
// budget, markup, property details, notes — are still edited in today's UI.
import { useParams } from "react-router";
import { LegacyLink, useOfferField, useOfferStore, useOfferType } from "../../offer/index.js";
import { Card, CardTitle } from "../../../shared/ui/index.js";
import { OfferChoice, OfferText } from "../fields.js";
import { chooseInvoiceCopy, choosePayer, type Parked } from "./payer.js";

const KD = "Kundendaten";

function Contact() {
  return (
    <Card aria-labelledby="kd-contact">
      <CardTitle id="kd-contact">Kontaktdaten des Kunden</CardTitle>
      <OfferChoice section={KD} name="salutation" label="Anrede" options={["Frau", "Herr", "Familie"]} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="firstName" label="Vorname" required autoComplete="off" />
        <OfferText section={KD} name="lastName" label="Nachname" required autoComplete="off" />
      </div>
      <OfferText section={KD} name="date" label="Datum" type="date" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="phone" label="Telefonnummer" type="tel" placeholder="+49 ..." autoComplete="off" />
        <OfferText section={KD} name="email" label="E-Mail" type="email" placeholder="name@example.com" autoComplete="off" />
      </div>
      <OfferText section={KD} name="emailCc" label="E-Mail (CC)" type="email" multiple placeholder="cc@example.com" autoComplete="off" />
    </Card>
  );
}

function Address() {
  return (
    <Card aria-labelledby="kd-address">
      <CardTitle id="kd-address">Adressdaten des Kunden</CardTitle>
      <OfferText section={KD} name="street" label="Adresse" placeholder="Straße und Hausnummer" autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="postalCode" label="PLZ / Postleitzahl" inputMode="numeric" autoComplete="off" />
        <OfferText section={KD} name="city" label="Stadt" autoComplete="off" />
      </div>
      <OfferText section={KD} name="state" label="Bundesland / Provinz" autoComplete="off" />
      <OfferText section={KD} name="deployment" label="Abweichender Einsatzort" autoComplete="off" />
      <OfferChoice section={KD} name="customerType" label="Neukunde oder Bestandskunde?" options={["Neu", "Bestandskunde"]} required />
    </Card>
  );
}

function ContactPerson() {
  const has = useOfferField<string>(KD, "hasContactPerson") === "Ja";
  return (
    <Card aria-labelledby="kd-cp">
      <CardTitle id="kd-cp">Ansprechpartner</CardTitle>
      <OfferChoice
        section={KD} name="hasContactPerson" label="Ansprechpartner vorhanden?" options={["Ja", "Nein"]} required
        // as today: switching back to "Nein" empties the name; the other entries are kept
        onChoose={(v) => useOfferStore.getState().patch(KD as never, (v === "Nein" ? { hasContactPerson: v, cp_name: "" } : { hasContactPerson: v }) as never)}
      />
      {has ? (
        <>
          <OfferChoice section={KD} name="cp_salutation" label="Anrede des Ansprechpartners" options={["Frau", "Herr"]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <OfferText section={KD} name="cp_name" label="Abweichender Ansprechpartner" placeholder="Name des Ansprechpartners" autoComplete="off" />
            <OfferText section={KD} name="cp_phone" label="Telefonnummer des Ansprechpartners" type="tel" placeholder="+49 ..." autoComplete="off" />
          </div>
          <OfferText section={KD} name="cp_email" label="E-Mail des Ansprechpartners (CC)" type="email" placeholder="name@example.com" autoComplete="off" />
          <OfferText section={KD} name="cp_street" label="Adresse des Ansprechpartners" placeholder="Straße und Hausnummer" autoComplete="off" />
          <div className="grid gap-3 sm:grid-cols-2">
            <OfferText section={KD} name="cp_postalCode" label="PLZ des Ansprechpartners" inputMode="numeric" autoComplete="off" />
            <OfferText section={KD} name="cp_city" label="Stadt des Ansprechpartners" autoComplete="off" />
          </div>
          <OfferText section={KD} name="cp_state" label="Bundesland des Ansprechpartners" autoComplete="off" />
        </>
      ) : null}
    </Card>
  );
}

function Payer() {
  const type = useOfferType();
  const payer = useOfferField<string>(KD, "payer");
  const copy = useOfferField<string>(KD, "kk_rechnungskopie");
  const pickPayer = (v: string) => {
    const st = useOfferStore.getState();
    if (!st.offer) return;
    const r = choosePayer(st.offer, v as "Selbstzahler" | "Kassenkunde", (st.scratch.payerParked as Parked | undefined) ?? null);
    st.patchAll(r.changes);
    st.remember("payerParked", r.parked);
  };
  const pickCopy = (v: string) => {
    const st = useOfferStore.getState();
    const kd = (st.offer as Record<string, any> | null)?.Kundendaten ?? {};
    if (kd.kk_rechnungskopie_art) st.remember("invoiceCopyKind", kd.kk_rechnungskopie_art);
    st.patch(KD as never, chooseInvoiceCopy(v as "ja" | "nein", kd.kk_rechnungskopie_art ?? st.scratch.invoiceCopyKind) as never);
  };
  return (
    <Card aria-labelledby="kd-payer">
      <CardTitle id="kd-payer">Kostenträger</CardTitle>
      <OfferChoice section={KD} name="payer" label="Ist der Kunde Selbstzahler oder Kassenkunde?" options={["Selbstzahler", "Kassenkunde"]} onChoose={pickPayer} />
      {payer === "Kassenkunde" ? (
        <>
          {/* birth date and insurance number are not asked for a Badumbau (as today) */}
          {type !== "bu" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <OfferText section={KD} name="kk_geburtsdatum" label="Geburtsdatum" type="date" />
              <OfferText section={KD} name="kk_versichertennr" label="Versicherungsnummer" placeholder="z. B. A123456789" autoComplete="off" />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <OfferText section={KD} name="kassenkundeName" label="Name der Krankenkasse" placeholder="z. B. AOK Nord" autoComplete="off" />
            <OfferText section={KD} name="kk_krankenkasseAdresse" label="Adresse der Krankenkasse" placeholder="Straße, PLZ Ort" autoComplete="off" />
          </div>
          <OfferText section={KD} name="kk_pflegegradSeit" label="Pflegegrad seit" type="month" />
          <OfferChoice section={KD} name="kk_rechnungskopie" label="Kassen-Rechnungskopie gewünscht?" options={[{ value: "ja", label: "Ja" }, { value: "nein", label: "Nein" }]} onChoose={pickCopy} />
          {copy === "ja" ? (
            <OfferChoice section={KD} name="kk_rechnungskopie_art" label="Rechnungskopie per Post oder per E-Mail?" options={[{ value: "post", label: "Per Post" }, { value: "email", label: "Per E-Mail" }]} />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export function Kundendaten() {
  const { dealId = "" } = useParams();
  return (
    <>
      <Contact />
      <Address />
      <ContactPerson />
      <Payer />
      <Card aria-labelledby="kd-more">
        <CardTitle id="kd-more">Weitere Angaben</CardTitle>
        <p className="m-0">Pflegegrad und Budget, Aufschlag, Angaben zum Objekt und Notizen werden noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
        <LegacyLink dealId={dealId} step="Kundendaten">Weitere Angaben in der bisherigen Ansicht</LegacyLink>
      </Card>
    </>
  );
}
