// U-072 (owner 2026-11-25, check level Full — money written to the CRM): an Alltagshilfe offer with
// Haushaltsnahe Dienstleistungen AND Alltagsbegleitung shares the Anfahrt of a combined visit. What
// goes to Bitrix on „ANG verschickt“ and at the signature (buildAhBitrixFields + ahTotalsOfPayload,
// modules/bitrix/write.ts and signing completion → integrations/bitrix-deal.ts):
//   - the deal amount (OPPORTUNITY) = THE AH total function's customerAmount (ADR 028) — the
//     Anfahrt once, equal to the offer document's total;
//   - the UF fields „Gesamtbetrag HnD“ and „Gesamtbetrag AB“ — legacy added the COMBINED Anfahrt
//     of both services to EACH of them, so together they counted it twice. Now each carries its own
//     Anfahrt; together they are the offer's net, the Anfahrt once.
// Made-up offers, no outside service.
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ahOfferTotals, ahDocumentInput } from "@oc/pricing";
import { AH_FIELD, ahBitrixFromPayload, buildAhBitrixFields } from "../src/integrations/bitrix-deal.js";
import { configureDocuments } from "../src/modules/documents/context.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const quiet = () => {};
let tpl: any, mine: any;
beforeAll(async () => {
  configureDocuments({
    businessConfig: { get: (_k: string, f?: unknown) => f }, fetchVigourNetPrices: async () => new Map(), vigorUri: "mongodb://127.0.0.1:9/none", root: ROOT,
    log: { debug: quiet, warn: quiet, error: quiet }, pdf: { docxToPdf: async () => Buffer.alloc(0), htmlToPdf: async () => Buffer.alloc(0) },
  });
  tpl = await import("../src/modules/documents/ported/docx-template.js");
  mine = await import("../src/modules/documents/ah-offer-data.js");
});

/** HnD weekly 2:00 + AB (combined visit) weekly 1:00, zone 2; optionally AB more often than HnD */
const offer = (payer: string, abRhythm = "Wöchentlich") => ({
  activeOffer: "ah",
  Kundendaten: { payer },
  Arbeitszeit: { ahTravelZone: "2", travelTimeHHMM: "0:20" },
  ah: {
    services: [
      { type: "Haushaltsnahedienstleistungen", schedules: [{ dauer: "2:00", regelmaessigkeit: "14-tägig" }] },
      { type: "Alltagsbegleitung", combinedVisit: true, schedules: [{ dauer: "1:00", regelmaessigkeit: abRhythm }] },
    ],
  },
});
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const doc = (p: unknown) => mine.buildAhOfferData(structuredClone(p), { fmtCurrency: tpl.fmtCurrency, haushaltTasks: tpl.AH_GENERIC_HAUSHALT_TASKS, begleitungTasks: tpl.AH_GENERIC_BEGLEITUNG_TASKS }, "document");

describe("U-072: the Anfahrt of a combined AH visit goes to Bitrix once", () => {
  for (const payer of ["Kassenkunde", "Selbstzahler"]) {
    it(`${payer}: deal amount = the document's amount; Gesamtbetrag HnD + AB = net, Anfahrt once`, () => {
      const p = offer(payer);
      const t = ahOfferTotals(ahDocumentInput(p, mine.ahDocConfig()));
      const d = t.detail;
      expect(d.abSharedEinsaetze).toBeGreaterThan(0);  // a combined visit …
      expect(d.abAnfahrtEinsaetze).toBeGreaterThan(0); // … and AB visits of its own (AB weekly, HnD every 14 days)
      // the deal amount (move and signature): ahTotalsOfPayload(…).customerAmount
      const amount = mine.ahTotalsOfPayload(p).customerAmount;
      const data = doc(p);
      expect(amount).toBe(data.AhBetragNum);
      expect(tpl.fmtCurrency(amount)).toBe(payer === "Selbstzahler" ? data.AhBrutto : data.AhGesamtbetrag);
      expect(t.net).toBe(r2(d.leistungenTotal + d.anfahrtTotal + d.abLeistungenTotal + d.abAnfahrtTotal)); // the Anfahrt once in the net
      // the UF fields as written to Bitrix
      const f = buildAhBitrixFields(p, "");
      const anfahrt = r2(d.anfahrtTotal + d.abAnfahrtTotal);
      expect(f[AH_FIELD.GESAMTPREIS_ANFAHRT]).toBe(anfahrt);
      expect(f[AH_FIELD.GESAMTBETRAG_HND]).toBe(r2(d.leistungenTotal + d.anfahrtTotal));
      expect(f[AH_FIELD.GESAMTBETRAG_AB]).toBe(r2(d.abLeistungenTotal + d.abAnfahrtTotal));
      expect(r2((f[AH_FIELD.GESAMTBETRAG_HND] as number) + (f[AH_FIELD.GESAMTBETRAG_AB] as number))).toBe(t.net);
    });
  }

  it("the figures of the test case (Kassenkunde)", () => {
    const p = offer("Kassenkunde");
    const b = ahBitrixFromPayload(p);
    // HnD every 14 days (26/12 visits) 2:00 + 0:20 travel: Leistungen 205,05 €, Anfahrt 17,25 €;
    // AB weekly 1:00, half of the visits shared with HnD: Leistungen 268,15 €, own Anfahrt 17,25 €
    expect({ hnd: b.gesamtpreisHnD, ab: b.gesamtpreisAB, anfahrt: b.anfahrtGesamt }).toEqual({ hnd: 205.05, ab: 268.15, anfahrt: 34.5 });
    // before U-072: HnD 239,55 € + AB 302,65 € = 542,20 € (the 34,50 € Anfahrt in both); now 222,30 € + 285,40 € = 507,70 €
    expect({ gesamtbetragHnD: b.gesamtbetragHnD, gesamtbetragAB: b.gesamtbetragAB }).toEqual({ gesamtbetragHnD: 222.3, gesamtbetragAB: 285.4 });
    expect(mine.ahTotalsOfPayload(p).customerAmount).toBe(507.7); // the deal amount (Kassenkunde: net) — unchanged by U-072
    expect(mine.ahTotalsOfPayload(offer("Selbstzahler")).customerAmount).toBe(543.24); // Selbstzahler: gross — unchanged
  });

  it("one service only: unchanged (its own Anfahrt is the whole Anfahrt)", () => {
    for (const svc of offer("Kassenkunde").ah.services) {
      const p = { ...offer("Kassenkunde"), ah: { services: [{ ...svc, combinedVisit: false }] } };
      const b = ahBitrixFromPayload(p);
      const total = svc.type === "Alltagsbegleitung" ? b.gesamtbetragAB : b.gesamtbetragHnD;
      expect(total).toBe(r2((svc.type === "Alltagsbegleitung" ? b.gesamtpreisAB : b.gesamtpreisHnD) + b.anfahrtGesamt));
      expect(total).toBe(mine.ahTotalsOfPayload(p).net);
    }
  });
});
