// BU pricing engine — TypeScript port of src/logic/pricing.js (BU path).
//
// Ported in verifiable chunks and golden-tested against the legacy engine:
//   1. materials    (computeMaterials)      — DONE (golden-verified, 6/6 fixtures)
//   2. services     (computeServiceCosts)   — DONE (golden-verified)
//   3. aggregation  (computePrices totals + subsidy + display variants) — TODO
//
// The price SOURCE is injected (like the legacy pricingFactory(ProductModel)):
// production wires the Vigor-first resolver from services/catalog; golden tests
// inject a legacy-Products-only resolver to prove algorithm parity.
import config from "../services/config.js";
import type { ResolvedProduct } from "../services/catalog.js";

/** The offer payload is free-form (Mixed in Mongo); access it loosely. */
export type PricingPayload = { [key: string]: any };

/** Resolve product codes → price/name/stock. Injected dependency. */
export type PriceResolver = (ids: string[]) => Promise<Map<string, ResolvedProduct>>;

export type OfferKey = "bu" | "bwt" | "hl" | "bl" | "ah" | "hms" | "wd";

// ---------------------------------------------------------------------------
// Wandverkleidung 3.0 — color → Hassmann article-number mapping.
// 997x2550 and 1497x2550 Hassmann/VIGOUR article numbers for every color the
// configurator offers. Keys are the UI color name, lower-cased (see
// normalizeWvColorKey).
// ---------------------------------------------------------------------------
const WV_COLOR_ARTICLE: Record<string, Record<string, string>> = {
  "weiß": { "997x2550": "V3WVK07", "1497x2550": "V3WV07" }, // weiss RAL 9016
  "marmor weiß": { "997x2550": "V3WVK09", "1497x2550": "V3WV09" },
  "struktur weiß": { "997x2550": "V3WVK06", "1497x2550": "V3WV06" },
  "stein beige": { "997x2550": "V3WVK01", "1497x2550": "V3WV01" },
  "aragon grau": { "997x2550": "V3WVK22", "1497x2550": "V3WV22" },
  "stein grau": { "997x2550": "V3WVK02", "1497x2550": "V3WV02" },
  "beton grau": { "997x2550": "V3WVK31", "1497x2550": "V3WV31" },
  "beton grau metallic": { "997x2550": "V3WVK30", "1497x2550": "V3WV30" }, // Beton grau-metallic
  "aragon anthrazit": { "997x2550": "V3WVK21", "1497x2550": "V3WV21" },
  "schiefer grau": { "997x2550": "V3WVK08", "1497x2550": "V3WV08" },
  "schwarzwaldeiche hell": { "997x2550": "V3WVK23", "1497x2550": "V3WV23" },
  "stein anthrazit": { "997x2550": "V3WVK03", "1497x2550": "V3WV03" },
  "metall oxydant": { "997x2550": "V3WVK10", "1497x2550": "V3WV10" },
  "sonderdekor": { "997x2550": "V3WVK999", "1497x2550": "V3WV999" }, // Wunschdekor nach Vorlage
};

function normalizeWvColorKey(color: string): string {
  return String(color || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Resolve the article number for a WV panel color.
// Priority: explicit pid embedded in the value ("pid|color") > mapped article
// number for (color, size) > provided fallback (the size default).
function resolveWvArticle(size: string, colorDisplay: string, explicitPid: string, fallbackPid: string): string {
  if (explicitPid) return explicitPid;
  let key = normalizeWvColorKey(colorDisplay);
  // "Sonderdekor 12345" / "sonderdekor <nr>" all map to the Sonderdekor entry.
  if (key.startsWith("sonderdekor")) key = "sonderdekor";
  const entry = WV_COLOR_ARTICLE[key];
  const mapped = entry && entry[size];
  return mapped || fallbackPid;
}

// --- pure helpers (fully ported) ---

export const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const ceilSafe = (n: number): number => Math.ceil((Number(n) || 0) - 1e-12);

/** Normalize "1.234,56", "1234.56", "100", "1.234,56 €" → Number. */
export function parseMoneyStrict(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/[^\d,.\-]/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** REHA DB price (gross) → net. */
export function grossToNet(gross: unknown, taxRate: number): number {
  const g = Number(gross);
  if (!Number.isFinite(g)) return 0;
  const r = Number(taxRate);
  if (!Number.isFinite(r) || r <= 0) return g;
  return g / (1 + r);
}

/** Prefer numeric payload.pricing.markupPct; fallback to Kundendaten.aufschlag like "35%". */
export function extractMarkupPct(payload: PricingPayload): number {
  const fromNumeric = payload?.pricing?.markupPct;
  if (typeof fromNumeric === "number" && Number.isFinite(fromNumeric)) return fromNumeric;
  const a = payload?.Kundendaten?.aufschlag;
  if (!a) return 0.35;
  const m = String(a).trim().match(/^(\d+(?:[.,]\d+)?)\%$/);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n)) return n / 100;
  }
  return 0.35;
}

export function getActiveOffer(payload: PricingPayload): OfferKey {
  const k = payload?.activeOffer;
  if (k === "bu" || k === "bwt" || k === "hl" || k === "bl" || k === "ah" || k === "hms" || k === "wd") {
    return k;
  }
  return "bu";
}

export function getMaterialsTitle(offerKey: OfferKey): string {
  switch (offerKey) {
    case "bwt":
      return "Material für Badewannentür";
    case "hl":
      return "Material für Handlauf";
    case "bl":
      return "Material für Badelift";
    case "bu":
    default:
      return "Material für Badumbau";
  }
}

export interface WorkNote {
  key: "worknote";
  label: string;
  amount: 0;
}

