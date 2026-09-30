// Self-check: AH PDF Eigenanteil (2 Personen doubles only the Entlastungsbetrag,
// VP/Umwidmung also deducted — same as computeAHGesamt on screen).
import assert from "node:assert/strict";
import { buildAhData, mapData } from "../src/routes/docx-template.js";

// 2-person fields live in Kundendaten; the rest of `fin` goes to Finanzierung.
const body = ({ ahZweiPersonen, ...fin }) => ({
  Kundendaten: { payer: "Kassenkunde", ahZweiPersonen },
  Arbeitszeit: { ahTravelZone: "1" }, // 10 min Hinfahrt
  ah: { services: [{ type: "Haushaltsnahedienstleistungen",
    schedules: [{ dauer: "2:00", regelmaessigkeit: "Wöchentlich" }] }] },
  Finanzierung: fin,
});
const f = 52 / 12;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const gesamt = r2(f * 7.96) + r2((2 + 10 / 60) * f * 40.56);

let d = buildAhData(body({ ahEntlastungsbetragNutzen: "on" }));
assert.equal(d.AhEigenanteilNum, r2(gesamt - 131));
assert.equal(d.AhAbzugLabel, "abzgl. Entlastungsbetrag § 45b SGB XI");

d = buildAhData(body({ ahEntlastungsbetragNutzen: "on", ahZweiPersonen: "on",
  ahVerhinderungspflegeMonat: "50", ahUmwidmungBeantragt: "on", ahUmwidmungBetrag: "20" }));
assert.equal(d.AhEigenanteilNum, r2(gesamt - 262 - 50 - 20));
assert.match(d.AhAbzugLabel, /2 × 131,00\s€.*Verhinderungspflege.*Umwidmung/);

d = buildAhData(body({ ahZweiPersonen: "on" })); // doubling without EB toggle → nothing
assert.equal(d.AhHasEigenanteil, false);
d = buildAhData({ ...body({ ahEntlastungsbetragNutzen: "on" }),
  Kundendaten: { payer: "Kassenkunde", salutation: "Frau", firstName: "Anna", lastName: "Muster",
    hasPflegegrad: "Ja", pflegegrad: "3", ahZweiPersonen: "on",
    p2Salutation: "Herr", p2FirstName: "Bernd", p2LastName: "Muster", p2Pflegegrad: "2" } });
assert.equal(d.AhAbzugLabel, "abzgl. Entlastungsbetrag § 45b SGB XI (2 × 131,00\u00a0€)"); // no names
// "Gleicher Termin wie HnD": HnD keeps Anfahrt + Reisezeit on shared days.
const combined = (hndFreq, abFreq) => buildAhData({ Kundendaten: { payer: "Selbstzahler" },
  Arbeitszeit: { ahTravelZone: "1" },
  ah: { services: [
    { type: "Haushaltsnahedienstleistungen", schedules: [{ dauer: "2:00", regelmaessigkeit: hndFreq }] },
    { type: "Alltagsbegleitung", combinedVisit: true, schedules: [{ dauer: "1:00", regelmaessigkeit: abFreq }] },
  ] } });
d = combined("Wöchentlich", "Monatlich"); // 1 shared day → AB = 1 h, no travel
assert.equal(d.AhGesamtNum, r2(gesamt + 53.04));
assert.ok(d.AhKondRowsAB.some((r) => r.AhKondValue === "1,00 Einsätze/Monat ohne Anfahrt"));
d = combined("Monatlich", "Wöchentlich"); // 1 shared of 4,33 AB visits
const hndM = r2(7.96) + r2((2 + 10 / 60) * 40.56);
const abW = r2((f - 1) * 7.96) + r2(((1 + 10 / 60) * f - 10 / 60) * 53.04);
assert.equal(d.AhGesamtNum, r2(hndM + abW));
d = combined("Wöchentlich", "Wöchentlich"); // all AB visits shared → no "inkl. Anfahrt" row for AB
assert.ok(!d.AhKondRowsAB.some((r) => r.AhKondLabel.includes("inkl. Anfahrt")));
assert.ok(d.AhKondRowsHnD.some((r) => r.AhKondLabel.includes("inkl. Anfahrt")));
// Address block / greeting name both persons (AH uses p2*, BU keeps partner*).
const kdTwo = { payer: "Kassenkunde", salutation: "Herr", firstName: "Max", lastName: "Mustermann",
  ahZweiPersonen: "on", p2Salutation: "Frau", p2FirstName: "Erika", p2LastName: "Musterfrau" };
let m = await mapData({ activeOffer: "ah", Kundendaten: kdTwo });
assert.equal(m.KundenAnschrift, "Herr Max Mustermann und Frau Erika Musterfrau");
assert.equal(m.GreetingLine, "Sehr geehrter Herr Mustermann, sehr geehrte Frau Musterfrau");
m = await mapData({ activeOffer: "ah", Kundendaten: { ...kdTwo, kundenName: "Familie Mustermann" } });
assert.equal(m.KundenAnschrift, "Familie Mustermann"); // typed override wins
m = await mapData({ activeOffer: "ah", Kundendaten: { ...kdTwo, ahZweiPersonen: undefined } });
assert.equal(m.GreetingLine, "Sehr geehrter Herr Mustermann");
m = await mapData({ activeOffer: "bu", Kundendaten: { ...kdTwo, twoPersons: true,
  partnerSalutation: "Frau", partnerFirstName: "Eva", partnerLastName: "Muster" } });
assert.equal(m.KundenAnschrift, "Herr Max Mustermann und Frau Eva Muster"); // BU unchanged
console.log("ok", gesamt);
