// What choosing the payer does to the offer — the rules of today's UI, recorded for all five
// offer types (test/fixtures/kundendaten-payer.json, v2/scripts/capture-kundendaten.cjs):
//  - Selbstzahler: the insurance details and `wohnumfeldDone` are NOT stored at all, the care
//    level / budget / Pflegekasse answers are stored blank, and neither Abtretung nor Vollmacht
//    is selected as a document (also not as attachment of a letter).
//  - back to Kassenkunde: everything entered before is there again — except `wohnumfeldDone`
//    (today's UI does not bring it back either).
import { emptyOffer, type NewOfferType } from "@oc/domain";
import { budgetPanelOf } from "./care.js";

type Fields = Record<string, unknown>;
export interface PayerChange {
  changes: { Kundendaten: Fields; docSelection: Fields; postal: Fields };
  /** what to remember for the way back (null: nothing to remember any more) */
  parked: Parked | null;
}
export interface Parked { kundendaten: Fields; docSelection: Fields; attachments: unknown }

/** stored only for a Kassenkunde */
const INSURANCE = ["kassenkundeName", "kk_geburtsdatum", "kk_krankenkasseAdresse", "kk_pflegegradSeit", "kk_rechnungskopie", "kk_rechnungskopie_art", "kk_versichertennr"] as const;
const INSURANCE_DEFAULTS: Fields = { kassenkundeName: "", kk_geburtsdatum: "", kk_krankenkasseAdresse: "", kk_pflegegradSeit: "", kk_rechnungskopie: "nein", kk_versichertennr: "" };
/** stored blank for a Selbstzahler */
const BLANK_FOR_SZ: Fields = {
  hasPflegegrad: "", pflegegrad: "", budgetMax: false, budgetCopay: false, twoPersons: false, premium: false,
  pflegekasseAntrag: "", pflegekasseGenehmigung: "", pflegekasseEmc2Antrag: "",
};

/** of those, what is there again after switching back: the care level, "Premium" and the
 *  Pflegekasse answers. The budget ticks (maximal, 2 Personen, co-payment) are gone, as today. */
const KEPT_FOR_THE_WAY_BACK = ["hasPflegegrad", "pflegegrad", "premium", "pflegekasseAntrag", "pflegekasseGenehmigung", "pflegekasseEmc2Antrag"] as const;

const pick = (o: Fields, keys: readonly string[]): Fields => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const remove = (keys: readonly string[]): Fields => Object.fromEntries(keys.map((k) => [k, undefined]));

export function choosePayer(offer: Record<string, any>, payer: "Selbstzahler" | "Kassenkunde", parked: Parked | null): PayerChange {
  const kd: Fields = offer.Kundendaten ?? {};
  if (payer === "Selbstzahler") {
    if (kd.payer === "Selbstzahler") return { changes: { Kundendaten: {}, docSelection: {}, postal: {} }, parked };
    return {
      changes: {
        Kundendaten: { payer, ...remove(INSURANCE), wohnumfeldDone: undefined, ...BLANK_FOR_SZ, copayAmount: 0, budgetOptionsPanel: "", kundenName: "", greetingLine: "" },
        docSelection: { abtretung: false, vollmacht: false },
        postal: { attachments: [] },
      },
      parked: {
        kundendaten: pick(kd, [...INSURANCE, ...KEPT_FOR_THE_WAY_BACK]),
        docSelection: pick(offer.docSelection ?? {}, ["abtretung", "vollmacht"]),
        attachments: offer.postal?.attachments,
      },
    };
  }
  if (kd.payer === "Kassenkunde") return { changes: { Kundendaten: {}, docSelection: {}, postal: {} }, parked };
  // no memory of an earlier Kassenkunde state (e.g. the offer was opened as Selbstzahler) → today's defaults
  const fresh = emptyOffer(offer.activeOffer as NewOfferType, { date: "" }) as Record<string, any>;
  const back: Parked = parked ?? { kundendaten: INSURANCE_DEFAULTS, docSelection: pick(fresh.docSelection, ["abtretung", "vollmacht"]), attachments: fresh.postal.attachments };
  return {
    changes: {
      Kundendaten: { payer, ...remove(Object.keys(BLANK_FOR_SZ)), ...INSURANCE_DEFAULTS, ...back.kundendaten, budgetOptionsPanel: budgetPanelOf(back.kundendaten) },
      docSelection: back.docSelection,
      postal: { attachments: back.attachments },
    },
    parked: null,
  };
}

/** Invoice copy: "Per Post / Per E-Mail" is stored only while the answer is "ja" (default: post; the last choice comes back). */
export function chooseInvoiceCopy(answer: "ja" | "nein", lastKind: unknown): Fields {
  return answer === "ja" ? { kk_rechnungskopie: "ja", kk_rechnungskopie_art: lastKind === "email" ? "email" : "post" } : { kk_rechnungskopie: "nein", kk_rechnungskopie_art: undefined };
}
