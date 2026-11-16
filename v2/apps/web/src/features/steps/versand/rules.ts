// Angebotsversand, the frame of the page (today: "Zusammenfassung"; reference:
// test/fixtures/versand-rahmen.json, v2/scripts/capture-versand-rahmen.cjs):
//  - the contact person (Ansprechpartner) is chosen from the people with a signature; a new offer
//    gets the signed-in user (or the first of the list). Stored: `Kundendaten.emc2_contact`
//    (name) and `Kundendaten.ansprechpartner` (e-mail) — printed contact, greeting name of the
//    mail and the signature follow it
//  - a two-person offer shows name and greeting as they appear in the offer; both follow the
//    names on Kundendaten until changed by hand (`Kundendaten.kundenName`, `greetingLine`)
//  - the line that tells how and when the offer was sent
//  - enclosed documents (`docSelection`) for Kassenkunde and Selbstzahler, not for Alltagshilfe;
//    the payer only sets the default ticks (done on Kundendaten)
import { sentText } from "../checkliste/rules.js";

type Fields = Record<string, unknown>;
export interface User { email: string; name: string }
const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const str = (v: unknown) => String(v ?? "").trim();

export const titleOf = (type: string | null): string => (type === "bu" ? "Angebotsversand" : "Zusammenfassung");

/** the e-mail of the chosen contact person, "" when the stored one is not in the list */
export function contactOf(kd: Fields, users: readonly User[]): string {
  const email = str(kd.ansprechpartner) || users.find((u) => u.name === str(kd.emc2_contact))?.email || "";
  return users.some((u) => u.email === email) ? email : "";
}
export const chooseContact = (users: readonly User[], email: string): Fields => {
  const u = users.find((x) => x.email === email);
  return { ...(u ? { emc2_contact: u.name || "" } : {}), ansprechpartner: u ? u.email : "" };
};
/** What the offer needs once the list is known: a contact person where there is none (or one
 *  that may no longer sign), and the e-mail of one known only by name. Null: nothing to change. */
export function contactDefault(kd: Fields, users: readonly User[], me: string | null | undefined): Fields | null {
  if (!users.length) return null;
  const mine = users.some((u) => u.email === me) ? me! : users[0]!.email;
  if (!str(kd.emc2_contact)) return chooseContact(users, mine);
  const email = contactOf(kd, users);
  if (!email) return chooseContact(users, mine); // the stored person is no longer in the list
  return str(kd.ansprechpartner) === email ? null : { ansprechpartner: email };
}

/** name and greeting of a two-person offer, null when the offer is for one person */
export function twoPersons(offer: Fields): { name: string; greeting: string } | null {
  const kd = obj(offer.Kundendaten), ah = /^ah/.test(str(offer.activeOffer).toLowerCase());
  if (!(ah ? kd.ahZweiPersonen : kd.twoPersons) || kd.payer === "Selbstzahler") return null;
  return { name: String(kd.kundenName ?? ""), greeting: String(kd.greetingLine ?? "") };
}

/** "Noch nicht versendet." or "Versendet per E-Mail am … um … Uhr." — shown for every offer type
 *  (today's code means to hide it outside Badumbau, but the line stays visible) */
export function sendStatus(offer: Fields): { sent: boolean; text: string } {
  const t = sentText(obj(offer.zusammenfassung).versand);
  return t === "Nein" ? { sent: false, text: "Noch nicht versendet." } : { sent: true, text: t.replace(/^Ja — /, "") };
}

export const DOCS = [
  { id: "abtretung", label: "Abtretungserklärung zur Abrechnung mit der Krankenkasse" },
  { id: "vollmacht", label: "Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3,4,5 SGB XI" },
  { id: "barrierefrei", label: "Flyer „Barrierefreies Wohnen“" },
] as const;
/** the enclosed documents with their ticks (missing = enclosed), null where the card is not shown */
export function documents(offer: Fields): { id: string; label: string; checked: boolean }[] | null {
  const payer = obj(offer.Kundendaten).payer, sel = obj(offer.docSelection);
  if ((payer !== "Kassenkunde" && payer !== "Selbstzahler") || str(offer.activeOffer).toLowerCase() === "ah") return null;
  return DOCS.map((d) => ({ ...d, checked: sel[d.id] !== false }));
}
