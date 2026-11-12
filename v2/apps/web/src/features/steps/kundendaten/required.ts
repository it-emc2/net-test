// "Weiter" on Kundendaten: what today's UI asks for before it goes on (recorded for all five
// offer types in test/fixtures/kundendaten-next.json):
//  1. the markup first — empty, no number, or under the minimum without a reason. For Badumbau,
//     Badewannentür and Handlauf the markup is on the Aufschlag / Rabatt step, so the user is
//     taken there (as today).
//  2. an empty date becomes today's date
//  3. salutation, first and last name; whether the landlord's approval is needed (Badumbau,
//     Badewannentür, Handlauf); with a contact person: their name and address; the care level
//     once "Ja" is chosen; e-mail addresses must be addresses
// Wording: today's message names two of these fields by an unclear label ("1" for the care
// level, "Email"); here every field is named by the label on the page.
import type { StepProblem } from "../../offer/index.js";
import { useOfferStore } from "../../offer/index.js";
import { markupProblem } from "../markup/rules.js";

type Fields = Record<string, unknown>;
const KD = "Kundendaten";
const text = (id: string) => `#${KD}-${id}`;
const choice = (name: string) => `[name="${KD}-${name}"]`;
// the browser's own rule for type="email" (HTML standard)
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const isEmail = (v: unknown, several = false) => {
  const s = String(v ?? "");
  return !s || (several ? s.split(",").map((p) => p.trim()) : [s]).every((p) => EMAIL.test(p));
};

/** the fields still to fill in: [label on the page, selector of its control], in page order */
export function missingFields(type: string | null, kd: Fields): [string, string][] {
  const empty = (k: string) => !String(kd[k] ?? "");
  const out: [string, string][] = [];
  if (empty("salutation")) out.push(["Anrede", choice("salutation")]);
  if (empty("firstName")) out.push(["Vorname", text("firstName")]);
  if (empty("lastName")) out.push(["Nachname", text("lastName")]);
  if (!isEmail(kd.email)) out.push(["E-Mail", text("email")]);
  if (!isEmail(kd.emailCc, true)) out.push(["E-Mail (CC)", text("emailCc")]);
  if (kd.hasContactPerson === "Ja") {
    if (empty("cp_name")) out.push(["Abweichender Ansprechpartner", text("cp_name")]);
    if (!isEmail(kd.cp_email)) out.push(["E-Mail des Ansprechpartners (CC)", text("cp_email")]);
    if (empty("cp_street")) out.push(["Adresse des Ansprechpartners", text("cp_street")]);
    if (empty("cp_city")) out.push(["Stadt des Ansprechpartners", text("cp_city")]);
    if (empty("cp_postalCode")) out.push(["PLZ des Ansprechpartners", text("cp_postalCode")]);
  }
  if (kd.payer === "Kassenkunde" && kd.hasPflegegrad === "Ja" && empty("pflegegrad")) out.push(["Welchen Pflegegrad?", choice("pflegegrad")]);
  if ((type === "bu" || type === "bwt" || type === "hl") && empty("vermieterGenehmigungErforderlich")) out.push(["Genehmigung des Vermieters erforderlich?", choice("vermieterGenehmigungErforderlich")]);
  return out;
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function checkKundendaten(): StepProblem | null {
  const st = useOfferStore.getState();
  const offer = st.offer as Record<string, any> | null;
  if (!offer) return null;
  const markup = markupProblem();
  if (markup) return markup;
  if (!offer.Kundendaten?.date) st.patch(KD as never, { date: today() } as never);
  const missing = missingFields(offer.activeOffer, offer.Kundendaten ?? {});
  if (!missing.length) return null;
  return { message: `Bitte in „Kundendaten“ ausfüllen: ${missing.map(([label]) => label).join(", ")}`, focus: missing[0]![1] };
}