/** Zero-cost descriptive "work notes" for the UI/DOCX. Fully ported. */
export function computeWorkNotes(payload: PricingPayload): WorkNote[] {
  const opt = payload?.optional || {};
  const kind = payload?.wandverkleidung?.wvKind || "";
  const dusch = payload?.duschwanne || {};
  const floorKind = dusch?.floorKind || "";
  const hasFlooring = !!dusch?.addFlooring;

  const picked = new Set<string>();

  if (kind === "Fehlstellen") picked.add("Schließen der Fehlstellen");
  if (kind === "Deckenhoch") picked.add("Verkleidung Deckenhoch im Dusch/ Wannenbereich");
  if (kind === "Duschabtrennung")
    picked.add("Verkleidung bis zur Höhe des Fliesenspiegels im Dusch-/Wannenbereich");
  if (kind === "Fliesenspiegel")
    picked.add("Verkleidung bis zur Höhe des Fliesenspiegels im Dusch-/Wannenbereich");
  if (kind === "Innenraum-der-Kabine") picked.add("Verkleidung im Innenraum der Kabine");
  if (kind === "alle-Bad-Wände") picked.add("Verkleidung Deckenhoch aller Bad-Wände");

  if (hasFlooring && floorKind === "Fehlstellen") picked.add("Schließen der Fehlstellen im Fußbodenbereich");
  if (hasFlooring && floorKind === "Gesamtes-Bad") picked.add("Fußbodenverkleidung im gesamten Badbereich");

  const chosen = (flag: any, qty?: any): boolean => {
    if (Array.isArray(flag) && flag.length > 0) return true;
    if (typeof flag === "string" && flag.trim() !== "") return true;
    if (flag === true) return true;
    const q = Number(qty);
    return Number.isFinite(q) && q > 0;
  };

  const grab = chosen(opt["optGrab[]"], opt.qty_CLPESG30 || opt.qty_CLPESG40 || opt.qty_CLPESG60 || opt.qty_CLPESG80);
  const fold = chosen(opt["optFold[]"], opt.qty_DEPSKG60 || opt.qty_DEPSKG85);
  const basin = chosen(opt["optBasin[]"], opt.qty_CL60);
  const tap = chosen(opt["optBasinTap[]"], opt.qty_CL_BASIN || opt.qty_DEPOH);
  const thermo = chosen(opt["optThermo[]"], opt.qty_CLTB || opt.qty_DEPTB || opt.qty_CLB);

  if (grab) picked.add("Anbringen zusätzlicher Haltegriffe");
  if (fold) picked.add("Anbringen zusätzlicher Stützklappgriffe");
  if (basin) picked.add("Auswechseln eines Waschtisches");
  if (tap) picked.add("Einbau einer einhand-Waschtischbatterie");
  if (thermo) picked.add("Austausch eines Thermostates");

  const MAP_DW: Record<string, string> = {
    remove_tub: "Entfernen und Entsorgen der Badewanne inkl. Befliesung",
    install_bathtub: "Einbau der Badewanne",
    install_bathtub_screen: "Einbau des Wannenaufsatzes",
    remove_showertub: "Entfernen und Entsorgen der Duschwanne inkl. Befliesung",
    remove_enclosure: "Entfernen und Entsorgen der Duschabtrennung",
    install_tray: "Einbau der Duschwanne",
    install_sitzbath: "Einbau einer Sitzbadewanne inkl. Tür",
    remove_shower_curtain: "Entfernen und Entsorgen des Duschvorhangs",
    install_shower_curtain: "Einbau eines Duschvorhangs",
    install_enclosure: "Einbau der Duschabtrennung",
    install_box_enclosure: "Einbau, Verkleiden eines Kastens im Duschbereich",
    install_distance_profile: "Einbau eines Abstandprofil",
    close_valve: "Stilllegen der Armatur",
    relocate_faucet: "Versetzen, verlegen einer Armatur",
    relocate_drain: "Versetzen, verlegen eines Abflusses",
    convert_faucet: "Umbau einer Unterputz-Armatur in eine Aufputz-Armatur",
    replace_thermostat: "Auswechseln eines Aufputz Thermostates",
    replace_shower_no_thermo: "Auswechseln des Duschsystems ohne Thermostat",
    replace_shower_with_thermo: "Auswechseln des Duschsystems inkl. Aufputz-Thermostat",
    replace_shower_system: "Auswechseln des Duschsystems",
    install_shower_basket: "Einbau eines Duschkorbes",
    remove_sink: "Entfernen und Entsorgen eines Waschbeckens",
    install_sink: "Einbau eines Waschbeckens",
    replace_sink_faucet: "Auswechseln einer Waschbecken-Armatur",
    remove_furniture: "Entfernen und Entsorgen von Bademöbel",
    install_furniture: "Einbau von Bademöbel",
    remove_toilet: "Entfernen und Entsorgen einer Toilette",
    install_toilet: "Einbau einer Toilette",
    install_shower_wc: "Einbau eines Dusch-WCs",
  };

  const dwTasks = normalizeDWTasks(payload);
  for (const key of dwTasks) {
    const k = String(key).trim();
    picked.add(MAP_DW[k] || k);
  }

  return Array.from(picked).map((txt) => ({ key: "worknote", label: `- ${txt}`, amount: 0 }));
}

/** Robust duschwanne workTasks/extraTasks parser (handles odd literal keys). */
function normalizeDWTasks(payload: PricingPayload): string[] {
  const dw = payload?.duschwanne ?? {};
  const out: string[] = [];
  const addVal = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) return void out.push(...v);
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return void out.push(...parsed);
      } catch {
        /* not JSON */
      }
      const parts = v.includes(",") ? v.split(",") : [v];
      out.push(...parts.map((s) => s.trim()).filter(Boolean));
    }
  };
  const addExtraVal = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const x of v) {
        const s = String(x ?? "").trim();
        if (s) out.push(s);
      }
      return;
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (s) out.push(s);
    }
  };
  addVal(dw.workTasks);
  addVal(dw["workTasks[]"]);
  addVal(payload?.["duschwanne[workTasks][]"]);
  addVal(payload?.["duschwanne.workTasks"]);
  addVal(payload?.duschwanne_workTasks);
  addExtraVal(dw.extraTasks);
  addExtraVal(dw["extraTasks[]"]);
  addExtraVal(payload?.["duschwanne[extraTasks][]"]);
  addExtraVal(payload?.["duschwanne.extraTasks"]);
  addExtraVal(payload?.duschwanne_extraTasks);
  for (const [k, v] of Object.entries(dw)) {
    if (/worktasks/i.test(k)) addVal(v);
    else if (/extratasks?/i.test(k)) addExtraVal(v);
  }
  return Array.from(new Set(out));
}

function collectSelections(payload: PricingPayload): Array<{ productId: string; qty: number }> {
  const out: Array<{ productId: string; qty: number }> = [];
  const opt = payload?.optional || {};
  // --- quantities for Haltegriffe (esp. CLPESG30) ---
  const cl30Qty =
    Number(opt?.qty_CLPESG30 ?? (opt?.opt_CLPESG30 ? 1 : 0)) || 0;
  const cl40Qty =
    Number(opt?.qty_CLPESG40 ?? (opt?.opt_CLPESG40 ? 1 : 0)) || 0;
  // if you also use the other grab bars anywhere, define them too (optional):
  const cl60Qty =
    Number(opt?.qty_CLPESG60 ?? (opt?.opt_CLPESG60 ? 1 : 0)) || 0;
  const cl80Qty =
    Number(opt?.qty_CLPESG80 ?? (opt?.opt_CLPESG80 ? 1 : 0)) || 0;
  void cl30Qty;
  void cl40Qty;
  void cl60Qty;
  void cl80Qty;

  const aliasToId: Record<string, string> = { CL_BASIN: "CL" };
  const push = (id: string, qtyRaw: any, checked: boolean) => {
    const qtyNum =
      qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== ""
        ? Number(qtyRaw)
        : checked
          ? 1
          : 0;
    const qty = Number.isFinite(qtyNum) ? qtyNum : 0;
    if ((checked || qty > 0) && qty > 0) out.push({ productId: id, qty });
  };
  for (const [key, val] of Object.entries(opt)) {
    if (key.startsWith("opt_")) {
      const k = key.slice(4);
      const id = aliasToId[k] || k;
      push(id, opt[`qty_${k}`], Boolean(val));
    } else if (key.startsWith("qty_")) {
      const k = key.slice(4);

      // ✅ IMPORTANT: if we already have opt_<k>, it will handle qty_<k> there
      // so we must NOT push again here (prevents duplicates)
      if (opt[`opt_${k}`] !== undefined) continue;

      const id = aliasToId[k] || k;
      const qty = val;
      const checked = Boolean(opt[`opt_${k}`]);
      push(id, qty, checked);
    }
  }
  return out;
}

