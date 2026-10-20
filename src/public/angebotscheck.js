/**
 * Angebotscheck — rule-based plausibility check of the current offer.
 *
 * BU only. Results are grouped by the same sections BU uses elsewhere
 * (Arbeiten / Material / Optionale Produkte), so every row points at the page
 * that fixes it — clicking a row goes there without touching the form.
 *
 * Every applicable rule produces one row, including the ones that pass: a
 * green row is the proof that the check looked. A rule that does not apply to
 * this offer (its work task is not ticked) produces nothing at all.
 *
 * Status per row, per group and overall: "gruen" | "gelb" | "rot" (worst wins).
 */

const RANK = { gruen: 0, gelb: 1, rot: 2 };
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

export const GROUPS = [
  { key: "arbeiten", title: "Auszuführende Arbeiten", target: "Arbeiten" },
  { key: "material", title: "Material für Badumbau", target: "Duschwanne" },
  { key: "optional", title: "Optionale Produkte", target: "Optional" },
];

const lines = (x) => (Array.isArray(x?.lines) ? x.lines : []);
const total = (l) => Number(l?.lineTotal) || 0;
const name = (l) => String(l?.label || l?.name || l?.productId || "Position");
const hasCategory = (ls, cat) =>
  ls.some((l) => String(l?.category || "").toLowerCase() === cat.toLowerCase());
const idOf = (l) => String(l?.productId || l?.id || "");
const inCategory = (l, cat) =>
  !cat || String(l?.category || "").toLowerCase() === cat.toLowerCase();

/** Summed quantity of one article in the priced material (optionally per category). */
const lineQty = (materials, pid, cat) =>
  lines(materials)
    .filter((l) => idOf(l) === pid && inCategory(l, cat))
    .reduce((n, l) => n + (Number(l?.qty) || 0), 0);

/** A Wandverkleidung line — the Fußboden uses the same Flächenkleber article. */
const wvLine = (materials, pid) => lineQty(materials, pid, "Wandverkleidung") > 0;

/** Wandverkleidung panels in the offer (V3WV… / V3WVK…, colour variants included). */
const wvPanels = (materials) =>
  lines(materials)
    .filter((l) => /^V3WV/i.test(idOf(l)) && inCategory(l, "Wandverkleidung"))
    .reduce((n, l) => n + (Number(l?.qty) || 0), 0);

/**
 * Article numbers actually in the offer (material + optional lines).
 * Waschtisch and WC read these instead of the checkboxes: after reopening an
 * offer the boxes do not always reflect it (a WC seat is ticked under its pair
 * alias, not its own box); the priced lines are what the offer contains.
 */
const pricedIds = ({ materials, optionals }) =>
  new Set([...lines(materials), ...lines(optionals)].map(idOf));

const WC_WALL = ["DERWWCOSVP", "DEDWWC", "CLPWWCOS5"];
const WC_FLOOR = ["CLPWCF10"];
/** "wall" | "floor" | null — which kind of WC is in the offer. */
const wcKind = (ctx) => {
  const ids = pricedIds(ctx);
  if (WC_WALL.some((p) => ids.has(p))) return "wall";
  if (WC_FLOOR.some((p) => ids.has(p))) return "floor";
  return null;
};

const BASINS = ["CL60", "CL65", "CL55", "ON35", "COAIR40", "DEP65U"];
const BASIN_ACC = [
  ["WTBF", "Befestigungssatz (WTBF)"],
  ["RSL", "Röhrensiphon (RSL)"],
  ["EV", "Eckventil (EV)"],
];

/**
 * Standing checks — they apply to every offer.
 *
 * `test(ctx)` returns nothing when the rule passes, or the problem text (one
 * string, or one per offending line). ctx = { services, materials, optionals }.
 */
