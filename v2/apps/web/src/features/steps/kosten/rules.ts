// Kosten (Kosten-Details, Badumbau) — what today's page shows, from the price alone
// (test/fixtures/kosten.json, v2/scripts/capture-kosten.cjs). The page stores nothing.
//  - work is split in two sections: "Auszuführende Arbeiten" (the tasks) and "Enthält je
//    Einheit" (vehicle, tools, clearing, kilometres, the workers' time, the drive)
//  - material is grouped as in the offer document, in a fixed order of categories
//  - optional products have a section of their own
//  - "Summen" is the ladder from the purchase sums over markup, discount and bonus to the total
//  - a line the markup leaves out is marked "ohne Aufschlag"; a line whose price changed since
//    the offer was priced shows today's difference (the offer's price stays the billed one)
//  - a line of the offer document that is shown but not bought (`displayOnly`, ADR 031: the plate of a
//    floor made only of leftovers) is listed where the document has it, without a price, with its note
type Fields = Record<string, unknown>;
export interface Price { [k: string]: unknown }
interface RawLine { productId?: string; id?: string; key?: string; name?: string; label?: string; qty?: unknown; unit?: string; unitPrice?: unknown; lineTotal?: unknown; amount?: unknown; source?: string; category?: string; currentNet?: unknown; displayOnly?: boolean; note?: string }
export interface Tag { text: string; kind: "plain" | "up" | "down"; title?: string }
export type Row = { subtitle: string } | { id: string; label: string; tags: Tag[]; qty: string; unit: string; total: string; task?: boolean; /** internal note after the label (ADR 031) */ note?: string };
export interface Section { num: string; title: string; rows: Row[]; footer: string; note?: { text: string; up: boolean } | null }
export interface Sum { num?: string; label: string; value: string; rule?: boolean; total?: boolean; note?: undefined }
export type SumRow = Sum | { note: string };

const n = (v: unknown) => Number(v) || 0;
export const eur = (v: unknown): string => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n(v));
const lines = (v: unknown): RawLine[] => (Array.isArray((v as { lines?: unknown } | undefined)?.lines) ? (v as { lines: RawLine[] }).lines : []);
const idOf = (l: RawLine) => String(l.productId || l.id || "").trim();
/** "19", "19,5" — never a trailing ",00" */
export const percent = (fraction: unknown): string => { const p = n(fraction) * 100; return Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/\.?0+$/, "").replace(".", ","); };

const BRANDS = /\b(VIGOUR|TRINNITY|BADOLUX|RAMSAUER|CLIVIA\s+PLUS|DERBY\s+V3\s+PLUS|HEWI)\b\s*/gi;
export const stripBrand = (s: string): string => s.replace(BRANDS, "").trim();
/** the article number in brackets for free items and the older Hassmann picks; never for configured enclosures */
export function labelOf(l: RawLine): string {
  const pid = idOf(l), base = l.label ? l.label : l.name || pid || "-";
  if (!pid || base.includes(`[${pid}]`) || l.source === "vigour_config") return base;
  if ((!/^HASS_/i.test(pid) && /Hassmann/i.test(base)) || /^\s*-\s*\d+\s*Stk\b/i.test(base)) return `${base} [${pid}]`;
  return base;
}
const qtyText = (v: unknown): string => { const q = Number(v ?? 1); return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, "").replace(".", ","); };

