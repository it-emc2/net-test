// Alltagshilfe offer document data (DOCX fields, the online signing page, the AH Bitrix numbers)
// — the v2 replacement of the legacy docx-template buildAhData (ADR 028). Every amount comes from
// ONE function, @oc/pricing ahOfferTotals, read the way the documents read a stored offer
// (ahDocumentInput); the texts, rows and field names are the legacy ones. Wired into the ported
// docx-template by a rule in v2/scripts/port-verbatim.mjs (the legacy builder stays in that file as
// the reference of test/ah-offer-data.test.ts).
// Changes against the legacy builder (owner 2026-11-20): (2) an offer without a payer is a
// Kassenkunde (the funding is deducted; legacy: neither deducted nor VAT); (4) AhBetragNum = the
// customer-facing monthly amount (gross for a Selbstzahler, net for a Kassenkunde) for the send
// record and Bitrix. Kassenkunde and Selbstzahler print exactly as before (the DOCX never shows
// the Servicepauschale; a Selbstzahler already got net + 7 % MwSt = gross there).
// Zone and services reading (owner 2026-11-23, ADR 028 addendum): an offer not sent before reads its
// travel zone (travel time + Hof rule) and its services (ahServicesJson, older formats) as the screen does; an offer that already went out keeps the reading it
// went out with — decided per offer number by sends/zone-reading.ts (buildAhOfferDataFor).
import { AH_CONSTANTS, ahDocHoursFor, ahDocServices, ahDocTravel, ahDocumentInput, ahOfferTotals, type AhOfferTotals, type AhZoneReading } from "@oc/pricing";
import { ahZoneReadingForBody } from "../sends/index.js";
import cfg from "./shims/config.js";

