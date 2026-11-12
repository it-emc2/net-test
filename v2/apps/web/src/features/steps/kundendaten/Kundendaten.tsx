// Kundendaten (ADR 026, phase 4). Rebuilt so far: contact, address, customer type, the contact
// person, the payer with the insurance details, and care level with the budget options. The stored fields are exactly today's (test/kundendaten.test.tsx compares with
// what today's UI stores for the same inputs). The other sections of this step — markup, second
// person, Wohnumfeld, property details, notes — are still edited in today's UI.
import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { LegacyLink, useOfferField, useOfferStore, useOfferType } from "../../offer/index.js";
import { Card, CardTitle, Check, Field, SelectField, TextAreaField } from "../../../shared/ui/index.js";
import { OfferChoice, OfferText } from "../fields.js";
import { MAIN_OPTIONS, PARTNER_ENTRIES, budgetReadout, chooseHasCareLevel, followNames, parseEuro, toggleCopay, toggleMainOption, type MainOption } from "./care.js";
import { Markup } from "../markup/Markup.js";
import { markupChanges, markupTextSection } from "../markup/rules.js";
import { chooseApplication, chooseLivingSituation } from "./object.js";
import { chooseInvoiceCopy, choosePayer, type Parked } from "./payer.js";

const KD = "Kundendaten";

// What the customer data fills in elsewhere in the offer (as today's UI does; recorded in
// kundendaten-contact.json):
//  - the mail's recipient follows the e-mail address, unless it was changed by hand
//  - the letter's recipient takes name and address when the field is left — but only while the
//    letter's own field is still empty; a later correction is not carried over (as today)
const LETTER_FIELD: Record<string, string> = { firstName: "firstName", lastName: "lastName", street: "street", postalCode: "zipCode", city: "city" };
function toLetter(field: string) {
  return (value: string) => {
    const st = useOfferStore.getState();
    const recipient = ((st.offer as Record<string, any> | null)?.postal?.recipient ?? {}) as Record<string, unknown>;
    const target = LETTER_FIELD[field]!;
    const v = value.trim();
    if (!v || String(recipient[target] ?? "").trim()) return;
    st.patchAll({ postal: { recipient: { ...recipient, [target]: v } } });
  };
}
function setEmail(value: string) {
  const st = useOfferStore.getState();
  const o = st.offer as Record<string, any> | null;
  const followed = !o?.mail?.to || o.mail.to === String(o.Kundendaten?.email ?? "").trim();
  st.patchAll(followed ? { Kundendaten: { email: value }, mail: { to: value.trim() } } : { Kundendaten: { email: value } });
}

function Contact() {
  return (
    <Card aria-labelledby="kd-contact">
      <CardTitle id="kd-contact">Kontaktdaten des Kunden</CardTitle>
      <OfferChoice section={KD} name="salutation" label="Anrede" options={["Frau", "Herr", "Familie"]} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="firstName" label="Vorname" required autoComplete="off" onCommit={toLetter("firstName")} />
        <OfferText section={KD} name="lastName" label="Nachname" required autoComplete="off" onCommit={toLetter("lastName")} />
      </div>
      <OfferText section={KD} name="date" label="Datum" type="date" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="phone" label="Telefonnummer" type="tel" placeholder="+49 ..." autoComplete="off" />
        <OfferText section={KD} name="email" label="E-Mail" type="email" placeholder="name@example.com" autoComplete="off" onValue={setEmail} />
      </div>
      <OfferText section={KD} name="emailCc" label="E-Mail (CC)" type="email" multiple placeholder="cc@example.com" autoComplete="off" />
    </Card>
  );
}