function row(l: RawLine, exempt: ReadonlySet<string>): Row {
  // shown, not bought: no price, no tags (ADR 031)
  if (l.displayOnly) return { id: idOf(l), label: stripBrand(labelOf(l)), tags: [], qty: qtyText(l.qty), unit: "", total: "", ...(l.note ? { note: `(${l.note})` } : {}) };
  const tags: Tag[] = [];
  if (exempt.has(idOf(l))) tags.push({ text: "ohne Aufschlag", kind: "plain" });
  const cur = n(l.currentNet), quoted = n(l.unitPrice);
  if (cur > 0 && Math.abs(cur - quoted) >= 0.005) { const up = cur > quoted; tags.push({ text: `${up ? "▲ +" : "▼ −"}${eur(Math.abs(cur - quoted))} heute`, kind: up ? "up" : "down", title: `Angebotspreis ${eur(quoted)} — heute ${eur(cur)}` }); }
  // the unit price shown is the one that gives the line total (markup included), so quantity × unit = total (UX-CHANGES U-033; today a grab bar line showed the purchase price)
  const qty = n(l.qty ?? 1), total = n(l.lineTotal), shown = qty > 0 && total > 0 && Math.abs(quoted * qty - total) >= 0.005 ? total / qty : l.unitPrice ?? 0;
  return { id: String(l.productId || l.id || l.key || ""), label: stripBrand(labelOf(l)), tags, qty: `${qtyText(l.qty)}${l.unit ? ` ${l.unit}` : ""}`, unit: eur(shown), total: eur(l.lineTotal ?? 0) };
}

/** the material lines + the offer document's display-only lines (ADR 031), placed as the document places them: before the floor's
 *  (last) Flächenkleber, else after the last Fußboden line, else at the end */
export function withDisplayOnly(mat: RawLine[], price: Price): RawLine[] {
  const shown = lines(price.materialsDisplayDocx).filter((l) => l.displayOnly);
  if (!shown.length) return mat;
  const out = [...mat];
  for (const d of shown) {
    let at = -1, after = out.length;
    out.forEach((l, i) => { if (l.category !== "Fußboden") return; after = i + 1; if (idOf(l) === "R_4260602") at = i; });
    out.splice(at >= 0 ? at : after, 0, d);
  }
  return out;
}

export const MATERIAL_ORDER = ["Kleinmaterial", "Fußboden", "Wandverkleidung", "Zubehör", "Duschwanne", "Duschabtrennung", "Duschvorhang", "Badewanne", "Weiteres"];
/** material lines under their category, in the order of the offer document (Handlauf: the
 *  configurations' names in first-seen order, lines without one under "Lieferkosten") */
function grouped(list: RawLine[], exempt: ReadonlySet<string>, hl = false): Row[] {
  const byCat = new Map<string, RawLine[]>();
  for (const l of list) { const c = l.category || (l.source === "optional" || l.source === "optional_reha" ? "Zubehör" : hl ? "Lieferkosten" : "Weiteres"); byCat.set(c, [...(byCat.get(c) ?? []), l]); }
  return (hl ? [...byCat.keys()] : MATERIAL_ORDER).flatMap((cat) => { const g = byCat.get(cat); return g?.length ? [{ subtitle: cat.toUpperCase() }, ...g.map((l) => row(l, exempt))] : []; });
}
const INCLUDED = [/fahrzeugbereitstellung/i, /bereitstellung.*werkzeug/i, /ber.?umung der baustelle/i, /kilometerpauschale/i, /facharbeiter/i, /anfahrt/i];

/** What the page needs besides the price: the offer type (the Badewannentür has its own lines) and the offer. */
export interface Ctx { type?: string | null; offer?: Record<string, any> | null }

/** Badewannentür: the tasks of the Arbeiten step are lines without a price, after the priced work */
const DOOR_TASK_TITLES: Record<string, string> = { deliver_install_bwt_door: "Liefern und Montieren der nachfolgend aufgeführten Badewannentür" };
function bwtTaskRows(bwt: Fields): Row[] {
  const tasks = (Array.isArray(bwt.workTasks) ? bwt.workTasks : []).map((v) => DOOR_TASK_TITLES[String(v)]).filter(Boolean) as string[];
  const free = (Array.isArray(bwt.extraTasks) ? bwt.extraTasks : []).map((t) => String(t ?? "").trim()).filter(Boolean);
  // tasks have no price: one quiet row each (UX-CHANGES U-032)
  return [...tasks, ...free].map((t) => ({ ...(row({ label: `- ${t}`, qty: 1, unit: "", unitPrice: 0, lineTotal: 0 }, new Set()) as Exclude<Row, { subtitle: string }>), task: true }));
}
/** Badewannentür: the extra work time of the Arbeitszeit step is shown task by task ("Extra Arbeitszeit:" + one line each) */
function bwtExtraTimeLabel(label: string, az: Fields): string {
  const lines = (Array.isArray(az.extraTasks) ? (az.extraTasks as Fields[]) : []).flatMap((t) => {
    const dur = String(t.durationHHMM ?? "").trim(), task = String(t.task ?? "").trim();
    return dur || task ? [`    -${dur ? ` (${dur})` : ""}${task ? `: ${task}` : ""}`] : [];
  });
  return lines.length ? `Extra Arbeitszeit:\n${lines.join("\n")}` : label;
}