export interface AhDocHelpers {
  fmtCurrency: (n: unknown) => string;
  haushaltTasks: readonly string[];
  begleitungTasks: readonly string[];
}
const HND = "Haushaltsnahedienstleistungen", AB = "Alltagsbegleitung";
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmtHHMM = (hours: number) => {
  if (!hours || !Number.isFinite(hours) || hours <= 0) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, "0")} h`;
};
const fmtCount = (n: number) => (!n || !Number.isFinite(n) ? "" : n.toFixed(2).replace(".", ","));
const comma = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/** the AH business settings as the documents read them */
export function ahDocConfig() {
  const num = (k: string, f: number) => Number(cfg.get(k, f)) || 0;
  return { entlastungsbetragMonat: num("ENTLASTUNGSBETRAG_MONAT", 131), steuerabsetzPct: num("STEUERABSETZ_PCT", 20), steuerabsetzCapJahr: num("STEUERABSETZ_CAP_JAHR", 4000) };
}

/** THE totals of a stored/sent AH offer for documents, signing page, send record and Bitrix */
export function ahTotalsOfPayload(body: unknown, config = ahDocConfig(), reading: AhZoneReading = "document"): AhOfferTotals {
  return ahOfferTotals(ahDocumentInput(body as Record<string, any>, config, reading));
}

/** The document data with the zone reading of the offer's number (the DOCX/PDF and signing-page entry point). */
export async function buildAhOfferDataFor(body: any, h: AhDocHelpers) {
  return buildAhOfferData(body, h, await ahZoneReadingForBody(body));
}

export function buildAhOfferData(body: any, h: AhDocHelpers, reading: AhZoneReading = "document") {
  const { fmtCurrency } = h;
  const ah = body?.ah || {};
  const rawServices = ahDocServices(body, reading);
  const ahNote = (ah.ahNote || "").trim();
  const { zoneNum, travelTimeH } = ahDocTravel(body, reading);
  const config = ahDocConfig();
  const t = ahTotalsOfPayload(body, config, reading);
  const p = t.detail;

  const hndSvc = rawServices.find((s: any) => s.type === HND);
  const abSvc = rawServices.find((s: any) => s.type === AB);
  const hndMonatlichH = p.totalMonatlichH;
  const abMonatlichH = p.abTotalMonatlichH;
  const abSharedEinsaetze = p.abSharedEinsaetze;
  const abAnfahrtEinsaetze = p.abAnfahrtEinsaetze;
  const totalMonatlichH = (hndMonatlichH || 0) + (abMonatlichH || 0);
  const totalEinsaetze = (p.totalEinsaetze || 0) + abAnfahrtEinsaetze;
  const gesamt = t.net;

  const isKassenkunde = t.payer === "Kassenkunde";
  const isSelbstzahler = !isKassenkunde;
  const ebProPerson = config.entlastungsbetragMonat;
  const zweiPersonen = body?.Kundendaten?.ahZweiPersonen === "on" || body?.Kundendaten?.ahZweiPersonen === true;
  const { entlastungsbetrag, verhinderungspflege, umwidmung, total: abzug } = t.deductions;
  const ahEigenanteil = t.eigenanteil;
  const hasEigenanteil = isKassenkunde && gesamt > 0 && abzug > 0;
  const abzugParts: string[] = [];
  if (entlastungsbetrag > 0) abzugParts.push(zweiPersonen ? `Entlastungsbetrag § 45b SGB XI (2 × ${fmtCurrency(ebProPerson)})` : "Entlastungsbetrag § 45b SGB XI");
  if (verhinderungspflege > 0) abzugParts.push("Verhinderungspflege § 39 SGB XI");
  if (umwidmung > 0) abzugParts.push("Umwidmung § 45a Abs. 4 SGB XI");
  const abzugLabel = "abzgl. " + abzugParts.join(", ");
  // the DOCX field values of the VAT lines are computed for every payer (printed only for a Selbstzahler)
  const ahMwst = r2(gesamt * 0.07);
  const ahBrutto = r2(gesamt + ahMwst);

  const AhServices = rawServices.map((svc: any, idx: number) => {
    const isHaushalt = svc.type === HND, isBegleitung = svc.type === AB;
    const title = isHaushalt ? "Angebot zur Unterstützung im Haushalt" : isBegleitung ? "Angebot zur Unterstützung im Alltag" : svc.type || "Dienstleistung";
    const subtitle = isHaushalt ? "– Haushaltsnahe Dienstleistung*" : isBegleitung ? "– Alltagsbegleitung*" : "";
    const genericTasks = isHaushalt ? h.haushaltTasks : isBegleitung ? h.begleitungTasks : [];
    let menge = "", einzelpreis = "", serviceGesamt = "";
    if (isHaushalt && hndMonatlichH > 0) {
      menge = fmtHHMM(hndMonatlichH); einzelpreis = comma(AH_CONSTANTS.STUNDENSATZ_HND); serviceGesamt = fmtCurrency(p.leistungenTotal);
    } else if (isBegleitung && abMonatlichH > 0) {
      menge = fmtHHMM(abMonatlichH); einzelpreis = comma(AH_CONSTANTS.STUNDENSATZ_AB); serviceGesamt = fmtCurrency(p.abLeistungenTotal);
    } else {
      const sched0 = (Array.isArray(svc.schedules) ? svc.schedules : [])[0] || {};
      menge = sched0.dauer ? `${sched0.dauer} h` : "";
    }
    return {
      AhServicePos: `${idx + 2}.`, AhServiceTitle: title, AhServiceSubtitle: subtitle,
      AhServiceTasks: genericTasks.map((label) => ({ AhTaskLabel: label })),
      AhServiceMenge: menge, AhServiceEinzelpreis: einzelpreis, AhServiceGesamt: serviceGesamt,
    };
  });

  const hasHnD = rawServices.some((s: any) => s.type === HND);
  const hasAb = rawServices.some((s: any) => s.type === AB);

  function buildKondRows(svc: any, monatlichH: number) {
    const rows: { AhKondLabel: string; AhKondValue: string }[] = [];
    const sched = (svc?.schedules || []).find((s: any) => s.dauer);
    if (sched?.dauer) rows.push({ AhKondLabel: "Gewünschter Stundenumfang pro Einsatz:", AhKondValue: `${sched.dauer} h` });
    if (travelTimeH > 0 && sched) {
      const zoneLabel = zoneNum > 0 ? `Zone ${zoneNum}${body?.Arbeitszeit?.distanceKm ? ` / ${body.Arbeitszeit.distanceKm} km` : ""}` : "Zone";
      rows.push({ AhKondLabel: `Stundenumfang pro Einsatz inkl. Anfahrt (${zoneLabel}):`, AhKondValue: fmtHHMM(ahDocHoursFor(sched.dauer, reading) + travelTimeH) });
    }
    if (monatlichH > 0) rows.push({ AhKondLabel: "Monatlicher Stundenumfang:", AhKondValue: fmtHHMM(monatlichH) });
    if (sched?.regelmaessigkeit) rows.push({ AhKondLabel: "Regelmäßigkeit:", AhKondValue: sched.regelmaessigkeit });
    if (sched?.bevorzugteTage) rows.push({ AhKondLabel: "Bevorzugte Tage:", AhKondValue: sched.bevorzugteTage });
    if (sched?.bevorzugteUhrzeit) rows.push({ AhKondLabel: "Bevorzugte Uhrzeit:", AhKondValue: sched.bevorzugteUhrzeit });
    return rows;
  }
  const AhKondRowsHnD = buildKondRows(hndSvc, hndMonatlichH);
  const AhKondRowsAB = buildKondRows(abSvc, abMonatlichH);
  if (abSharedEinsaetze > 0) {
    if (abAnfahrtEinsaetze <= 1e-9) {
      const j = AhKondRowsAB.findIndex((r) => r.AhKondLabel.includes("inkl. Anfahrt"));
      if (j >= 0) AhKondRowsAB.splice(j, 1);
    }
    const i = AhKondRowsAB.findIndex((r) => r.AhKondLabel.startsWith("Monatlicher"));
    AhKondRowsAB.splice(i < 0 ? AhKondRowsAB.length : i, 0, {
      AhKondLabel: "Gemeinsamer Termin mit Haushaltsnahen Dienstleistungen:",
      AhKondValue: `${fmtCount(abSharedEinsaetze)} Einsätze/Monat ohne Anfahrt`,
    });
  }
  const AhKondRows = [...AhKondRowsHnD, ...AhKondRowsAB];
  if (AhKondRows.length === 0) AhKondRows.push({ AhKondLabel: "", AhKondValue: "" });

  const anfahrtGesamtCombined = r2(p.anfahrtTotal + p.abAnfahrtTotal);
  const firstSched = (hndSvc?.schedules || []).find((s: any) => s.dauer) || (abSvc?.schedules || []).find((s: any) => s.dauer);

  return {
    AhNote: ahNote,
    AhAnfahrtMenge: totalEinsaetze > 0 ? `${fmtCount(totalEinsaetze)} Stück` : "",
    AhAnfahrtEinzelpreis: totalEinsaetze > 0 ? comma(AH_CONSTANTS.ANFAHRT_PER_EINSATZ) : "",
    AhAnfahrtGesamt: totalEinsaetze > 0 ? fmtCurrency(anfahrtGesamtCombined) : "",
    AhServices,
    AhHasServicepauschale: hasHnD,
    AhServicepausEinzelpreis: "1,20 €",
    AhGesamtbetrag: gesamt > 0 ? fmtCurrency(gesamt) : "",
    AhIsSZ: isSelbstzahler && gesamt > 0,
    AhGesamtLabel: isSelbstzahler && gesamt > 0 ? "Nettobetrag" : "Gesamtbetrag",
    AhMwstLabel: "zzgl. 7 % MwSt.",
    AhMwst: fmtCurrency(ahMwst),
    AhBrutto: fmtCurrency(ahBrutto),
    AhHasEigenanteil: hasEigenanteil,
    AhAbzugLabel: abzugLabel,
    AhEntlastungsbetrag: fmtCurrency(abzug),
    AhEigenanteil: hasEigenanteil ? fmtCurrency(ahEigenanteil) : "",
    AhKondRows,
    AhKondRowsHnD,
    AhKondRowsAB,
    AhGesamtNum: gesamt,
    AhEigenanteilNum: hasEigenanteil ? ahEigenanteil : 0,
    /** v2 (ADR 028): the customer-facing monthly amount — send record total, Bitrix deal amount */
    AhBetragNum: t.customerAmount,
    AhHasHnD: hasHnD,
    AhHasAb: hasAb,
    AhShowAbHinweis: gesamt > 0 && !hasAb,
    AhShowHndHinweis: gesamt > 0 && hasAb && !hasHnD,
    AhBitrix: {
      zoneNum,
      hasHnD,
      hasAb,
      stundenProEinsatz: firstSched ? ahDocHoursFor(firstSched.dauer, reading) : 0,
      tatsaechlicherStundenumfang: firstSched ? r2(ahDocHoursFor(firstSched.dauer, reading) + travelTimeH) : 0,
      regelmaessigkeit: firstSched?.regelmaessigkeit || "",
      monatlicherStundenumfang: r2(totalMonatlichH),
      anzahlAnfahrtspauschalen: r2(totalEinsaetze),
      anfahrtGesamt: anfahrtGesamtCombined,
      gesamtpreisAB: p.abLeistungenTotal,
      gesamtpreisHnD: p.leistungenTotal,
      gesamtbetragAB: r2(p.abLeistungenTotal + anfahrtGesamtCombined),
      gesamtbetragHnD: r2(p.leistungenTotal + anfahrtGesamtCombined),
    },
  };
}

/**
 * The total block of the online signing page — the same lines as the offer DOCX (owner decision 3,
 * 2026-11-20; legacy page: only the net total): Gesamtbetrag (Selbstzahler: Nettobetrag, zzgl. 7 %
 * MwSt., Gesamtbetrag brutto) and, when funding is deducted, the deduction and „Ihr Eigenanteil“.
 * `d` = the document data (buildAhOfferData), `esc` = the page's HTML escaping.
 */
export function ahSigningTotalsHtml(d: any, esc: (s: unknown) => string): string {
  const row = (label: string, value: string, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
  const rows = [row(d.AhGesamtLabel || "Gesamtbetrag", d.AhGesamtbetrag || "", "alt")];
  if (d.AhIsSZ) rows.push(row(d.AhMwstLabel || "", d.AhMwst || ""), row("Gesamtbetrag brutto", d.AhBrutto || "", "gesamtsumme"));
  if (d.AhHasEigenanteil) rows.push(row(d.AhAbzugLabel || "", `–${d.AhEntlastungsbetrag || ""}`), row("Ihr Eigenanteil", d.AhEigenanteil || "", "eigenanteil"));
  return `<table class="totals"><tbody>\n        ${rows.join("\n        ")}\n      </tbody></table>`;
}