export const RULES = [
  {
    id: "arbeiten-leer",
    group: "arbeiten",
    title: "Arbeitspositionen erfasst",
    severity: "rot",
    test: ({ services }) =>
      lines(services).length === 0 && "Keine Arbeitsposition erfasst.",
  },
  {
    id: "arbeiten-ohne-preis",
    group: "arbeiten",
    title: "Arbeitspositionen bepreist",
    severity: "gelb",
    test: ({ services }) =>
      lines(services).length > 0 &&
      Number(services?.sum) <= 0 &&
      "Arbeitspositionen vorhanden, aber Summe ist 0,00 €.",
  },
  {
    id: "anfahrt-fehlt",
    group: "arbeiten",
    target: "Arbeitszeit",
    title: "Anfahrt erfasst",
    severity: "rot",
    needsSelection: true,
    test: ({ sel }) =>
      !(Number(sel.value("distanceKm").replace(",", ".")) > 0) &&
      "Keine Entfernung zum Kunden eingetragen.",
  },
  {
    id: "reisezeit-fehlt",
    group: "arbeiten",
    target: "Arbeitszeit",
    title: "Reisezeit erfasst",
    severity: "rot",
    needsSelection: true,
    test: ({ sel }) =>
      !/[1-9]/.test(sel.value("travelTime")) &&
      "Keine Reisezeit (Hin-Fahrt) eingetragen.",
  },
  {
    id: "material-leer",
    group: "material",
    title: "Material erfasst",
    severity: "rot",
    test: ({ materials }) =>
      lines(materials).length === 0 && "Kein Material erfasst.",
  },
  {
    id: "material-ohne-artikelid",
    group: "material",
    title: "Alle Positionen mit Artikel-ID",
    severity: "gelb",
    test: ({ materials }) =>
      lines(materials)
        .filter((l) => !l.productId && !l.id)
        .map((l) => `Ohne Artikel-ID: ${name(l)}`),
  },
  {
    id: "material-ohne-preis",
    group: "material",
    title: "Alle Positionen bepreist",
    severity: "gelb",
    test: ({ materials }) =>
      lines(materials)
        .filter((l) => total(l) <= 0)
        .map((l) => `Preis 0,00 €: ${name(l)}`),
  },
  {
    // The Duschwanne switch is off. Only a hint — plenty of Badumbau offers
    // have no tray (Badewanne, Wanne bleibt) — unless the old tray is being
    // removed, then the missing replacement is worth a closer look.
    // "Einbau der Duschwanne" ticked with the switch off is red, but that row
    // belongs to the work-task coupling, so this one steps aside.
    id: "duschwanne-aus",
    group: "material",
    target: "Duschwanne",
    title: "Duschwanne im Angebot",
    severity: "gelb",
    needsSelection: true,
    applies: ({ sel }) =>
      sel.trayEnabled() === false && !sel.tasks.has("install_tray"),
    test: ({ sel }) =>
      sel.tasks.has("remove_showertub")
        ? "Alte Duschwanne wird entfernt, aber keine neue Duschwanne im Angebot."
        : "Keine Duschwanne im Angebot.",
  },
  {
    // Everything a tray needs to actually be installed. Adding a fifth item
    // is one line here.
    id: "duschwanne-zubehoer",
    group: "material",
    target: "Duschwanne",
    title: "Zubehör zur Duschwanne vollständig",
    severity: "rot",
    needsSelection: true,
    applies: ({ sel, materials }) => {
      const on = sel.trayEnabled();
      if (on !== null) return on; // the switch decides whether a tray is in play
      return sel.tasks.has("install_tray") || hasCategory(lines(materials), "Duschwanne");
    },
    test: ({ sel }) =>
      [
        ["TRWDB", "Wannenabdichtband-Set"],
        ["AGD9060", "Ablaufgarnitur"],
        ["KM02", "Kleinmaterial"],
        ["PLA5282", "Stelzlager höhenverstellbar Set"],
      ]
        // Matched by data-product-id: only the Kleinmaterial box carries an
        // id attribute, the other three have none.
        .filter(([pid]) => !sel.product(pid))
        .map(([, label]) => `Nicht gewählt: ${label}.`),
  },
  {
    // Wandverkleidung — the three consumables every installation needs. Read
    // from the priced lines, not the boxes: Silikon is ticked by default but
    // its quantity follows the Abschlussprofil, so it can sit ticked at 0.
    id: "wandverkleidung-zubehoer",
    group: "material",
    target: "Wandverkleidung",
    title: "Zubehör zur Wandverkleidung vollständig",
    severity: "rot",
    applies: ({ materials }) => wvPanels(materials) > 0,
    test: ({ materials, sel }) => {
      const missing = [];
      if (!wvLine(materials, "TRWDSET5")) missing.push("Nicht im Angebot: Wandabdichtung BASIS-Set.");
      if (!wvLine(materials, "R_4260602")) missing.push("Nicht im Angebot: Flächenkleber.");
      if (!lineQty(materials, "2000302")) {
        missing.push(
          sel?.ticked("wvSilikonSelected")
            ? "Silikon: Menge 0 — folgt der Menge des Abschlussprofils."
            : "Nicht im Angebot: Silikon.",
        );
      }
      return missing;
    },
  },
  {
    // Not sure-fire enough to be red: a panel run can end flush in a corner.
    id: "wandverkleidung-abschlussprofil",
    group: "material",
    target: "Wandverkleidung",
    title: "Abschlussprofil im Angebot",
    severity: "gelb",
    applies: ({ materials }) => wvPanels(materials) > 0,
    test: ({ materials }) =>
      !wvLine(materials, "V3A") &&
      "Kein Abschlussprofil im Angebot — bitte Menge eintragen.",
  },
  {
    // Same count pricing uses when the field is left empty:
    // panels − 1 − outside corners.
    id: "wandverkleidung-verbindungsprofil",
    group: "material",
    target: "Wandverkleidung",
    title: "Verbindungsprofile ausreichend",
    severity: "gelb",
    needsSelection: true,
    applies: ({ materials }) => wvPanels(materials) > 0,
    test: ({ materials, sel }) => {
      const corners = Number(sel.value("wvCornersCount")) || 0;
      const needed = Math.max(0, wvPanels(materials) - 1 - corners);
      const have = lineQty(materials, "V3V", "Wandverkleidung");
      return (
        have < needed &&
        `${needed} Verbindungsprofil(e) nötig (Platten − 1 − Außenecken), ${have} im Angebot.`
      );
    },
  },
  {
    // Every basin needs its fixing set, siphon and angle valve. They are
    // ticked automatically with the basin but can be unticked again.
    id: "waschtisch-zubehoer",
    group: "optional",
    target: "Optional",
    title: "Zubehör zum Waschtisch vollständig",
    severity: "rot",
    // A catalog basin in the offer, a ticked basin tile (also covers the
    // Sonderprodukt, whose line id is whatever was typed), or its accessories.
    applies: (ctx) => {
      const ids = pricedIds(ctx);
      return (
        BASINS.some((p) => ids.has(p)) ||
        !!ctx.sel?.opt("optBasin[]") ||
        BASIN_ACC.some(([p]) => ids.has(p))
      );
    },
    test: (ctx) => {
      const ids = pricedIds(ctx);
      return BASIN_ACC.filter(([p]) => !ids.has(p)).map(
        ([, label]) => `Nicht im Angebot: ${label}.`,
      );
    },
  },
  {
    // A new wall-hung WC needs its frame and fittings. Mounting a new bowl on
    // an existing frame does not — that is what "Nicht nötig" is for (in past
    // offers roughly every fourth wall WC came without them).
    id: "wc-zubehoer",
    group: "optional",
    target: "Optional",
    title: "Zubehör zum WC vollständig",
    severity: "rot",
    ackable: true,
    applies: (ctx) => wcKind(ctx) !== null,
    test: (ctx) => {
      const ids = pricedIds(ctx);
      const kind = wcKind(ctx);
      const required =
        kind === "wall"
          ? [
              ["CVIS3WCT112", "WC-Element"],
              ["SCHALL", "Montageset"],
              ["V1DON", "Betätigungsplatte"],
              ["0601010003", "Gipskarton-Bauplatte"],
              ["WWCAG90", "Anschlussgarnitur"],
            ]
          : [
              ["WCBF", "Befestigungssatz (WCBF)"],
              ["CLPSSI", "WC-Sitz für Stand-WC"],
              ["WWCAG90", "Anschlussgarnitur"],
            ];
      const missing = required
        .filter(([pid]) => !ids.has(pid))
        .map(([, label]) => `Nicht im Angebot: ${label}.`);
      if (kind === "wall" && !ids.has("DERSIAS") && !ids.has("CLSIAS")) {
        missing.push("Nicht im Angebot: WC-Sitz.");
      }
      return missing;
    },
  },
  {
    // Whether a Verbreiterungsprofil is needed depends on the measured niche,
    // which the configurator does not know — so only a reminder, and the user
    // can confirm it is not needed.
    id: "duschabtrennung-verbreiterung",
    group: "material",
    target: "DuschabtrennungNeu",
    title: "Verbreiterungsprofil geprüft",
    severity: "gelb",
    ackable: true,
    needsSelection: true,
    applies: ({ sel }) => sel.daVigour(),
    test: ({ sel }) =>
      !sel.daLines().some((l) => /^VZVP/i.test(String(l?.articleNumber || ""))) &&
      "Kein Verbreiterungsprofil gewählt — nötig, wenn die Nische breiter ist als die Abtrennung.",
  },
  {
    id: "duschwanne-ohne-abtrennung",
    group: "material",
    title: "Duschwanne mit Abtrennung",
    severity: "gelb",
    test: ({ materials }) => {
      const ls = lines(materials);
      return (
        hasCategory(ls, "Duschwanne") &&
        !hasCategory(ls, "Duschabtrennung") &&
        "Duschwanne ohne Duschabtrennung/Duschvorhang."
      );
    },
  },
  {
    id: "optional-ohne-menge",
    group: "optional",
    title: "Optionale Produkte mit Menge",
    severity: "gelb",
    test: ({ optionals }) =>
      lines(optionals)
        .filter((l) => Number(l?.qty) <= 0)
        .map((l) => `Menge 0: ${name(l)}`),
  },
];