/** Badewannentür "Enthält je Einheit": the server's lines, else (older answers) built from the services and the door, delivery and small-material lines */
function bwtIncluded(price: Price, _offer: Fields): RawLine[] {
  const own = Array.isArray(price.bwtIncludedDisplayUI) ? (price.bwtIncludedDisplayUI as Fields[]) : [];
  if (own.length) return own.map((r) => ({ productId: String(r.productId || r.key || ""), label: String(r.label || "-"), qty: n(r.qty), unitPrice: n(r.unitPrice), lineTotal: n(r.lineTotal) }));
  const svc = lines(price.servicesDisplayUI).length ? lines(price.servicesDisplayUI) : lines(price.services);
  const out: RawLine[] = [];
  const km = svc.find((s) => /kilometerpauschale/i.test(String(s.label || s.name || "")));
  if (km && typeof km.amount === "number" && km.amount > 0) out.push({ productId: String(km.key || km.productId || "kilometer"), label: String(km.label || km.name || "-"), qty: 1, unitPrice: km.amount, lineTotal: km.amount });
  const work = svc.find((s) => s.key === "facharbeiter" || /facharbeiter|arbeitszeit/i.test(String(s.label || s.name || "")));
  if (work && n(work.amount) > 0) out.push({ productId: String(work.key || work.productId || "facharbeiter"), label: String(work.label || work.name || "-"), qty: n(work.qty ?? 1) || 1, unitPrice: n(work.unitPrice ?? work.amount), lineTotal: n(work.amount) });
  const docx = (price.materialsDisplayDocx as Fields | undefined)?.lines, mat = Array.isArray(docx) && docx.length ? lines(price.materialsDisplayDocx) : lines(price.materials);
  for (const [id, short] of [["140322", "Lieferkosten Badewannentür"], ["1226", "Universal / Standard Tür"], ["KM02", "Kleinmaterial"]] as const) {
    const l = mat.find((x) => idOf(x) === id), qty = n(l?.qty);
    if (l && qty > 0) out.push({ productId: id, label: `- ${qty.toFixed(2).replace(/\.00$/, "")} Stk ${short}`, qty, unitPrice: n(l.unitPrice), lineTotal: n(l.lineTotal) });
  }
  return out;
}

/** types whose Kosten page has no numerals and one material list: Badelift, Winterdienst, Hausmeister-Service */
const flat = (type: string | null | undefined): boolean => type === "bl" || type === "wd" || type === "hms";

