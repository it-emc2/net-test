// What choosing the payer does to the offer — the rules of today's UI, recorded for all five
// offer types (test/fixtures/kundendaten-payer.json, v2/scripts/capture-kundendaten.cjs):
//  - Selbstzahler: the insurance details and `wohnumfeldDone` are NOT stored at all, the care
//    level / budget / Pflegekasse answers are stored blank, and neither Abtretung nor Vollmacht
//    is selected as a document (also not as attachment of a letter).
//  - back to Kassenkunde: everything entered before is there again — except `wohnumfeldDone`
//    (today's UI does not bring it back either).
// The rules live in @oc/domain (customer-data.ts): one implementation with the server (ADR 027 B).
export { chooseInvoiceCopy, choosePayer, type Parked, type PayerChange } from "@oc/domain";