/* ------------------------------------------------- Arbeit ⇄ Produkt rules */

/**
 * Couples one work task to the selection it requires. Both directions are
 * checked: a ticked task without its product, and a product without the task
 * that would install it.
 *
 * A pair is only looked at when one of its two sides is actually selected.
 */
export const WORK_RULES = [
  // --- hard couplings -------------------------------------------------
  {
    task: "replace_thermostat",
    label: "Auswechseln eines Aufputz-Thermostats",
    needs: "Produkt aus „Austausch eines Thermostates“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.opt("optThermo[]"),
  },
  {
    task: "replace_shower_no_thermo",
    label: "Auswechseln des Duschsystems ohne Thermostat",
    needs: "Produkt aus „Auswechseln des Duschsystems“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.opt("optShower[]"),
    // Shares its product group with the task below — a Duschsystem product
    // satisfies either one, so neither may report the other as orphaned.
    sharesWith: ["replace_shower_with_thermo"],
  },
  {
    // One product covers system + thermostat (confirmed) — no extra Thermostat.
    task: "replace_shower_with_thermo",
    label: "Auswechseln des Duschsystems inkl. Aufputz-Thermostat",
    needs: "Produkt aus „Auswechseln des Duschsystems“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.opt("optShower[]"),
    sharesWith: ["replace_shower_no_thermo"],
  },
  {
    task: "replace_sink_faucet",
    label: "Auswechseln einer Waschbecken-Armatur",
    needs: "Produkt aus „Einhand-Waschtischbatterie“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.opt("optBasinTap[]"),
  },
  {
    task: "install_sink",
    label: "Einbau eines Waschbeckens",
    needs: "Produkt aus „Waschtisch ohne Unterschrank“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    // The box, or the priced basin — the priced line is what the offer contains.
    has: (sel) => sel.opt("optBasin[]") || BASINS.some((p) => sel.priced(p)),
  },
  {
    task: "install_shower_basket",
    label: "Einbau eines Duschkorbes",
    needs: "Produkt aus „Duschzubehör“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.opt("optDuschzub[]"),
  },
  {
    task: "install_bathtub",
    label: "Einbau der Badewanne",
    needs: "Produkt aus „Wanne“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    // The Wanne picker (menu_WANNE) selects into hidden fields, not
    // checkboxes — same special case as menuCount() in script.js.
    has: (sel) => sel.field("chosenBathtubProductId"),
  },
  {
    // Own tab in the Wanne picker, own work task — a tub does not cover it and
    // a Duschabtrennung is not a substitute.
    task: "install_bathtub_screen",
    label: "Einbau des Wannenaufsatzes",
    needs: "Produkt aus „Wanne“ → Wannenaufsatz",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.field("chosenScreenProductId"),
  },
  {
    task: "install_toilet",
    label: "Einbau einer Toilette",
    needs: "Produkt aus „WC“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    catalog: "menu_WC",
    has: (sel) => sel.panel("menu_WC") || [...WC_WALL, ...WC_FLOOR].some((p) => sel.priced(p)),
    sharesWith: ["install_shower_wc"],
  },
  {
    task: "install_shower_wc",
    label: "Einbau eines Dusch-WCs",
    needs: "Produkt aus „WC“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    catalog: "menu_WC",
    has: (sel) => sel.panel("menu_WC") || [...WC_WALL, ...WC_FLOOR].some((p) => sel.priced(p)),
    sharesWith: ["install_toilet"],
  },
  {
    task: "install_tray",
    label: "Einbau der Duschwanne",
    needs: "eine Duschwanne",
    missingText: (sel) =>
      sel.trayEnabled() === false
        ? "Die Duschwanne ist auf der Duschwanne-Seite ausgeschaltet."
        : null,
    group: "material",
    target: "Duschwanne",
    severity: "rot",
    has: (sel) => sel.material("Duschwanne"),
  },
  {
    task: "install_enclosure",
    label: "Einbau der Duschabtrennung",
    needs: "eine Duschabtrennung",
    group: "material",
    target: "DuschabtrennungNeu",
    severity: "rot",
    has: (sel) =>
      sel.material("Duschabtrennung") || sel.configurator("__daConfigurator"),
    sharesWith: ["install_distance_profile"],
  },
  {
    task: "install_shower_curtain",
    label: "Einbau eines Duschvorhangs",
    needs: "einen Duschvorhang",
    group: "material",
    target: "Duschvorhang",
    severity: "rot",
    // The curtain configurator appends its lines to duschabtrennung.quickAdd,
    // so the priced category says "Duschabtrennung" — only the configurator
    // itself knows a curtain was picked.
    has: (sel) => sel.configurator("__vorhangConfigurator"),
  },

  // --- soft couplings: plausible without, so only a hint ---------------
  {
    task: "trockenbau_duschbereich",
    label: "Trockenbau im Duschbereich",
    needs: "eine Wandverkleidung",
    group: "material",
    target: "Wandverkleidung",
    severity: "gelb",
    has: (sel) => sel.material("Wandverkleidung"),
    // Wandverkleidung is routinely ordered without any Trockenbau.
    noReverse: true,
    sharesWith: ["trockenbau_wc"],
  },
  {
    task: "trockenbau_wc",
    label: "Trockenbau für das WC",
    needs: "eine Wandverkleidung",
    group: "material",
    target: "Wandverkleidung",
    severity: "gelb",
    has: (sel) => sel.material("Wandverkleidung"),
    noReverse: true,
    sharesWith: ["trockenbau_duschbereich"],
  },
  {
    task: "install_distance_profile",
    label: "Einbau eines Abstandsprofils",
    needs: "eine Duschabtrennung",
    group: "material",
    target: "DuschabtrennungNeu",
    severity: "gelb",
    has: (sel) => sel.material("Duschabtrennung"),
    noReverse: true,
    sharesWith: ["install_enclosure"],
  },
];