/** The sections of the page, from a price (Badumbau; for the Badewannentür and the Badelift with `ctx`). */
export function sections(price: Price | null, ctx: Ctx = {}): Section[] {
  if (!price) return [];
  const bwt = ctx.type === "bwt", offer = ctx.offer ?? {};
  const exempt = new Set((Array.isArray(price.markupExemptIds) ? price.markupExemptIds : []).map(String));
  const services = (price.services ?? {}) as Fields, materials = (price.materials ?? {}) as Fields;
  const work: Row[] = [], included: Row[] = [];
  for (const s of lines(price.servicesDisplayUI).length ? lines(price.servicesDisplayUI) : lines(services)) {
    let label = String(s.label || "").trim();
    if (bwt && (s.key === "extraAufgabe" || /extra\s*aufgabe/i.test(label.replace(/^\s*-\s*/, "")))) label = bwtExtraTimeLabel(label, (offer.Arbeitszeit ?? {}) as Fields);
    const plain = label.replace(/^\s*-\s*/, "");
    const facharbeiter = s.key === "facharbeiter" || /facharbeiter/i.test(String(s.label || ""));
    const unitPrice = Number.isFinite(Number(s.unitPrice)) && s.unitPrice != null ? Number(s.unitPrice) : facharbeiter && n(services.laborRate) ? n(services.laborRate) : n(s.amount);
    const r = row({ productId: s.key || s.productId, label: label || s.name || s.productId || "-", qty: s.qty ?? 1, unit: s.unit || "", unitPrice, lineTotal: s.amount }, new Set());
    (INCLUDED.some((re) => re.test(plain)) ? included : work).push(r);
  }
  const matLines = Array.isArray((price.materialsDisplayUI as Fields | undefined)?.lines) ? lines(price.materialsDisplayUI) : lines(materials);
  const matSum = (price.materialsDisplayUI as Fields | undefined)?.sum ?? materials.sum ?? 0;
  const drift = materials.vigorPriceDrift as { totalDelta?: unknown; lines?: unknown[] } | undefined, delta = n(drift?.totalDelta);
  const optLines = Array.isArray((price.optionalDisplayUI as Fields | undefined)?.lines) ? lines(price.optionalDisplayUI)
    : (Array.isArray(price.items) ? (price.items as RawLine[]) : []).map((i) => ({ productId: i.productId, name: i.productId, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal }));
  if (bwt) {
    const inc = bwtIncluded(price, offer), drift2 = drift && Math.abs(delta) >= 0.005 && (drift.lines?.length ?? 0) > 1;
    return [
      { num: "", title: String(services.title || "Auszuführende Arbeiten"), rows: [...work, ...bwtTaskRows((offer.bwt ?? {}) as Fields)], footer: "" },
      { num: "", title: "Enthält je Einheit", rows: inc.map((l) => row(l, new Set())), footer: `Summe Leistungen: ${eur(inc.reduce((a, l) => a + n(l.lineTotal), 0))}` },
      { num: "", title: String(materials.title || "Material für Badumbau"), rows: matLines.map((l) => row(l, exempt)), footer: `Summe Material: ${eur(matSum)}`,
        note: drift2 ? { text: `Preis geändert: ${drift!.lines!.length} Artikel kosten heute ${delta > 0 ? "insgesamt +" : "insgesamt −"}${eur(Math.abs(delta))} gegenüber dem Angebot. Angebotspreise bleiben unverändert.`, up: delta > 0 } : null },
    ];
  }
  // Handlauf (today's renderFromData with isHlKostenGrouping): I / II numbered like Badumbau, the
  // material grouped by configuration, the quantity without its unit (today's material rows drop it), no task rows and no "Optionale Produkte" (the type has no such page)
  const hl = ctx.type === "hl";
  const driftNote = drift && Math.abs(delta) >= 0.005 && (drift.lines?.length ?? 0) > 1 ? { text: `Preis geändert: ${drift.lines!.length} Artikel kosten heute ${delta > 0 ? "insgesamt +" : "insgesamt −"}${eur(Math.abs(delta))} gegenüber dem Angebot. Angebotspreise bleiben unverändert.`, up: delta > 0 } : null;
  if (hl) return [
    { num: "I", title: String(services.title || "Auszuführende Arbeiten"), rows: work, footer: "" },
    { num: "", title: "Enthält je Einheit", rows: included, footer: `Summe Leistungen: ${eur(services.sum)}` },
    { num: "II", title: String(materials.title || "Material für Badumbau"), rows: grouped(matLines.map(({ unit: _u, ...l }) => l), exempt, true), footer: `Summe Material: ${eur(matSum)}`, note: driftNote },
  ];
  // Badelift: no numerals, the material as one list (today's Kosten groups only Badumbau and Handlauf), no optional products.
  // Winterdienst / Hausmeister-Service: the same three sections, drawn from the server's empty shell (all empty, zeros)
  if (flat(ctx.type)) {
    return [
      { num: "", title: String(services.title || "Auszuführende Arbeiten"), rows: work, footer: "" },
      { num: "", title: "Enthält je Einheit", rows: included, footer: `Summe Leistungen: ${eur(services.sum)}` },
      { num: "", title: String(materials.title || "Material für Badumbau"), rows: matLines.map((l) => row(l, exempt)), footer: `Summe Material: ${eur(matSum)}`,
        note: drift && Math.abs(delta) >= 0.005 && (drift.lines?.length ?? 0) > 1 ? { text: `Preis geändert: ${drift.lines!.length} Artikel kosten heute ${delta > 0 ? "insgesamt +" : "insgesamt −"}${eur(Math.abs(delta))} gegenüber dem Angebot. Angebotspreise bleiben unverändert.`, up: delta > 0 } : null },
    ];
  }
  return [
    { num: "I", title: String(services.title || "Auszuführende Arbeiten"), rows: work, footer: "" },
    { num: "", title: "Enthält je Einheit", rows: included, footer: `Summe Leistungen: ${eur(services.sum)}` },
    { num: "II", title: String(materials.title || "Material für Badumbau"), rows: grouped(withDisplayOnly(matLines, price), exempt), footer: `Summe Material: ${eur(matSum)}`,
      // several articles changed their price: the sum of it (one article says it on its own line)
      note: drift && Math.abs(delta) >= 0.005 && (drift.lines?.length ?? 0) > 1 ? { text: `Preis geändert: ${drift.lines!.length} Artikel kosten heute ${delta > 0 ? "insgesamt +" : "insgesamt −"}${eur(Math.abs(delta))} gegenüber dem Angebot. Angebotspreise bleiben unverändert.`, up: delta > 0 } : null },
    { num: "III", title: "Optionale Produkte", rows: optLines.map((l) => row(l, exempt)), footer: `Summe: ${eur((price.optionalDisplayUI as Fields | undefined)?.sum ?? 0)}` },
  ];
}