function Address() {
  return (
    <Card aria-labelledby="kd-address">
      <CardTitle id="kd-address">Adressdaten des Kunden</CardTitle>
      <OfferText section={KD} name="street" label="Adresse" placeholder="Straße und Hausnummer" autoComplete="off" onCommit={toLetter("street")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="postalCode" label="PLZ / Postleitzahl" inputMode="numeric" autoComplete="off" onCommit={toLetter("postalCode")} />
        <OfferText section={KD} name="city" label="Stadt" autoComplete="off" onCommit={toLetter("city")} />
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
    // the markup depends on the payer: another minimum (the reason is stored only under it), and
    // an empty markup becomes 50 % once the payer is chosen (as today)
    const o = st.offer as Record<string, any>;
    const section = markupTextSection(o.activeOffer);
    const m: Record<string, Record<string, unknown>> = section
      ? markupChanges(o.activeOffer, String(o[section]?.sonderaufschlagValue ?? "").trim() ? String(o[section].sonderaufschlagValue) : "50", v, st.scratch.markupReason ?? o.Kundendaten?.aufschlagBegruendung)
      : {};
    if (o.Kundendaten?.aufschlagBegruendung && st.scratch.markupReason === undefined) st.remember("markupReason", o.Kundendaten.aufschlagBegruendung);
    const merged: Record<string, Record<string, unknown>> = { ...r.changes };
    for (const [sec, fields] of Object.entries(m)) merged[sec] = { ...(merged[sec] ?? {}), ...fields };
    st.patchAll(merged);
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

const kdNow = (): Record<string, unknown> => (useOfferStore.getState().offer as Record<string, any> | null)?.Kundendaten ?? {};
const setKd = (fields: Record<string, unknown>) => useOfferStore.getState().patch(KD as never, fields as never);

function CareLevel() {
  const type = useOfferType();
  const payer = useOfferField<string>(KD, "payer");
  const has = useOfferField<string>(KD, "hasPflegegrad");
  const level = useOfferField<string>(KD, "pflegegrad");
  const budgetMax = !!useOfferField(KD, "budgetMax");
  const twoPersons = !!useOfferField(KD, "twoPersons");
  const premium = !!useOfferField(KD, "premium");
  const copay = !!useOfferField(KD, "budgetCopay");
  const copayAmount = useOfferField<number>(KD, "copayAmount") ?? 0;
  if (payer !== "Kassenkunde") return null; // not asked for a Selbstzahler (as today)
  const ticked = { budgetMax, twoPersons, premium };
  const pickMain = (m: MainOption, on: boolean) => {
    const st = useOfferStore.getState();
    const kd = kdNow();
    if (m === "twoPersons" && !on) st.remember("partner", Object.fromEntries(PARTNER_ENTRIES.filter((f) => f in kd && kd[f] !== "").map((f) => [f, kd[f]])));
    setKd(toggleMainOption(kd, m, on, m === "twoPersons" && on ? ((st.scratch.partner as Record<string, unknown> | undefined) ?? {}) : {}));
  };
  const anyMain = budgetMax || twoPersons || premium;
  // "beantragt" is offered for Badumbau and Alltagshilfe only; the budget options not for Alltagshilfe
  const levels = ["1", "2", "3", "4", "5", ...(type === "bu" || type === "ah" ? ["beantragt"] : [])];
  const showBudget = has === "Ja" && !!level && type !== "ah";
  // Alltagshilfe has no Wohnumfeld part: as today, answering here drops its stored default
  const notForAh = type === "ah" ? { wohnumfeldDone: undefined } : {};
  return (
    <Card aria-labelledby="kd-care">
      <CardTitle id="kd-care">Pflegegrad und Budget</CardTitle>
      <OfferChoice section={KD} name="hasPflegegrad" label="Kunde hat Pflegegrad?" options={["Ja", "Nein"]} required onChoose={(v) => setKd({ ...chooseHasCareLevel(kdNow(), v as "Ja" | "Nein"), ...notForAh })} />
      {has === "Ja" ? <OfferChoice section={KD} name="pflegegrad" label="Welchen Pflegegrad?" options={levels} required onChoose={(v) => setKd({ pflegegrad: v, ...notForAh })} /> : null}
      {showBudget ? (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 font-semibold">Budget</legend>
          {(Object.keys(MAIN_OPTIONS) as MainOption[]).map((m) => (
            <Check key={m} id={`kd-${m}`} checked={ticked[m]} onChange={(on) => pickMain(m, on)}>{MAIN_OPTIONS[m].label}</Check>
          ))}
          <Check id="kd-budgetCopay" checked={copay} disabled={!anyMain} onChange={(on) => setKd(toggleCopay(kdNow(), on))}>Mögliche Zuzahlung durch Kunden</Check>
          {copay ? (
            <Field
              label="Zuzahlung in €" id="kd-copayAmount" type="number" inputMode="numeric" min={0} step={1} placeholder="0"
              value={copayAmount ? String(copayAmount) : ""} onChange={(e) => setKd({ copayAmount: parseEuro(e.target.value) })}
            />
          ) : null}
          <p className="m-0" aria-live="polite">Anrechenbares Budget <strong>{budgetReadout({ budgetMax, twoPersons, copayAmount })}</strong></p>
        </fieldset>
      ) : null}
    </Card>
  );
}

/** The second person of a two-person offer. On the page while "2 Personen" is ticked — and, as
 *  today, also while its entries are still stored after another budget option replaced it. */
function SecondPerson() {
  const payer = useOfferField<string>(KD, "payer");
  const two = !!useOfferField(KD, "twoPersons");
  const kept = useOfferField(KD, "partnerFirstName") !== undefined;
  const salutation = useOfferField<string>(KD, "partnerSalutation") ?? "";
  if (payer !== "Kassenkunde" || !(two || kept)) return null;
  return (
    <Card aria-labelledby="kd-partner">
      <CardTitle id="kd-partner">Zweite Person</CardTitle>
      <SelectField label="Anrede Partner" id="kd-partnerSalutation" value={salutation} onChange={(v) => setKd({ partnerSalutation: v })} options={[{ value: "", label: "Bitte wählen" }, { value: "Herr", label: "Herr" }, { value: "Frau", label: "Frau" }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="partnerFirstName" label="Vorname Partner" autoComplete="off" />
        <OfferText section={KD} name="partnerLastName" label="Nachname Partner" autoComplete="off" />
      </div>
      <OfferChoice section={KD} name="partnerPflegegrad" label="Pflegegrad Partner" options={["1", "2", "3", "4", "5"]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <OfferText section={KD} name="partnerGeburtsdatum" label="Geburtsdatum Partner" type="date" />
        <OfferText section={KD} name="partnerKvnr" label="KVNR Partner" autoComplete="off" />
        <OfferText section={KD} name="partnerKassenkundeName" label="Name der Krankenkasse Partner" placeholder="z. B. AOK Nord" autoComplete="off" />
        <OfferText section={KD} name="partnerPflegegradSeit" label="Pflegegrad seit (Partner)" type="month" />
      </div>
      <OfferText section={KD} name="partnerKrankenkasseAdresse" label="Adresse der Krankenkasse (Partner)" autoComplete="off" />
    </Card>
  );
}

/** Funding (application to the Pflegekasse), living situation, landlord, parking and notes. */
function Property() {
  const type = useOfferType();
  const payer = useOfferField<string>(KD, "payer");
  const application = useOfferField<string>(KD, "pflegekasseAntrag");
  const living = useOfferField<string>(KD, "wohnsituation");
  const notes = useOfferField<string>(KD, "notes") ?? "";
  const notAh = type !== "ah"; // Alltagshilfe asks only about parking and notes here
  const JA_NEIN = ["Ja", "Nein"];
  return (
    <Card aria-labelledby="kd-property">
      <CardTitle id="kd-property">Förderung und Objekt</CardTitle>
      {notAh && payer === "Kassenkunde" ? (
        <>
          <OfferChoice section={KD} name="pflegekasseAntrag" label="Antrag auf Zuschuss bei Pflegekasse gestellt?" options={JA_NEIN} onChoose={(v) => setKd(chooseApplication(v))} />
          {application === "Ja" ? <OfferChoice section={KD} name="pflegekasseGenehmigung" label="Genehmigung von Pflegekasse ist vorhanden?" options={JA_NEIN} /> : null}
          {application === "Nein" ? <OfferChoice section={KD} name="pflegekasseEmc2Antrag" label="Darf EmC2 für Sie diesen Antrag stellen?" options={JA_NEIN} /> : null}
        </>
      ) : null}
      {notAh ? <OfferChoice section={KD} name="wohnsituation" label="Angabe zur Wohnsituation" options={["Eigentum", "Miete"]} onChoose={(v) => setKd(chooseLivingSituation(v))} /> : null}
      {type === "bu" || type === "bwt" || type === "hl" ? <OfferChoice section={KD} name="vermieterGenehmigungErforderlich" label="Genehmigung des Vermieters erforderlich?" options={JA_NEIN} required /> : null}
      {notAh && living === "Miete" ? <OfferChoice section={KD} name="vermieterGenehmigung" label="Genehmigung des Vermieters liegt vor?" options={["Ja", "Nein", "Noch ausstehend"]} /> : null}
      <OfferChoice section={KD} name="parkenMoeglich" label="Parken vor dem Objekt möglich?" options={JA_NEIN} />
      <OfferText section={KD} name="parkDetails" label="Weitere Angaben zur Parksituation" placeholder="z. B. Hinterhof, Halteverbot, Fußweg zum Objekt" autoComplete="off" />
      <TextAreaField label="Notizen" id="kd-notes" value={notes} onChange={(v) => setKd({ notes: v })} placeholder="Freie Notizen …" />
    </Card>
  );
}

/** While two persons are chosen, the name and greeting of both follow the entered names (unless they were changed by hand). */
function useTwoPersonsTexts() {
  const kd = useOfferStore((s) => (s.offer as Record<string, any> | null)?.Kundendaten as Record<string, unknown> | undefined);
  const before = useRef(kd);
  useEffect(() => {
    const was = before.current;
    before.current = kd;
    if (!kd || !was || was === kd) return;
    const fix = followNames(was, kd);
    if (Object.keys(fix).length) setKd(fix);
  }, [kd]);
}

export function Kundendaten() {
  useTwoPersonsTexts();
  const type = useOfferType(); // Badelift has no Aufschlag / Rabatt step: its markup is entered here (as today)
  const { dealId = "" } = useParams();
  return (
    <>
      <Contact />
      <Address />
      <ContactPerson />
      <Payer />
      {type === "bl" ? <Markup /> : null}
      <CareLevel />
      <SecondPerson />
      <Property />
      <Card aria-labelledby="kd-more">
        <CardTitle id="kd-more">Weitere Angaben</CardTitle>
        <p className="m-0">Wohnumfeld, hochgeladene Bestätigungen (Kasse, Vermieter) und interne Aufgaben werden noch in der bisherigen Ansicht bearbeitet. Ihre Eingaben werden mitgenommen.</p>
        <LegacyLink dealId={dealId} step="Kundendaten">Weitere Angaben in der bisherigen Ansicht</LegacyLink>
      </Card>
    </>
  );
}