/**
 * Reads what the user picked. The work tasks and the optional products live in
 * the DOM (they are not all visible in `pricing`), the material categories come
 * from the priced lines.
 */
export function readSelection(pricing, doc = document) {
  const checked = (selector) => !!doc.querySelector(selector);
  const tasks = new Set(
    Array.from(
      doc.querySelectorAll(
        'input[name="duschwanne[workTasks][]"]:checked,' +
          'input[name="duschwanne[extraTasks][]"]:checked',
      ),
    ).map((el) => el.value),
  );
  const matLines = lines(
    pricing?.materialsDisplayUI || pricing?.materials || {},
  );
  const pricedSet = new Set(
    [...matLines, ...lines(pricing?.optionalDisplayUI || {})].map(idOf),
  );
  return {
    tasks,
    opt: (name) => checked(`input[name="${name}"]:checked`),
    panel: (menuId) => checked(`#${menuId} input[type="checkbox"]:checked`),
    field: (id) => !!doc.getElementById(id)?.value?.trim(),
    value: (id) => String(doc.getElementById(id)?.value ?? "").trim(),
    ticked: (id) => !!doc.getElementById(id)?.checked,
    // An article actually in the offer — see pricedIds() for why.
    priced: (id) => pricedSet.has(id),
    // Duschabtrennung (neu) configurator.
    daLines: () => {
      try {
        return window.__daConfigurator?.getLines?.() || [];
      } catch {
        return [];
      }
    },
    // A configured Vigour enclosure — Badolux models have no Verbreiterungsprofil.
    daVigour: () => {
      try {
        const states = window.__daConfigurator?.getState?.() || [];
        const lines = window.__daConfigurator?.getLines?.() || [];
        return (
          lines.length > 0 &&
          states.some((st) => String(st?.__supplier || "").toUpperCase() !== "BADOLUX")
        );
      } catch {
        return false;
      }
    },
    // "Nicht nötig" ticks on ackable rows (payload.zusammenfassung.checkAck).
    acked: (id) => !!window.__zfCheckAck?.[id],
    // Duschwanne an/aus on the Duschwanne page; null where the page is absent.
    trayEnabled: () => {
      const el = doc.getElementById("dwTrayToggle");
      return el ? el.checked : null;
    },
    product: (productId) =>
      checked(`input[data-product-id="${productId}"]:checked`),
    // A category whose products are loaded at runtime can be empty — then the
    // rule is unfulfillable and saying "fehlt" would be wrong.
    panelEmpty: (menuId) =>
      !doc.querySelector(`#${menuId} input[type="checkbox"]`),
    configurator: (globalName) => {
      try {
        const api = window[globalName];
        return (api?.getLines?.() || []).length > 0;
      } catch {
        return false;
      }
    },
    material: (category) =>
      matLines.some(
        (l) =>
          String(l?.category || "").toLowerCase() === category.toLowerCase(),
      ),
  };
}