//  Detect which selected items belong to REHA
function extractRehaIdsFromOptional(opt: any): Set<string> {
  const out = new Set<string>();

  // optReha[] is expected to exist because your checkboxes use name="optReha[]"
  const raw = opt?.["optReha[]"];

  const addFromVal = (v: any) => {
    const s = String(v ?? "").trim();
    if (!s) return;

    // common case: "VitaL Hüftkissen schwarz 24081000" -> last token is the id
    const m = s.match(/(\d{5,})\s*$/);
    if (m) out.add(m[1]);
  };

  if (Array.isArray(raw)) {
    for (const v of raw) addFromVal(v);
  } else if (raw) {
    // sometimes payload sends a single string instead of array
    addFromVal(raw);
  }

  return out;
}

// --- factory (materials/services/aggregation land next) ---

/** Labor / travel / tools service lines. Ported verbatim from legacy 1241–1405. */
export function computeServiceCosts(payload: PricingPayload): Record<string, any> {
  const offer = getActiveOffer(payload);
  const b = payload?.Kundendaten || {};
  const arbeits = payload?.Arbeitszeit || {};

  const payer = b.payer === "Kassenkunde" ? "KK" : b.payer === "Selbstzahler" ? "SZ" : "";

  const workDays = Number(arbeits.workDays ?? b.workDays ?? 0) || 0;
  const travelDaysRaw = Number(arbeits.travelDays ?? b.travelDays);
  const travelDays = Number.isFinite(travelDaysRaw)
    ? Math.max(0, travelDaysRaw)
    : Math.max(0, workDays || 1);

  const oneWayKm = Number(arbeits.distanceKm ?? b.distanceKm ?? 0) || 0;
  const roundTripKm = Math.max(0, oneWayKm * 2 * travelDays);

  const total_hours_numeric = Number(b.totalHoursNumeric ?? arbeits.totalHoursNumeric ?? 0) || 0;
  const reise_hours_numeric = Number(arbeits.ReiseHoursNumeric ?? b.ReiseHoursNumeric ?? 0) || 0;
  const Arbeitszeit_hours_numeric =
    Number(arbeits.ArbeitHoursNumeric ?? b.ArbeitHoursNumeric ?? 0) || 0;
  const laborHours = Arbeitszeit_hours_numeric;

  const isBwt = offer === "bwt";
  const handwerkerCount = isBwt ? 1 : 2;
  const laborRateKK = config.get("LABOR_RATE_KK", 69.5);
  const laborRateSZ = config.get("LABOR_RATE_SZ", 59.5);
  const bwtLaborRate = config.get("LABOR_RATE_BWT", 79.5);
  const kmRate = config.get("KM_RATE", 0.35);
  const travelSecondWorkerRateRaw =
    Number(arbeits.travelSecondWorkerRate ?? b.travelSecondWorkerRate ?? 25) || 25;
  const sitz_reise_Rate = travelSecondWorkerRateRaw === 35 ? 35 : 25;

  const fahrzeugbereitstellung = config.get("FAHRZEUGBEREITSTELLUNG", 80.0);
  const werkzeug = config.get("WERKZEUG", 7.5);
  const beraeumung = config.get("BERAEUMUNG", 4.5);
  const kilometerpauschale = round2(roundTripKm * kmRate);
  const laborRate = isBwt ? bwtLaborRate : payer === "KK" ? laborRateKK : payer === "SZ" ? laborRateSZ : 0;

  const formatQty = (n: any) => Number(n || 0).toFixed(2).replace(".", ",");

  const lines: any[] = [];
  lines.push({
    key: "fahrzeug",
    label: `- ${formatQty(workDays)} Stk Fahrzeugbereitstellung`,
    qty: workDays,
    unitPrice: round2(fahrzeugbereitstellung),
    amount: round2(fahrzeugbereitstellung * workDays),
  });
  lines.push({
    key: "werkzeuge",
    label: `- ${formatQty(workDays)} Stk Bereitstellung und Vorhaltung von Maschinen & Werkzeugen`,
    qty: workDays,
    unitPrice: round2(werkzeug),
    amount: round2(werkzeug * workDays),
  });
  lines.push({
    key: "beraeumung",
    label: `- ${formatQty(workDays)} Stk Beräumung der Baustelle`,
    qty: workDays,
    unitPrice: round2(beraeumung),
    amount: round2(beraeumung * workDays),
  });
  if (roundTripKm > 0) {
    lines.push({
      key: "kilometer",
      label: `- ${roundTripKm} km Kilometerpauschale `,
      amount: kilometerpauschale,
    });
  }
  if (total_hours_numeric > 0 && laborRate > 0) {
    if (Arbeitszeit_hours_numeric > 0) {
      const arbeitUnit = round2(handwerkerCount * laborRate);
      lines.push({
        key: "facharbeiter",
        label: `- ${formatQty(Arbeitszeit_hours_numeric)} Std Arbeitszeit × ${handwerkerCount} Facharbeiter × ${formatQty(laborRate)} €`,
        qty: Arbeitszeit_hours_numeric,
        unit: "Std",
        unitPrice: arbeitUnit,
        amount: round2(Arbeitszeit_hours_numeric * arbeitUnit),
        docxHide: true,
      });
    }
    if (reise_hours_numeric > 0) {
      const reiseUnit = isBwt ? round2(bwtLaborRate) : round2(laborRate + sitz_reise_Rate);
      const reiseLabel = isBwt
        ? `- ${formatQty(reise_hours_numeric)} Std Anfahrt × ${handwerkerCount} Facharbeiter × ${formatQty(bwtLaborRate)} €`
        : `- ${formatQty(reise_hours_numeric)} Std Anfahrt × (${formatQty(laborRate)} € + ${formatQty(sitz_reise_Rate)} €)`;
      lines.push({
        key: "reisezeit",
        label: reiseLabel,
        qty: reise_hours_numeric,
        unit: "Std",
        unitPrice: reiseUnit,
        amount: round2(reise_hours_numeric * reiseUnit),
        docxHide: true,
      });
    }
  }
  let extraAufgabeAmount = 0;
  if (offer === "bwt") {
    const extraHours = Number(arbeits.extraHoursTotal ?? 0) || 0;
    if (extraHours > 0 && laborRate > 0) {
      const extraAmount = round2(extraHours * handwerkerCount * laborRate);
      extraAufgabeAmount = extraAmount;
      lines.push({ key: "extraAufgabe", label: "- extra Aufgabe", amount: extraAmount });
    }
  }

  try {
    const notes = computeWorkNotes(payload);
    for (const n of notes) lines.push(n);
  } catch {
    /* work notes are best-effort */
  }

  const sum = round2(lines.reduce((a, x) => a + (x.amount || 0), 0));
  return {
    title: "Auszuführende Arbeiten",
    lines,
    sum,
    payer,
    zoneLabel: "",
    distanceKm: roundTripKm,
    laborHours,
    laborRate,
    extraAufgabeAmount,
    travelSecondWorkerRate: sitz_reise_Rate,
  };
}

