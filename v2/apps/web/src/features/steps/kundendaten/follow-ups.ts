// B3 (UX-CHANGES U-047): Kundendaten asks first, the follow-up fields appear only when the answer
// makes them necessary. DISPLAY ONLY — nothing here changes what is stored, priced or sent:
// hidden fields keep their values and are there again when the answer switches back.
//  - insurance block (Name/Adresse der Krankenkasse, Geburtsdatum, Versicherungsnummer, Pflegegrad
//    seit) after "Kunde hat Pflegegrad?" = Ja (a Kassenkunde only, as before)
//  - the landlord's questions after "Wohnsituation" = Miete; they stay on the page while the answer is
//    still missing, because "Weiter" asks for "Genehmigung des Vermieters erforderlich?" then
//  - the contact person's fields after "Ansprechpartner vorhanden?" = Ja
//  - the other place of deployment after "Abweichender Einsatzort vorhanden?" = Ja (the answer is
//    a page-only choice: today's offer has just the one text field)
// Never hide what is there: a block that already holds entries is on the page even when the answer
// says no — until the user answers the question by hand on this page.
import { useState } from "react";

type Fields = Record<string, unknown>;
const filled = (kd: Fields, keys: readonly string[]) => keys.some((k) => String(kd[k] ?? "").trim() !== "");

export const INSURANCE_FIELDS = ["kassenkundeName", "kk_krankenkasseAdresse", "kk_geburtsdatum", "kk_versichertennr", "kk_pflegegradSeit"] as const;
export const CONTACT_FIELDS = ["cp_salutation", "cp_name", "cp_phone", "cp_email", "cp_street", "cp_postalCode", "cp_city", "cp_state"] as const;

export const hasInsuranceData = (kd: Fields) => filled(kd, INSURANCE_FIELDS);
export const hasContactData = (kd: Fields) => filled(kd, CONTACT_FIELDS);
export const hasDeploymentData = (kd: Fields) => filled(kd, ["deployment"]);

/** "Genehmigung des Vermieters erforderlich?" (Badumbau, Badewannentür, Handlauf): "Weiter" asks for the
 *  answer, so it stays while the living situation is open. Own home with the stored "Nein" (what
 *  choosing "Eigentum" stores): nothing left to ask. */
export const showLandlordNeeded = (kd: Fields) => !(kd.wohnsituation === "Eigentum" && kd.vermieterGenehmigungErforderlich === "Nein");
/** "Genehmigung des Vermieters liegt vor?": for a rented home, or when an answer is stored */
export const showLandlordAnswer = (kd: Fields) => kd.wohnsituation === "Miete" || filled(kd, ["vermieterGenehmigung"]);

/** show a follow-up block: the answer is yes, or the block holds entries and the user has not answered on this page yet.
 *  Returns [show, answered] — call `answered()` when the user picks an answer. */
export function useFollowUp(yes: boolean, hasData: boolean): [boolean, () => void] {
  const [answered, setAnswered] = useState(false);
  return [yes || (hasData && !answered), () => setAnswered(true)];
}