/**
 * One row per coupling that this offer touches:
 * - task ticked  → the product must be there (rot/gelb when missing)
 * - product there, task missing → who installs it? (gelb)
 * - both present → green row
 */
function workRows(selection) {
  if (!selection) return [];
  const rows = [];
  for (const rule of WORK_RULES) {
    const ticked = selection.tasks.has(rule.task);
    const picked = !!rule.has(selection);
    // A sibling rule's task covers the same product, so the product is not
    // orphaned just because this one is unticked.
    const coveredBySibling = (rule.sharesWith || []).some((t) =>
      selection.tasks.has(t),
    );

    if (ticked) {
      // Nothing to pick yet: the category has no products at all. That is a
      // catalog gap, not a mistake in this offer — and it turns green by
      // itself as soon as a product is added and selected.
      const emptyCatalog =
        !picked && rule.catalog && selection.panelEmpty(rule.catalog);
      rows.push({
        id: `arbeit-${rule.task}`,
        group: rule.group,
        target: rule.target,
        title: rule.label,
        status: picked ? "gruen" : emptyCatalog ? "gelb" : rule.severity,
        details: picked
          ? []
          : emptyCatalog
            ? [`In dieser Kategorie ist noch kein Produkt hinterlegt.`]
            : [rule.missingText?.(selection) || `Es fehlt ${rule.needs}.`],
      });
    } else if (picked && !rule.noReverse && !coveredBySibling) {
      // Two tasks can want the same product group (Duschsystem with/without
      // Thermostat) — that is one orphaned product, not two.
      if (rows.some((r) => r.title === rule.needs)) continue;
      rows.push({
        id: `produkt-${rule.task}`,
        group: "arbeiten",
        target: "Arbeiten",
        title: rule.needs,
        status: "gelb",
        details: [`Gewählt, aber „${rule.label}“ ist nicht angehakt.`],
      });
    }
  }
  return rows;
}