export interface Pricing {
  computePrices: (payload: PricingPayload) => Promise<Record<string, any>>;
  computeMaterials: (
    payload: PricingPayload,
  ) => Promise<{ title: string; lines: any[]; sum: number; grabCounts: any }>;
  computeServiceCosts: (payload: PricingPayload) => Record<string, any>;
}

export function createPricing(resolve: PriceResolver): Pricing {
  async function computeMaterials(payload: PricingPayload) {
    const offer = getActiveOffer(payload); // 'bu' | 'bwt' | 'hl'
    const markupPctForBwt = extractMarkupPct(payload); // 0.35 for "35%", etc.

    const dusch = payload?.duschwanne || {};
    const wv = payload?.wandverkleidung || {};
    const opt = payload?.optional || {};
    const bwt = payload?.bwt || {};
    const hl = payload?.hl || {};

    // For Haltegriff counts (used by UI logic later)
    let grabTotalQty = 0;
    let cl30Qty = 0;

    const lines: any[] = [];
    const idsNeeded = new Set<string>();

    const round2 = (n: any) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const ceilSafe = (n: any) => Math.ceil((Number(n) || 0) - 1e-12);

    // normalize "1.234,56", "1234.56", "100", "1.234,56 €" → Number
    const parseMoneyStrict = (v: any) => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const s = String(v ?? "").trim();
      if (!s) return 0;
      // drop currency symbols & extraneous chars, keep digits and separators
      const cleaned = s
        .replace(/[^\d,.\-]/g, "")
        .replace(/\s+/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : 0;
    };

    // Material category for the Angebot PDF grouping (Kleinmaterial, Fußboden,
    // Wandverkleidung, Zubehör, Duschwanne, Duschabtrennung). Set via setCat()
    // before each block below; lines pushed without a category fall back to
    // "Weiteres" at render time.
    let _cat: any = null;
    const setCat = (c: any) => { _cat = c; };

    // helper to push unresolved lines; we resolve names/prices at the end
    const add = (id: string, qty: any, labelOverride?: any, unitOverride?: any, source?: any, meta?: any) => {
      const q = Number(qty) || 0;
      if (!id || q <= 0) return;
      idsNeeded.add(id);
      lines.push({
        id,
        qty: q,
        label: labelOverride || null,
        unitOverride: Number.isFinite(unitOverride) ? Number(unitOverride) : null,
        source: source || null,
        meta: meta || null,          // ✅ add this
        docxHide: !!meta?.docxHide,  // optional convenience
        category: _cat,
      });
    };

    const isBudgetMode =
      !!dusch?.budgetMode ||
      dusch?.budgetMode === "1" ||
      dusch?.budgetMode === 1 ||
      dusch?.budgetMode === true;
    // ------- Duschwanne ancillary
    setCat("Kleinmaterial");
    if (dusch.abdichtSet) add("TRWDB", 1);


    if (dusch.drainSet) add(isBudgetMode ? "AGB001" : "AGD9060", 1);
    // Budget flag is purely additive: old offers won't have it -> treated as OFF.


    if (dusch.smallMaterial) add(isBudgetMode ? "AC004" : "KM02", 1);
    if (dusch.stelzlager) {
      const stelzQty = Math.max(1, parseInt(dusch.stelzlagerQty, 10) || config.get('BU_STELZLAGER_DEFAULT_QTY', 8));
      add("PLA5282", stelzQty);
    }

    // ------- Fußboden
    setCat("Fußboden");
    const addFlooring = !!dusch.addFlooring;
    const floorArea =
      Number(String(dusch.floorArea ?? "").replace(",", ".")) || 0;

    if (addFlooring && floorArea > 0) {
      const floorWaste = config.get('BU_FLOOR_WASTE_FACTOR', 1.15);
      const floorPanelSize = config.get('BU_FLOOR_PANEL_SIZE_M2', 0.3);
      // Paneele inkl. Verschnitt
      const panels = ceilSafe((floorArea * floorWaste) / floorPanelSize);

      // minimal inline color extraction from the first selected item
      const fp = Array.isArray(dusch.flooringProduct)
        ? dusch.flooringProduct[0] || ""
        : "";
      const color = fp.includes("|") ? fp.split("|", 2)[1].trim() : "";

      add(
        (fp && fp.includes("|") ? fp.split("|", 2)[0].trim() : "V5FB02"),
        panels,
        `- ${panels} Stk Fußboden-Paneele (1 Paneele = ${floorPanelSize} m²)${color ? " — Farbe: " + color : ""}`,
      );

      // Flächenkleber
      const adhesiveCoverage = config.get('BU_FLOOR_ADHESIVE_COVERAGE', 0.6);
      const packs = ceilSafe(floorArea / adhesiveCoverage);
      if (packs > 0)
        add(
          "R_4260602",
          packs,
          `- ${packs} Pkg Flächenkleber (1 Pkg je ${adhesiveCoverage} m²)`,
        );

      // Bodenabdichtung pro m²
      const floorSealingOn = !!(dusch.floorSealing || dusch["floorSealing[]"]);
      if (floorSealingOn) {
        const effM2 = round2(floorArea * floorWaste);
        if (effM2 > 0) {
          idsNeeded.add("TRBDSET7");
          lines.push({
            id: "TRBDSET7",
            qty: effM2,
            label: `- ${effM2} m² Trinnity Bodenabdichtung (inkl. ${Math.round((floorWaste - 1) * 100)}% Verschnitt)`,
            perM2Base: 7, // derive €/m² = price(TRBDSET7)/7
            source: null,
            category: _cat,
          });
        }
      }

      // individ. 5.0 V5FB02 — Menge = eingegebene m², Preis/Einheit = DB-Preis von V5FB02
      // const m2 = round2(floorArea);
      // if (m2 > 0) {
      //   add('V5FB02', m2, `- ${m2} m² Fußboden individ.5.0 V5FB02`);
      // }
    }

    // ------- Wandverkleidung
    setCat("Wandverkleidung");
    // Main panel quantity (user picks one color + qty here)
    const qty997 = Number(wv?.wvQty997 || 0) || 0;
    const qty1497 = Number(wv?.wvQty1497 || 0) || 0;

    // OLD global color (fallback)
    const wvColor = String(wv?.wvColor || "").trim();

    // NEW: per-panel config (comes from buildPayload.panelConfigs)
    const panelCfg = wv?.panelConfigs || {};
    const cfg997 = panelCfg["997x2550"] || {};
    const cfg1497 = panelCfg["1497x2550"] || {};

    const color997 = String(cfg997.color || wvColor).trim();
    const color1497 = String(cfg1497.color || wvColor).trim();
    const sonderConfigNr = String(wv?.wvSonderConfigNr || "").trim();
    const formatWvColor = (rawColor: any) => {
      const raw = String(rawColor || "").trim();
      if (!raw) return "";
      if (/^Sonder\s*Dekor$/i.test(raw) || /^Sonderdekor$/i.test(raw)) {
        return sonderConfigNr ? `Sonderdekor ${sonderConfigNr}` : "Sonderdekor";
      }
      return raw;
    };

    // Extras = additional panels of the same size in different colors. They
    // are read first because they count toward the totals used by every
    // derived calculation below (Flächenkleber, Verbindungsprofile, …).
    const readExtras = (panelKey: string) => {
      const fromTop = Array.isArray(wv?.extraColors?.[panelKey])
        ? wv.extraColors[panelKey]
        : null;
      if (fromTop && fromTop.length) return fromTop;
      const fromCfg = Array.isArray(panelCfg?.[panelKey]?.extras)
        ? panelCfg[panelKey].extras
        : null;
      return fromCfg || [];
    };

    const extras997 = readExtras("997x2550");
    const extras1497 = readExtras("1497x2550");
    const sumQty = (rows: any[]) =>
      rows.reduce((acc: number, r: any) => acc + (Number(r?.qty) || 0), 0);
    const extrasQty997 = sumQty(extras997);
    const extrasQty1497 = sumQty(extras1497);

    // Effective totals = main + extras. Used for every derived qty below.
    const effectiveQty997 = qty997 + extrasQty997;
    const effectiveQty1497 = qty1497 + extrasQty1497;
    const totalPanels = effectiveQty997 + effectiveQty1497;

    if (qty997 > 0) {
      const raw = String(color997 || "").trim();
      const hasPid = raw.includes("|");
      const pid = hasPid ? raw.split("|", 1)[0].trim() : "";
      const display = formatWvColor(hasPid ? raw.split("|").slice(1).join("|").trim() : raw);

      const base = `- ${qty997} Stk Wandverkleidung 3.0 Alu 997×2550 mm`;
      const label = display ? `${base} — Farbe: ${display}` : base;

      // Pricing stays on the size default (only V3WVK09 exists in the DB); the
      // color-specific article number is carried for the Hassmann CSV only.
      const article997 = resolveWvArticle("997x2550", display, pid, "V3WVK09");
      add(pid || "V3WVK09", qty997, label, null, null, {
        color: display,
        hassmannArticle: article997,
      });
    }
    if (qty1497 > 0) {
      const raw = String(color1497 || "").trim();
      const hasPid = raw.includes("|");
      const pid = hasPid ? raw.split("|", 1)[0].trim() : "";
      const display = formatWvColor(hasPid ? raw.split("|").slice(1).join("|").trim() : raw);

      const base = `- ${qty1497} Stk Wandverkleidung 3.0 Alu 1497×2550 mm`;
      const label = display ? `${base} — Farbe: ${display}` : base;

      const article1497 = resolveWvArticle("1497x2550", display, pid, "V3WV09");
      add(pid || "V3WV09", qty1497, label, null, null, {
        color: display,
        hassmannArticle: article1497,
      });
    }

    // Each extra-color row gets its own materials line at its own qty so the
    // Angebot/DOCX lists every color the user added.
    const addExtras = (rows: any[], panelLabel: string, size: string, defaultPid: string) => {
      for (const row of rows) {
        const q = Number(row?.qty) || 0;
        if (q <= 0) continue;
        const raw = String(row?.color || "").trim();
        if (!raw) continue;
        const hasPid = raw.includes("|");
        const pid = hasPid ? raw.split("|", 1)[0].trim() : "";
        const display = formatWvColor(
          hasPid ? raw.split("|").slice(1).join("|").trim() : raw,
        );
        const base = `- ${q} Stk Wandverkleidung 3.0 Alu ${panelLabel}`;
        const label = display ? `${base} — Farbe: ${display}` : base;
        const article = resolveWvArticle(size, display, pid, defaultPid);
        add(pid || defaultPid, q, label, null, null, {
          color: display,
          hassmannArticle: article,
        });
      }
    };
    addExtras(extras997, "997×2550 mm", "997x2550", "V3WVK09");
    addExtras(extras1497, "1497×2550 mm", "1497x2550", "V3WV09");

    if (wv?.wvSealing) add("TRWDSET5", 1);
    if (wv?.flechenkleber) {
      const userQtyAdh = Number(wv?.wvFlachenQty);
      const fallbackAdh = 2 * effectiveQty997 + 2 * effectiveQty1497;
      const qAdh =
        Number.isFinite(userQtyAdh) && userQtyAdh > 0
          ? userQtyAdh
          : fallbackAdh;
      if (qAdh > 0)
        add("R_4260602", qAdh, `- ${qAdh} Pkg Flächenkleber (Wandverkleidung)`);
    }
    let endProfilesQty = 0;
    if (wv?.wvEndProfile) {
      endProfilesQty = Number(wv?.wvEndProfileQty) || 0;
      if (endProfilesQty > 0) add("V3A", endProfilesQty);
    }
    // Prefer explicit user-entered qty from the WV form
    const userRaw = wv?.wvV3VQty;
    const userV3VQty = Math.max(0, parseInt(userRaw, 10) || 0);
    const corners = Number(wv?.wvCornersCount || 0) || 0;

    // If the user provided a value (including 0), use it; else fall back to (panels - 1)
    if (
      userRaw !== undefined &&
      userRaw !== null &&
      String(userRaw).trim() !== ""
    ) {
      if (userV3VQty > 0) {
        add("V3V", userV3VQty, `- ${userV3VQty} Stk Verbindungsprofil(e)`);
      }
    } else if (totalPanels >= 2) {
      const qV3V = Math.max(0, totalPanels - 1 - corners);
      add(
        "V3V",
        qV3V,
        `- ${qV3V} Stk Verbindungsprofil(e) (Plattenanzahl - 1 - ecken)`,
      );
    }
    if (wv?.wvSilikon) {
      const userQtySilikon = Number(wv?.wvSilikonQty);
      const qtyAbschlussprofil = endProfilesQty;
      // this is the qty of V3A
      let qSilikon;
      if (Number.isFinite(userQtySilikon) && userQtySilikon > 0) {
        // take user choice, but minimum is qty of Abschlussprofil
        qSilikon = Math.max(userQtySilikon, qtyAbschlussprofil);
      } else {
        // if user did not enter a valid value, fall back to Abschlussprofil qty
        qSilikon = qtyAbschlussprofil;
      }
      if (qSilikon > 0) add("2000302", qSilikon);
    }
    setCat(null);
    // ------- BWT · Badewannentür materials -------
    if (offer === "bwt") {
      // Example: standard door quantity
      // Tür-Varianten: jede ausgewählte Tür einzeln mit ihrer Menge hinzufügen
      const doors = [
        { qty: Number(bwt?.bwtDoorStdQty || 0) || 0, pid: "1226" },
        { qty: Number(bwt?.bwtDoorBudgetQty || 0) || 0, pid: "1225" },
        { qty: Number(bwt?.bwtDoorIndWienGlasQty || 0) || 0, pid: "1228" },
        { qty: Number(bwt?.bwtDoorVariodoorQty || 0) || 0, pid: "1320" },
        { qty: Number(bwt?.bwtDoorIndWienQty || 0) || 0, pid: "1227" },
      ];

      const doorInfoById = payload?.bwt?.doorInfoById || {};

      for (const door of doors) {
        if (!door.qty) continue;

        const infoLines = Array.isArray(doorInfoById[String(door.pid)])
          ? doorInfoById[String(door.pid)]
          : [];

        add(door.pid, door.qty, null, null, null, { doorInfoLines: infoLines });
      }


      // Aids / Haltegriffe quantities (40 / 60 / 80 cm)
      const aidsHg30Qty = Number(bwt?.bwtAidsHaltegriff30Qty || 0) || 0;
      const aidsHg40Qty = Number(bwt?.bwtAidsHaltegriff40Qty || 0) || 0;
      const aidsHg60Qty = Number(bwt?.bwtAidsHaltegriff60Qty || 0) || 0;
      const aidsHg80Qty = Number(bwt?.bwtAidsHaltegriff80Qty || 0) || 0;

      // Helper so BWT Haltegriffe are included in grabTotalQty / cl40Qty
      const addGrab = (pid: string, qty: any) => {
        const q = Number(qty) || 0;
        if (q <= 0) return;

        add(
          pid,
          q,
          null, // use DB name as label
          null, // use DB price as unit
          null,
        );

        // keep global grab counts in sync (used later in pricing/UI logic)
        grabTotalQty += q;
        if (pid === "CLPESG30") {
          cl30Qty += q;
        }
      };
      addGrab("CLPESG30", aidsHg30Qty);
      addGrab("CLPESG40", aidsHg40Qty);
      addGrab("CLPESG60", aidsHg60Qty);
      addGrab("CLPESG80", aidsHg80Qty);

      // BWT: Freier Posten (Zusätzliche Positionen BWT) → as materials
      if (Array.isArray(bwt?.quickAdd) && bwt.quickAdd.length) {
        for (const row of bwt.quickAdd) {
          if (!row) continue;

          const qty = Number(row.qty ?? 0) || 0;
          if (qty <= 0) continue;

          // robust parse of "1.234,56", "1234.56", "799,00 €", etc.
          const unitPrice = parseMoneyStrict(row.price);
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

          // base name / Bezeichnung
          const rawLabel = String(row.label ?? row.name ?? "").trim();
          const rawPid = String(row.productId ?? "").trim();

          const pid = rawPid || "BWT_CUSTOM";

          // build "name [id]" part
          let base = rawLabel;
          if (rawLabel && rawPid) {
            base = `${rawLabel} [${rawPid}]`;
          }

          // qty formatting (e.g. "3" instead of "3.0")
          let qtyDisplay = "";
          if (Number.isFinite(qty)) {
            qtyDisplay = Number.isInteger(qty) ? String(qty) : String(qty);
          }

          // final label: "qty Stk name [id]"
          let label: any = base || null;
          if (base && qtyDisplay) {
            label = `- ${qtyDisplay} Stk ${base}`;
          }

          // add(id, qty, labelOverride, unitOverride, source)
          add(
            pid,
            qty,
            label, // e.g. "3 Stk Filterpatrone [FP-123]"
            unitPrice, // user-entered unit price
            "BWT_EXTRA", // 🔹 mark as Freier Posten (BWT) for DOCX
          );
        }
      }

      // bwt[bwtinfoTasks][] can later be mapped to extra materials or work notes if needed.
    }

    // ------- HL · Handlauf materials -------
    if (offer === "hl") {
      // --------------------------------------------------
      // A) PIPES (canonical only)
      // --------------------------------------------------
      const pipeRows = Array.isArray(hl?.pipes) ? hl.pipes : [];

      for (let i = 0; i < pipeRows.length; i++) {
        const p = pipeRows[i];
        if (!p) continue;

        // MUST be DB productId (FF_*)
        const pid = String(p.productId || "").trim();
        if (!pid) continue;

        const qty = Number(p.qty ?? 1) || 1;

        const diameter = String(p.diameter || "").trim() || "⌀35mm";
        const pipeType = String(p.type || "").trim();
        void pipeType;

        // lengthCm is already canonical (number in cm) from collectHL()
        const lengthCm = Number(p.lengthCm ?? 0) || 0;

        const quality = String(p.quality || "").trim();
        const color = String(p.color || "").trim();

        //const title = `Edelstahl-Rohr ${diameter}${pipeType ? ` (${pipeType})` : ""}`;
        const title = `Edelstahl-Rohr ${diameter}${quality ? ` (${quality})` : ""}${color ? ` (${color})` : ""}`;

        // HL pipes are sold per meter → qty represents meters, not Stück
        const meters = lengthCm > 0 ? lengthCm / 100 : qty;
        const metersLabel = Number.isInteger(meters)
          ? String(meters)
          : String(meters).replace(".", ",");

        const info: string[] = [];
        //if (pipeType) info.push(`Rohr-Typ: ${pipeType}`);
        //if (quality) info.push(`Qualität: ${quality}`);
        //if (color) info.push(`Farbe: ${color}`);

        const label =
          `- ${metersLabel} m ${title}` +
          (info.length ? `\n${info.map((t) => "   • " + t).join("\n")}` : "");

        add(pid, qty, label, null, "hl_pipe", {
          color,
          lengthCm,
          quality,
          unit: "m",
          meters,
        });
      }

      // --------------------------------------------------
      // B) EXTRAS (canonical only: hl.extras map of FF_* -> qty)
      // --------------------------------------------------
      if (hl?.extras && typeof hl.extras === "object" && !Array.isArray(hl.extras)) {
        for (const [pidRaw, qtyRaw] of Object.entries(hl.extras)) {
          const pid = String(pidRaw || "").trim();
          const q = Number(qtyRaw ?? 0) || 0;

          // Only accept real DB ids (prevents hlBefFlexoGelenk etc)
          if (!pid.startsWith("FF_")) continue;
          if (q <= 0) continue;

          add(pid, q, null, null, "hl_extra");
        }
      }
    }

    // ------- HL: quickAdd (user-entered, no DB) → as material lines
    try {
      const qa = payload?.hl?.quickAdd || [];
      if (Array.isArray(qa) && qa.length) {
        // Keep normal rows first, logistik (Speditionskosten) always last
        const sorted = [...qa].sort((a, b) => {
          const aLog = String(a?.productId || "") === "HL_LOGISTIK" ? 1 : 0;
          const bLog = String(b?.productId || "") === "HL_LOGISTIK" ? 1 : 0;
          return aLog - bLog;
        });

        for (const row of sorted) {
          if (!row) continue;

          const qty = Number(row?.qty ?? 0) || 0;
          if (qty <= 0) continue;

          const unitPrice = parseMoneyStrict(row?.price);
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

          const rawLabel = String(row?.label ?? row?.name ?? "").trim();
          const rawPid = String(row?.productId ?? "").trim();

          const pid = rawPid || "HL_CUSTOM";
          // No product ID in Angebot label — UI can still decorate with [pid] for internal view
          const base = rawLabel || pid;

          // Decimal qty → treat as meters (pipes), integer → Stück
          const isMeters = !Number.isInteger(qty);
          const unitLabel = isMeters ? "m" : "Stk";
          const qtyStr = Number.isInteger(qty)
            ? String(qty)
            : String(qty).replace(".", ",");

          const label = `- ${qtyStr} ${unitLabel} ${base}`;

          add(pid, qty, label, unitPrice, "hl_quickadd", {
            unit: isMeters ? "m" : null,
          });
        }
      }
    } catch (e: any) {
      console.warn("[pricing] hl quick-add failed:", e?.message || e);
    }

    // ------- BL · Badelift materials -------
    try {
      const qa = payload?.bl?.quickAdd || [];
      if (Array.isArray(qa) && qa.length) {
        for (const row of qa) {
          if (!row) continue;

          const qty = Number(row?.qty ?? 0) || 0;
          if (qty <= 0) continue;

          const rawLabel = String(row?.label ?? row?.name ?? "").trim();
          const rawPid = String(row?.productId ?? "").trim();
          if (!rawPid) continue;

          if (row.kind === "bl-custom") {
            const unitPrice = parseMoneyStrict(row?.price);
            if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

            const base = rawLabel ? `${rawLabel} [${rawPid}]` : rawPid;
            const label = `- ${Number.isInteger(qty) ? qty : String(qty)} Stk ${base}`;
            add(rawPid, qty, label, unitPrice, "bl_quickadd_custom");
            continue;
          }

          const label = rawLabel
            ? `- ${Number.isInteger(qty) ? qty : String(qty)} Stk ${rawLabel}`
            : null;

          add(rawPid, qty, label, null, "bl_quickadd");
        }
      }
    } catch (e: any) {
      console.warn("[pricing] bl quick-add failed:", e?.message || e);
    }

    // ------- OPTIONALS as material lines (tagged so UI can filter them out of Material/Debug)
    try {
      const selections = collectSelections(payload); // [{productId, qty}]
      const isGrabId = (id: string) =>
        id === "CLPESG30" || id === "CLPESG40" || id === "CLPESG60" || id === "CLPESG80";


      const optGrabTotal = selections
        .filter((s) => isGrabId(s.productId))
        .reduce((a, s) => a + (Number(s.qty) || 0), 0);

      const optCl30 = selections
        .filter((s) => s.productId === "CLPESG30")
        .reduce((a, s) => a + (Number(s.qty) || 0), 0);

      // 🔹 accumulate instead of overwrite
      grabTotalQty += optGrabTotal;
      cl30Qty += optCl30;

      const rehaIds = extractRehaIdsFromOptional(opt);
      let hasReha = false;

      for (const s of selections) {
        const pid = String(s.productId || "").trim();
        const isReha = rehaIds.has(pid);

        if (isReha) hasReha = true;
        // IMPORTANT: still an "optional", but categorized
        add(pid, s.qty, null, null, isReha ? "optional_reha" : "optional");
      }

      // add delivery once if any REHA picked
      if (hasReha) {
        idsNeeded.add("REHA_DELIVERY");
        lines.push({
          id: "REHA_DELIVERY",
          qty: 1,
          label: "Lieferung (REHA-Team)",
          unitOverride: 6,
          source: "optional",
          docxHide: true, // ✅ hide only in generated file
        });
      }


    } catch (e: any) {
      console.warn("[pricing] optional->materials failed:", e?.message || e);
    }

    // ------- Sonderduschabtrennung Hassmann (user-entered net price)
    // ------- Duschabtrennung Quick-Add (Hassmann) rows (Pendeltür, Gleittür, Falt-Pendeltür, Walk-In)
    setCat("Duschabtrennung");
    try {
      const KIND_TO_LABEL: Record<string, string> = {
        PANDELTUER: "Pendeltür Hassmann",
        GLEITUR: "Gleittür Hassmann",
        FLATPANELTUER: "Falt-Pendeltür Hassmann",
        WALKIN_OHNE_TUER: "Walk-In Hassmann",
        SONDER: "Sonderduschabtrennung Hassmann",
      };

      const qa = payload?.duschabtrennung?.quickAdd || [];
      if (Array.isArray(qa) && qa.length) {
        for (const x of qa) {
          const qty = Number(x?.qty) || 0;
          const price = parseMoneyStrict(x?.price) || 0; // parses "1.099,00" etc.
          if (qty <= 0 || price <= 0) continue;

          const kindUp = String(x?.kind || "GEN").toUpperCase();
          const pid = String(x?.productId || "").trim() || `HASS_${kindUp}`;
          // For "Freier Posten" we already receive exact label via collector.
          const base =
            String(x?.label || "").trim() ||
            KIND_TO_LABEL[kindUp] ||
            "Duschabtrennung (Hassmann)";
          const label = `- ${qty} Stk ${base}`;
          // "config" = Duschabtrennung (neu) configurator lines (Vigour/Badolux):
          // tagged with their own source so the Kosten UI can skip appending [articleNumber]
          // to these (unlike Hassmann free-text rows, which keep it).
          const isConfig = kindUp === "CONFIG";

          add(pid, qty, label, price, isConfig ? "vigour_config" : null, isConfig ? { finish: x.finish || null } : null);
        }
      }
    } catch (e: any) {
      console.warn(
        "[pricing] quickAdd (Hassmann) merge failed:",
        e?.message || e,
      );
    }
    setCat(null);
    // OPTIONAL → Sonderprodukte quick-add
    try {
      const oq = payload?.optional?.quickAdd || [];
      if (Array.isArray(oq) && oq.length) {
        for (const x of oq) {
          const qty = Number(x?.qty) || 0;
          const price = parseMoneyStrict(x?.price) || 0;
          if (qty <= 0 || price <= 0) continue;

          const pid = String(x?.productId || "").trim() || "OPT_CUSTOM";
          const base = String(x?.label || "").trim() || "Sonderprodukt";
          const label = `- ${qty} Stk ${base}`;

          // subgroup null/undefined: follow your Optional pricing bucket
          add(pid, qty, label, price, "optional");
        }
      }
    } catch (e: any) {
      console.warn("[pricing] optional quick-add failed:", e);
    }

    // ------- Resolve names/prices once
    const productMap = await resolve([...idsNeeded]);

    const resolved = lines.map((l) => {
      const prod: any = productMap.get(l.id) || { netPrice: 0, name: "" };

      let unit;
      if (l.perM2Base && prod.netPrice) {
        unit = round2((Number(prod.netPrice) || 0) / Number(l.perM2Base)); // €/m² from set
      } else if (Number.isFinite(l.unitOverride)) {
        unit = Number(l.unitOverride);
      } else {
        unit = Number(prod.netPrice) || 0;
      }

      // ✅ HL pipe pricing: DB price is €/lfm, multiply by length (m)
      if (l.source === "hl_pipe") {
        const cm = Number(l?.meta?.lengthCm ?? 0) || 0;
        if (cm > 0 && Number(prod.netPrice) > 0) {
          const meters = cm / 100;
          unit = round2(Number(prod.netPrice) * meters);
        }
      }

      // 👇 special rule for Fußboden-Paneele
      if (l.id === "V5FB02" || l.id === "AVP-W") {
        unit = round2(unit / 8);
      }
      if (l.source === "optional_reha") {
        unit = round2(grossToNet(unit, config.get('TAX_RATE', 0.19)));
      }


      const displayNameBase = (prod.name || "").trim() || l.id;
      const metaColor = typeof l?.meta?.color === "string" ? l.meta.color.trim() : "";

      const displayName =
        metaColor && (l.id === "V3WVK09" || l.id === "V3WV09")
          ? `${displayNameBase} — Farbe: ${metaColor}`
          : displayNameBase;

      const builtLabel = l.id === "PLA5282"
        ? `- 1 Set ${displayNameBase}`
        : `- ${l.qty} Stk ${displayName}`;
      const label = l.label || builtLabel;

      let finalLabel = label;
      // --- BWT: Universal / Standard Tür (1226) color suffix for Kosten/UI ---
      if (offer === "bwt" && String(l.id || "").trim() === "1226") {
        const c = String(payload?.bwt?.bwtDoorStdColor || "").trim();
        if (c && !/—\s*Farbe:/i.test(finalLabel)) {
          finalLabel += ` — Farbe: ${c}`;
        }
      }


      // helper: remove any leading bullets/dashes/spaces from incoming lines
      const cleanInfoLine = (t: any) =>
        String(t ?? "")
          .replace(/^[\s•·\-–—]+/g, "")   // ✅ removes "• ", "-", "–", etc
          .trim();

      const rawInfoLines = l?.meta?.doorInfoLines;
      const infoLines = Array.isArray(rawInfoLines)
        ? rawInfoLines.map(cleanInfoLine).filter(Boolean)
        : [];

      if (infoLines.length) {
        // newline based (safe for UI + DOCX)
        finalLabel += "\n" + infoLines.map((t: string) => "   • " + t).join("\n");
      }

      // --- BWT: Einstiegshilfen (Haltegriffe) ---
      let lineTotal;
      if (offer === "bwt") {
        const pid = String(l.id || "").trim();
        const isBwtGrab =
          (pid === "CLPESG30" || pid === "CLPESG40" || pid === "CLPESG60" || pid === "CLPESG80") &&
          l.source !== "optional"; // only the BWT page "zusätzliche Einstiegshilfen", not global optionals

        if (isBwtGrab && markupPctForBwt > 0) {
          // unitPrice stays = DB price
          // lineTotal gets DB price * (1 + Aufschlag) * qty
          lineTotal = round2(unit * (1 + markupPctForBwt) * l.qty);
        } else {
          lineTotal = round2(unit * l.qty);
        }
      } else {
        // non-BWT: normal calculation
        lineTotal = round2(unit * l.qty);
      }

      // For HL pipes: display qty = meters (line total already €/lfm * meters)
      const isHlPipe = l.source === "hl_pipe";
      const displayQty = isHlPipe
        ? Number(l?.meta?.meters ?? (l?.meta?.lengthCm ?? 0) / 100) || l.qty
        : l.qty;
      const displayUnit = l?.meta?.unit || null;

      return {
        productId: l.id,
        name: displayName,
        color: metaColor || null,
        qty: displayQty,
        unit: displayUnit,
        unitPrice: unit,
        lineTotal,
        label: finalLabel,                 // still available everywhere
        labelLines: [label, ...infoLines],  // ✅ NEW: UI can render true multiline easily
        source: l.source || null,
        finish: l?.meta?.finish || null,
        hassmannArticle: l?.meta?.hassmannArticle || null,
        docxHide: !!l.docxHide,
        category: l.category || null,
      };

    });

    const sum = round2(resolved.reduce((a, x) => a + (x.lineTotal || 0), 0));

    // Return grabCounts at materials-level; UI or computePrices can bubble it up
    const GRAB_IDS = ["CLPESG30", "CLPESG40", "CLPESG60", "CLPESG80"];
    const grabQtyById: Record<string, number> = Object.fromEntries(
      GRAB_IDS.map((id) => {
        const row = resolved.find((l) => (l.productId || (l as any).id) === id);
        return [id, Number(row?.qty || 0) || 0];
      }),
    );
    const grabTotal = GRAB_IDS.reduce((a, id) => a + (grabQtyById[id] || 0), 0);
    const freeId = GRAB_IDS.find((id) => (grabQtyById[id] || 0) > 0) || null;

    void grabTotalQty;
    void cl30Qty;

    return {
      title: getMaterialsTitle(offer),
      lines: resolved,
      sum,
      grabCounts: {
        cl30: grabQtyById.CLPESG30 || 0,
        cl40: grabQtyById.CLPESG40 || 0,
        cl60: grabQtyById.CLPESG60 || 0,
        cl80: grabQtyById.CLPESG80 || 0,
        total: grabTotal,
        freeId,
      },
    };
  }

  async function computePrices(_payload: PricingPayload): Promise<Record<string, any>> {
    throw new Error("pricing: computePrices not yet ported (materials/services/aggregation pending)");
  }

  return { computePrices, computeMaterials, computeServiceCosts };
}
