// src/logic/offerMapping.js
import dayjs from "dayjs";
import cfg from '../services/configService.js';

// ---------------- Helpers (copied from docx-template.js) ----------------

export function toBoolish(v) {
  if (v === true || v === 1) return true;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "ja" || s === "on" || s === "1" || s === "yes";
  }
  return false;
}

export function getPath(body, pathLike) {
  if (!body) return undefined;

  // direct hit first (handles flat payloads like {"duschwanne.ebenerdigeMontage":"on"})
  if (pathLike in body) return body[pathLike];

  // normalize to dot notation
  const norm = pathLike
    .replace(/\[(\w+)\]/g, ".$1") // a[b] -> a.b
    .replace(/\.\./g, ".")
    .replace(/^\./, "");

  return norm
    .split(".")
    .reduce(
      (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
      body,
    );
}

export function firstDefined(body, keys) {
  for (const k of keys) {
    const v = getPath(body, k);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function fmtCurrency(n) {
  if (n === "" || n === null || n === undefined) return "";
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

export function fmtDateDE(input) {
  // accepts '', 'YYYY-MM-DD', Date, etc. -> 'DD.MM.YYYY'
  const d = input ? dayjs(input) : dayjs();
  return d.isValid() ? d.format("DD.MM.YYYY") : "";
}

// ---------------- mapData (unchanged logic, exported) ----------------

export function mapOfferToDocxData(body = {}, computed = {}) {
  const b = body.Kundendaten || {};
  const tb = body.textbausteine || {};
  const bwt = body.bwt || {};
  const arbeits = body.Arbeitszeit || {};

  const offerDate = b.date ? dayjs(b.date) : dayjs();
  const validityDate = offerDate.add(cfg.get('OFFER_VALIDITY_WEEKS', 8), 'week');
  const ValidityDateFormatted = validityDate.isValid() 
    ? validityDate.format('DD.MM.YYYY') 
    : '';

  // ---- Extra Arbeitszeit (Arbeitszeit page) ----
  const rawExtraTasks = Array.isArray(arbeits.extraTasks)
    ? arbeits.extraTasks
    : [];

  const ExtraAzTasks = rawExtraTasks
    .map((row) => {
      if (!row) return null;
      const txt = String(row.task || "").trim();
      if (!txt) return null;
      return { Text: txt };
    })
    .filter(Boolean);

  // ---- Ebenerdig Hinweis ----
  const ebRaw = firstDefined(body, [
    "duschwanne.ebenerdigNote",
    "duschwanne.ebenerdigeMontage",
    "duschwanne.ebenerdige_montage",
    "duschwanne.ebenerdig",
    "duschwanne[ebenerdigNote]",
    "duschwanne[ebenerdigeMontage]",
    "duschwanne[ebenerdige_montage]",
    "duschwanne[ebenerdig]",
    "ebenerdigNote",
    "ebenerdigeMontage",
    "ebenerdige_montage",
    "ebenerdig",
  ]);

  const EbenerdigHinweis = toBoolish(ebRaw) ? [{}] : [];
  console.log("[DOCX] Ebenerdig raw:", ebRaw, "-> show?", !!toBoolish(ebRaw));

  // ---- Pull fields from computed pricing ----
  const {
    items = [],
    productsSubtotal = 0,
    materials = { title: "", lines: [], sum: 0 },
    services = {
      title: "",
      lines: [],
      sum: 0,
      payer: "",
      zoneLabel: "",
      distanceKm: 0,
      laborHours: 0,
      laborRate: 0,
    },

    netAfterRabatt_and_Bonus = 0,
    markupPct = 0,
    markup = 0,
    travel = 0,
    total = 0,
    vatOnNet = 0,
    totalAfterRabatt = 0,
    rabattAmount = 0,
    bonusGross = 0,
    totalAfterBonus = 0,

    subsidyAmount = 0,
    selfPayAmount = 0,
    material_plus_aufschlag = 0,
  } = computed || {};

  // Prefer display copies if present
  const mat = computed?.materialsDisplayDocx?.lines || materials?.lines || [];
  const svc = computed?.servicesDisplayDocx?.lines || services?.lines || [];

  const Nettobetrag = fmtCurrency(computed?.netAfterRabatt_and_Bonus ?? 0);
  const Rabatt = fmtCurrency(rabattAmount);
  const MwSt = fmtCurrency(computed?.vatOnNet ?? 0);
  const Gesamtsumme = fmtCurrency(computed?.total ?? 0);
  const Gesamtsummerabatt = fmtCurrency(totalAfterRabatt);

  const Selbstkostenanteil = "";

  const MarkupPctStr = markupPct ? `${Math.round(markupPct * 100)}%` : "";
  const MarkupValue = fmtCurrency(markup);
  const TravelValue = fmtCurrency(travel);

  // ---- Services split into primary + included ----
  const svcForDoc = [
    ...(computed.servicesDisplayDocx?.lines || computed.services?.lines || []),
  ];

  // VIGOUR CL60 logic etc. (copied exactly)
  {
    const parseQty = (v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      const m = String(v ?? "").match(/[\d.,]+/);
      return m ? parseFloat(m[0].replace(",", ".")) || 0 : 0;
    };

    const sources = [
      Array.isArray(computed?.materialsDisplayDocx?.lines)
        ? computed.materialsDisplayDocx.lines
        : null,
      Array.isArray(computed?.materials?.lines)
        ? computed.materials.lines
        : null,
      Array.isArray(body?.materials) ? body.materials : null,
    ].filter(Boolean);

    let cl60Qty = 0;
    for (const src of sources) {
      let sum = 0;
      for (const row of src) {
        const text = [
          row?.name,
          row?.label,
          row?.description,
          row?.title,
          row?.productId,
          row?.model,
        ]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        if (text.includes("vigour") && /\bcl\s*60\b/.test(text)) {
          sum += parseQty(row?.qty ?? row?.quantity ?? row?.menge ?? 1);
        }
      }
      if (sum > 0) {
        cl60Qty = sum;
        break;
      }
    }

    if (cl60Qty === 0) {
      const list = Array.isArray(computed?.items)
        ? computed.items
        : Array.isArray(items)
          ? items
          : [];
      for (const it of list) {
        const s = [it?.name, it?.title, it?.label, it?.model]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        if (s.includes("vigour") && /\bcl\s*60\b/.test(s)) {
          cl60Qty += parseQty(it?.qty ?? it?.quantity ?? 1);
        }
      }
    }

    if (cl60Qty > 0) {
      const singular = "Anbringen zusätzliches Waschbeckens ohne Unterschrank";
      const plural = "Anbringen zusätzlicher Waschbecken ohne Unterschrank";
      const target = cl60Qty === 1 ? singular : plural;

      const waschRegex =
        /^\s*-?\s*auswechseln\s+eines\s+waschtisches(?:\s+ohne\s+unterschrank)?/i;
      for (const l of svcForDoc) {
        const lbl = String(l?.label || "");
        if (waschRegex.test(lbl)) {
          l.label = target;
          break;
        }
      }
    }

    console.log("[svc] VIGOUR CL60 qty (aggregated):", cl60Qty);
  }

  const primary = [];
  const included = [];

  for (const l of svcForDoc) {
    if (!l || l.docxHide) continue;

    const label = String(l.label || "").trim();
    const bullet = label.startsWith("-") ? label : `- ${label}`;
    const plain = label.replace(/^\s*-\s*/, "");

    const goesIncluded =
      /fahrzeugbereitstellung/i.test(plain) ||
      /bereitstellung.*werkzeug/i.test(plain) ||
      /beräumung der baustelle/i.test(plain) ||
      /kilometerpauschale/i.test(plain) ||
      /facharbeiter/i.test(plain);

    if (goesIncluded) {
      included.push(bullet);
    } else {
      primary.push(bullet);
    }
  }

  const PrimaryServiceLines = primary.map((txt) => ({
    ServiceLine: txt,
  }));
  const IncludedServiceLines = included.map((txt) => ({
    ServiceLine: txt,
  }));
  const HasIncluded = included.length > 0;

  const ServicePosTitle = services?.title || "Auszuführende Arbeiten";
  const ServiceUnitPrice = fmtCurrency(services?.sum || 0);
  const ServiceTotal = fmtCurrency(services?.sum || 0);

  // ---- Materials block ----
  const MaterialsPosTitle = materials?.title || "Material für Badumbau";
  const MaterialsUnitPrice = fmtCurrency(material_plus_aufschlag || 0);
  const MaterialsTotal = fmtCurrency(material_plus_aufschlag || 0);

  const matForDoc =
    computed.materialsDisplayDocx?.lines || computed.materials?.lines || [];
  const MaterialsLines = matForDoc.map((l) => {
    const qtyStr = Number(l.qty || 0)
      .toFixed(2)
      .replace(/\.00$/, "");
    const nameOrId = l.name || l.productId || "";
    return {
      MaterialLine: l.label ? l.label : `- ${qtyStr} Stk ${nameOrId}`,
    };
  });

  const PayerKind = services?.payer || b.payer || "";

  // ---- BWT-specific mapping (unchanged from docx-template) ----
  const offerKey =
    body.activeOffer || body.currentOfferKey || computed.activeOffer || "";

  let BwtRows = [];

  if (offerKey === "bwt") {
    const docxLines = Array.isArray(computed?.materialsDisplayDocx?.lines)
      ? computed.materialsDisplayDocx.lines
      : Array.isArray(materials?.lines)
        ? materials.lines
        : [];

    const findLine = (id) =>
      docxLines.find((l) => String(l.productId || l.id || "").trim() === id);

    const formatQty = (q) => {
      const n = Number(q || 0);
      if (!Number.isFinite(n) || n <= 0) return "";
      const base = n.toFixed(2).replace(/\.00$/, "");
      return `${base} Stk`;
    };

    const formatPlain = (q) => {
      const n = Number(q || 0);
      if (!Number.isFinite(n) || n <= 0) return "";
      return n.toFixed(2).replace(".", ",");
    };

    const doorProductIds = ["1226", "1225", "1228", "1320", "1227"];
    const doorLines = docxLines.filter((l) =>
      doorProductIds.includes(String(l.productId || l.id || "").trim()),
    );
    const doorQty = doorLines.reduce(
      (sum, l) => sum + (Number(l.qty || 0) || 0),
      0,
    );
    const hasDoor = doorQty > 0;
    const doorMaterialsTotal = doorLines.reduce(
      (sum, l) => sum + (Number(l.lineTotal || 0) || 0),
      0,
    );

    const DOOR_VARIANTS = [
      {
        key: "bwtDoorStdQty",
        label: "Universal / Standard Tür",
      },
      {
        key: "bwtDoorBudgetQty",
        label: "Budget Tür",
      },
      {
        key: "bwtDoorIndWienGlasQty",
        label: "Individuelle Tür Wien Glas",
      },
      {
        key: "bwtDoorVariodoorQty",
        label: "Variodoor",
      },
      {
        key: "bwtDoorIndWienQty",
        label: "Individuelle Tür Wien",
      },
    ];

    const doorLabelParts = [];
    DOOR_VARIANTS.forEach((v) => {
      const q = Number(bwt?.[v.key] || 0) || 0;
      if (q > 0) doorLabelParts.push(v.label);
    });

    let doorVariantText = "";
    if (doorLabelParts.length === 1) {
      doorVariantText = doorLabelParts[0];
    } else if (doorLabelParts.length > 1) {
      doorVariantText = doorLabelParts.join(", ");
    }

    let bullet1Text = "Liefern und Montieren einer Badewannentür";
    if (doorVariantText) {
      bullet1Text = `Liefern und Montieren einer Badewannentür (${doorVariantText})`;
    }

    const enthDoorLabel = doorVariantText || "Universal / Standard Tür";

    const grabIds = ["CLPESG40", "CLPESG60", "CLPESG80"];
    const grabLines = docxLines.filter((l) =>
      grabIds.includes(String(l.productId || l.id || "").trim()),
    );

    const extraLines = docxLines.filter(
      (l) => String(l.source || "").trim() === "BWT_EXTRA",
    );

    const additionalLines = [...grabLines, ...extraLines];

    const EnthExtraItems = additionalLines.map((line) => {
      const rawLabel = String(line.label || "").trim();
      const cleaned = rawLabel.replace(/^-\s*/, "");
      return { Text: cleaned };
    });

    const grabLabelMap = {
      CLPESG40: "Haltegriff 40 cm",
      CLPESG60: "Haltegriff 60 cm",
      CLPESG80: "Haltegriff 80 cm",
    };

    const grabLabelsUnique = [
      ...new Set(
        grabLines
          .map((l) => {
            const id = String(l.productId || l.id || "").trim();
            return grabLabelMap[id] || "";
          })
          .filter(Boolean),
      ),
    ];

    let bullet7Text = "";
    if (grabLabelsUnique.length === 1) {
      bullet7Text = `Montage ${grabLabelsUnique[0]}`;
    } else if (grabLabelsUnique.length > 1) {
      const sizes = grabLabelsUnique.map((t) => t.replace("Haltegriff ", ""));
      bullet7Text = `Montage Haltegriffe (${sizes.join(", ")})`;
    }

    const hasAnyGrab = grabLines.length > 0;

    if (hasDoor) {
      const roundTripKm = Number(services?.distanceKm || 0);
      const EnthKmQty = formatPlain(roundTripKm);
      const doorQtyPlain = formatPlain(doorQty);

      BwtRows.push({
        Pos: "001",
        Menge: formatQty(doorQty),
        Einheitspreis: fmtCurrency(netAfterRabatt_and_Bonus),
        Gesamt: fmtCurrency(netAfterRabatt_and_Bonus),
        Title: "Liefern und Montieren einer Badewannentür",
        Bullet1: bullet1Text,
        Bullet2: "inkl. dazugehörige Materialien",
        Bullet3: "inkl. An- & Abfahrten / Dieselzuschlag",
        Bullet4: "inkl. Bereitstellung Maschinen / Werkzeug",
        Bullet5: "inkl. Vorhaltung und Beräumung der Baustelle",
        Bullet6: "inkl. Lieferkosten",
        HasBullet7: !!bullet7Text,
        Bullet7: bullet7Text,
        HasExtraTasks: ExtraAzTasks.length > 0,
        ExtraTasks: ExtraAzTasks,
        EnthKmQty,
        EnthDeliverQty: doorQtyPlain,
        EnthDoorQty: doorQtyPlain,
        EnthDoorLabel: enthDoorLabel,
        EnthKleinQty: doorQtyPlain,
        EnthExtraItems,
      });
    }
  }

  // ---- Zuschuss / Selbstkosten ----
  const toNum = (v) =>
    typeof v === "number" ? v : Number(String(v || "").replace(",", ".")) || 0;

  const subsidyAmountNum = toNum(computed?.subsidyAmount);
  const selfPayAmountNum = toNum(computed?.selfPayAmount);

  const SelbstkostenanteilFmt = fmtCurrency(selfPayAmountNum);
  const Zuschusskrankenkasse = fmtCurrency(subsidyAmountNum);
  const hasZuschuss = subsidyAmountNum > 0;

  const payerNorm = String(PayerKind || "").toUpperCase();
  const isKK = payerNorm === "KK" || payerNorm === "KASSENKUNDE";
  const isSZ = payerNorm === "SZ" || payerNorm === "SELBSTZAHLER";

  const BASE_SELF_PAY_SENTENCE =
    "Dieser wird bei Auftragsbestätigung vorab fällig.";

  const PARA_kk_uber2000_LINES = [
    "Zahlungsbedingungen für den Selbstkostenanteil:",
    "- 100 % sofort abzüglich 2 % Skonto oder",
    "- 50 % sofort und 50 % nach Fertigstellung, ohne Abzug",
    "Für die Anzahlung wird eine Anzahlungsrechnung erstellt. Die Überweisung darf erst nach Erhalt dieser Rechnung erfolgen.",
  ];

  const PARA_kk_unter2000_LINES = [
    "Zahlungsbedingungen für den Selbstkostenanteil:",
    "100 % sofort bei Auftragsbestätigung – ohne Abzug",
    "Für die Anzahlung wird eine Anzahlungsrechnung erstellt. Die Überweisung darf erst nach Erhalt dieser Rechnung erfolgen.",
  ];

  let SelfPayLines = [{ Text: BASE_SELF_PAY_SENTENCE, IsTitle: false }];

  if (isKK && selfPayAmountNum > 0) {
    const src =
      selfPayAmountNum >= cfg.get('KK_PAYMENT_THRESHOLD', 2000)
        ? PARA_kk_uber2000_LINES
        : PARA_kk_unter2000_LINES;

    SelfPayLines = src.map((text, idx) => ({
      Text: text,
      IsTitle: idx === 0,
    }));
  }

  let regieRateNum;
  if (isKK) regieRateNum = cfg.get('LABOR_RATE_KK', 69.5);
  else if (isSZ) regieRateNum = cfg.get('LABOR_RATE_SZ', 59.5);
  else regieRateNum = Number(services?.laborRate) || 0;

  const RegieRateFmt = regieRateNum
    ? `${regieRateNum.toFixed(2).replace(".", ",")}€`
    : "";

  // --- Rabatt + Bonus detection ---
  const hasRabatt = (rabattAmount ?? 0) > 0;
  const hasBonus = (bonusGross ?? 0) > 0;

  const pricingFlags = computed?.flags || {};
  const payloadRabatt = body?.rabatt || {};

  const hasBonusGrab = Boolean(
    pricingFlags.bonusGrab ?? payloadRabatt.bonusGrab ?? false,
  );
  const hasBonus300 = Boolean(
    pricingFlags.bonus300 ?? payloadRabatt.bonus300 ?? false,
  );

  const BonusRows = [];
  let pos = "003";

  if (hasBonusGrab) {
    BonusRows.push({
      Bonus: pos,
      BonusMenge: "1 Stk",
      BonusLabel: "Aktion: Haltegriff",
      BonusDetail:
        "1 Haltegriff gratis im Wert von 175 € inkl. Lieferung und Montage",
      preis: "0,00 €",
      gesamt: "0,00 €",
    });
    pos = "004";
  }

  if (hasBonus300) {
    BonusRows.push({
      Bonus: pos,
      BonusMenge: "1 Stk",
      BonusLabel: "Bestandkundenbonus:",
      BonusDetail: "-- Rabatt von 300 € ab einem Gesamtwert von 3.000",
      preis: `-${cfg.get('BONUS_NEW_CUSTOMER_GROSS', 252.1).toFixed(2).replace('.', ',')} €`,
      gesamt: `-${cfg.get('BONUS_NEW_CUSTOMER_GROSS', 252.1).toFixed(2).replace('.', ',')} €`,
    });
  }

  const hasBonusrows = BonusRows.length > 0;

  const baseTotals = [
    {
      label: "Nettobetrag",
      value: fmtCurrency(netAfterRabatt_and_Bonus),
    },
    {
      label: "zzgl. 19% MwSt.",
      value: fmtCurrency(vatOnNet),
    },
    {
      label: "Gesamtsumme",
      value: fmtCurrency(total),
    },
  ];

  const Totals = baseTotals.map((r, i) => ({
    ...r,
    isAlt: i % 2 === 0,
  }));

  const ZoneChosen = services?.zoneLabel || "";
  // eslint-disable-next-line no-constant-binary-expression
  const DistanceKm = services?.distanceKm ?? Number(b.distanceKm ?? 0) ?? 0;
  // eslint-disable-next-line no-constant-binary-expression
  const LaborHours = services?.laborHours ?? Number(b.laborHours ?? 0) ?? 0;
  const LaborRate = services?.laborRate ?? 0;

  // ---- BWT free text / notes ----
  const BwtFreeText = (bwt.bwtNote || "").trim();
  const BwtSteelNoteEnabled =
    bwt.bwtSteelNoteEnabled === true || bwt.bwtSteelNoteEnabled === "on";
  const BwtSteelNote = BwtSteelNoteEnabled
    ? (bwt.bwtSteelNoteText || "").trim()
    : "";
  const BwtProxyNoteEnabled =
    bwt.bwtProxyNoteEnabled === true || bwt.bwtProxyNoteEnabled === "on";
  const BwtProxyNote = BwtProxyNoteEnabled
    ? (bwt.bwtProxyNoteText || "").trim()
    : "";

  // ---------------- Final data object ----------------

  return {
    // Address / meta
    Anrede: b.salutation || "",
    Vorname: b.firstName || "",
    Nachname: b.lastName || "",
    PartnerVorname: b.partnerFirstName || "",
    PartnerNachname: b.partnerLastName || "",
    PflegegradKunde: b.pflegegrad || "",
    PflegegradPartner: b.partnerPflegegrad || "",
    KrankenkasseKunde: b.kassenkundeName || "",
    KrankenkassePartner: b.partnerKassenkundeName || "",
    Adresse: b.street || "",
    Stadt: b.city || "",
    PLZ: b.postalCode || "",
    Datum: fmtDateDE(b.date),
    ValidityDate: ValidityDateFormatted, 
    Ansprechpartner: (b.emc2_contact || "").trim(),
    Kundennummer: b.customerNumber || "",
    Greeting:
      b.salutation === "Frau"
        ? "Sehr geehrte Frau"
        : b.salutation === "Herr"
          ? "Sehr geehrter Herr"
          : b.salutation === "Familie"
            ? "Sehr geehrter Familie"
            : "Guten Tag",
    Angebotsnummer: body.offerNumber || `ANG-${Date.now()}`,
    PflegekasseAntrag: b.pflegekasseAntrag || "",
    PflegekasseGenehmigung: b.pflegekasseGenehmigung || "",
    PflegekasseEmc2Antrag: b.pflegekasseEmc2Antrag || "",
    Wohnsituation: b.wohnsituation || "",
    VermieterGenehmigung: b.vermieterGenehmigung || "",
    Wohnungszugang: b.wohnungszugang || "",
    StockwerkBad:
      b.stockwerkBad === "Sonstiges"
        ? (b.stockwerkBadSonst || "")
        : (b.stockwerkBad || ""),
    ParkenMoeglich: b.parkenMoeglich || "",
    ParksituationHinweis: b.parksituationHinweis || "",

    // Legacy/optional price fields
    Arbeit: fmtCurrency(services?.sum ?? 0),
    Material: fmtCurrency(materials?.sum ?? 0),

    // Text blocks
    Long1: tb.long1 ?? "",
    Long3: tb.long3 ?? "",
    Long: tb.long ?? "",

    // Totals (single placeholders)
    Nettobetrag,
    Rabatt,
    MwSt,
    Gesamtsumme,
    Selbstkostenanteil,
    Zuschusskrankenkasse,
    Gesamtsummerabatt,

    // Computed summary
    Nettobetrag2: fmtCurrency(netAfterRabatt_and_Bonus), // if you need a separate field
    MarkupPct: MarkupPctStr,
    MarkupValue,
    TravelValue,

    // Items
    Items: (items || []).map((i) => ({
      ProduktId: i.productId,
      Menge: i.qty,
      Einzelpreis: fmtCurrency(i.unitPrice),
      Zwischensumme: fmtCurrency(i.lineTotal),
    })),
    ProdukteZwischensumme: fmtCurrency(productsSubtotal),

    // Services
    ServicePosTitle,
    ServiceUnitPrice,
    ServiceTotal,
    PrimaryServiceLines,
    IncludedServiceLines,
    HasIncluded,

    // Materials
    MaterialsPosTitle,
    MaterialsUnitPrice,
    MaterialsTotal,
    MaterialsLines,

    // Meta from services
    PayerKind,
    ZoneChosen,
    DistanceKm,
    LaborHours,
    LaborRate: LaborRate ? `${LaborRate.toFixed(2)} €` : "",

    hasRabatt,
    hasBonus,
    hasBonusrows,
    Totals,
    BonusRows,

    SelbstkostenanteilFmt,
    hasSubsidyLine: hasZuschuss,

    SelfPayLines,
    RegieRateFmt,
    EbenerdigHinweis,

    // BWT
    BwtRows,
    BwtFreeText,
    BwtSteelNote,
    BwtSteelNoteEnabled,
    BwtProxyNote,
    BwtProxyNoteEnabled,
  };
}