/** One row per standing rule, green when it passes. */
function standingRows(ctx) {
  return RULES.map((rule) => {
    // Rules that read the form need a selection; without one they cannot
    // judge anything, so they stay silent rather than guess.
    if (rule.needsSelection && !ctx.sel) return null;
    // A rule that only makes sense for certain offers says so itself.
    try {
      if (rule.applies && !rule.applies(ctx)) return null;
    } catch {
      return null;
    }
    let hits;
    try {
      hits = rule.test(ctx);
    } catch {
      return null; // a broken rule must never break the check
    }
    const details = (Array.isArray(hits) ? hits : [hits]).filter(Boolean);
    const group = GROUPS.find((g) => g.key === rule.group);
    // The user confirmed this one is not needed for this offer.
    const acked = !!(rule.ackable && details.length && ctx.sel?.acked(rule.id));
    return {
      id: rule.id,
      group: rule.group,
      target: rule.target || group?.target,
      title: rule.title,
      status: details.length && !acked ? rule.severity : "gruen",
      details: acked ? ["Als nicht nötig markiert."] : details,
      ackable: !!rule.ackable,
      acked,
      // Offer the tick while the row is open, or to take it back.
      showAck: !!rule.ackable && (details.length > 0 || acked),
    };
  }).filter(Boolean);
}

