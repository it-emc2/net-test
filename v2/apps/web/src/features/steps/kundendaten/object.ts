// Funding and property answers — the rules of today's UI, recorded for all offer types
// (test/fixtures/kundendaten-object.json). `undefined` removes a field.
type Fields = Record<string, unknown>;

/** Application to the Pflegekasse: "Ja" asks whether it is approved, "Nein" whether EmC2 may apply; the other answer goes. */
export const chooseApplication = (answer: string): Fields =>
  answer === "Ja" ? { pflegekasseAntrag: "Ja", pflegekasseEmc2Antrag: undefined } : { pflegekasseAntrag: "Nein", pflegekasseGenehmigung: undefined };

/** Living situation: renting needs the landlord's approval, owning does not (set by itself, can be changed);
 *  "liegt vor" is only asked — and stored — for a rented home. */
export const chooseLivingSituation = (answer: string): Fields =>
  answer === "Miete" ? { wohnsituation: "Miete", vermieterGenehmigungErforderlich: "Ja" }
  : { wohnsituation: answer, vermieterGenehmigung: undefined, ...(answer === "Eigentum" ? { vermieterGenehmigungErforderlich: "Nein" } : {}) };