/** "Summen": purchase sums → markup → (subtotal → discount / bonus) → net → VAT → total */
export function sums(price: Price | null, ctx: Ctx = {}): SumRow[] {
  if (!price) return [];
  const num = (s: string) => (ctx.type === "bwt" || flat(ctx.type) ? "" : s); // numerals: Badumbau (and Handlauf) only
  const services = (price.services ?? {}) as Fields, materials = (price.materials ?? {}) as Fields;
  const optional = n((price.optionalDisplayUI as Fields | undefined)?.sum), discount = n(price.rabattAmount), bonus = n(price.bonusGross);
  const grabReal = n(price.grabBonusReal), grabMat = n(price.grabBonusMaterial), grabWork = n(price.grabBonusArbeit), base = n(price.markupBase);
  return [
    { num: num("I"), label: "Auszuführende Arbeiten:", value: eur(services.sum) },
    { num: num("II"), label: `${String(materials.title || "Material für Badumbau")}:`, value: eur((price.materialsDisplayUI as Fields | undefined)?.sum ?? materials.sum ?? 0) },
    ...(optional ? [{ num: num("III"), label: "Optionale Produkte:", value: eur(optional) }] : []),
    { label: `Aufschlag (${percent(price.markupPct)}%${base ? ` auf ${eur(base)}` : ""}):`, value: eur(price.markup) },
    ...(discount || bonus ? [{ label: "Zwischensumme:", value: eur(price.Nettobetrag), rule: true }] : []),
    ...(discount ? [{ label: "Rabatt:", value: `− ${eur(discount)}` }] : []),
    ...(bonus ? [{ label: "Bonus / Gratis:", value: `− ${eur(bonus)}` }] : []),
    ...(grabReal ? [{ note: `davon Aktion Haltegriff ${eur(grabReal)} (Einkauf) · im Angebot: +${eur(grabMat)} Material, +${eur(grabWork)} Arbeit, −${eur(grabMat + grabWork)} Aktion — Nettobetrag gleich` }] : []),
    { label: "Nettobetrag:", value: eur(price.netAfterRabatt_and_Bonus), rule: true },
    { label: `zzgl. ${percent(price.taxRate ?? 0.19)}% MwSt.:`, value: eur(price.vatOnNet) },
    { label: "Gesamt (brutto):", value: eur(price.total), total: true },
  ];
}