/** pricing = the payload behind the `pricing:updated` event / window.__pricing. */
export function runAngebotscheck(pricing, selection = null) {
  const ctx = {
    services: pricing?.servicesDisplayUI || pricing?.services || {},
    materials: pricing?.materialsDisplayUI || pricing?.materials || {},
    optionals: pricing?.optionalDisplayUI || {},
    sel: selection,
  };

  const groups = GROUPS.map((g) => ({ ...g, status: "gruen", rows: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));

  for (const row of [...standingRows(ctx), ...workRows(selection)]) {
    const group = byKey.get(row.group);
    if (!group) continue;
    group.rows.push(row);
    group.status = worst(group.status, row.status);
  }

  // Worst first — what needs fixing is what you want to read.
  for (const g of groups) g.rows.sort((a, b) => RANK[b.status] - RANK[a.status]);

  return {
    status: groups.reduce((acc, g) => worst(acc, g.status), "gruen"),
    groups,
    geprueftAm: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------- rendering */

const AMPEL = { gruen: "🟢", gelb: "🟡", rot: "🔴" };
const AMPEL_TEXT = { gruen: "In Ordnung", gelb: "Bitte prüfen", rot: "Fehlt" };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function countsOf(rows) {
  return rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    {},
  );
}

function renderRow(row) {
  // A button, not a link: navigating by hash keeps the wizard state, a real
  // navigation would rebuild the form.
  const node = el("button", `zf-check-row is-${row.status}`);
  node.type = "button";
  if (row.target) {
    node.dataset.target = row.target;
    node.title = `Zu „${row.target}“ springen`;
  } else {
    node.disabled = true;
  }
  node.appendChild(el("span", "zf-check-row__dot", AMPEL[row.status]));

  const text = el("span", "zf-check-row__text");
  text.appendChild(el("span", "zf-check-row__title", row.title));
  for (const detail of row.details || []) {
    text.appendChild(el("span", "zf-check-row__detail", detail));
  }
  node.appendChild(text);
  if (row.target) node.appendChild(el("span", "zf-check-row__go", "›"));
  if (!row.showAck) return node;

  // A checkbox cannot live inside the row's <button>, so wrap both.
  const wrap = el("div", "zf-check-row-wrap");
  const ack = el("label", "zf-check-ack");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.ack = row.id;
  box.checked = !!row.acked;
  ack.append(box, el("span", null, "Nicht nötig"));
  wrap.append(node, ack);
  return wrap;
}

export function renderAngebotscheck(root, result) {
  if (!root) return;
  const head = el("div", `zf-check-head is-${result.status}`);
  head.appendChild(el("span", "zf-check-head__dot", AMPEL[result.status]));
  head.appendChild(
    el("span", null, `Gesamtstatus: ${AMPEL_TEXT[result.status]}`),
  );

  const nodes = [head];
  for (const group of result.groups) {
    if (!group.rows.length) continue;
    const section = el("section", "zf-check-group");

    const title = el("div", `zf-check-group__title is-${group.status}`);
    title.appendChild(el("span", null, group.title));
    const counts = countsOf(group.rows);
    const badges = el("span", "zf-check-group__counts");
    for (const status of ["rot", "gelb", "gruen"]) {
      if (!counts[status]) continue;
      badges.appendChild(
        el("span", `zf-check-count is-${status}`, `${AMPEL[status]} ${counts[status]}`),
      );
    }
    title.appendChild(badges);
    section.appendChild(title);

    const list = el("div", "zf-check-rows");
    for (const row of group.rows) list.appendChild(renderRow(row));
    section.appendChild(list);
    nodes.push(section);
  }

  if (nodes.length === 1) {
    nodes.push(el("div", "zf-check-empty", "Noch nichts zu prüfen."));
  }
  root.replaceChildren(...nodes);
}

function paint() {
  // Own wizard step, and only bu has it in its flow — no offer-type check here.
  const body = document.querySelector("#page-Angebotscheck .zf-check-body");
  if (!body) return;

  const result = runAngebotscheck(
    window.__pricing,
    readSelection(window.__pricing),
  );
  renderAngebotscheck(body, result);
  // Task 2 (Versand) and Task 3 (Checkliste) read the status from here.
  window.__angebotscheck = result;
  window.dispatchEvent(
    new CustomEvent("angebotscheck:updated", { detail: result }),
  );
}

/** Restore / set the "Nicht nötig" ticks (payload.zusammenfassung.checkAck). */
export function setCheckAck(ack) {
  window.__zfCheckAck =
    ack && typeof ack === "object" ? Object.fromEntries(
      Object.entries(ack).filter(([, v]) => v === true),
    ) : {};
  if (typeof document !== "undefined") paint();
}

if (typeof document !== "undefined") {
  window.__zfCheckAck = window.__zfCheckAck || {};
  window.setZfCheckAck = setCheckAck;
  window.addEventListener("pricing:updated", paint);
  window.addEventListener("hashchange", paint);
  document.addEventListener("DOMContentLoaded", () => {
    paint();
    // Row → the page that fixes it. Hash navigation only switches the step,
    // so nothing the user entered is lost.
    const page = document.getElementById("page-Angebotscheck");
    page?.addEventListener("click", (e) => {
      if (e.target.closest(".zf-check-ack")) return; // the tick, not the row
      const target = e.target.closest("[data-target]")?.dataset.target;
      if (target) location.hash = `#${target}`;
    });
    page?.addEventListener("change", (e) => {
      const id = e.target?.dataset?.ack;
      if (!id) return;
      const next = { ...(window.__zfCheckAck || {}) };
      if (e.target.checked) next[id] = true;
      else delete next[id];
      window.__zfCheckAck = next;
      paint();
    });
  });
  window.repaintAngebotscheck = paint;
}
