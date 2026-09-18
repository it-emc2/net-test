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
    has: (sel) => sel.opt("optBasin[]"),
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
    has: (sel) => sel.panel("menu_WANNE"),
  },
  {
    task: "install_toilet",
    label: "Einbau einer Toilette",
    needs: "Produkt aus „WC“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.panel("menu_WC"),
    sharesWith: ["install_shower_wc"],
  },
  {
    task: "install_shower_wc",
    label: "Einbau eines Dusch-WCs",
    needs: "Produkt aus „WC“",
    group: "optional",
    target: "Optional",
    severity: "rot",
    has: (sel) => sel.panel("menu_WC"),
    sharesWith: ["install_toilet"],
  },
  {
    task: "install_tray",
    label: "Einbau der Duschwanne",
    needs: "eine Duschwanne",
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
    target: "Duschabtrennung",
    severity: "rot",
    has: (sel) => sel.material("Duschabtrennung"),
    sharesWith: ["install_bathtub_screen", "install_distance_profile"],
  },
  {
    task: "install_shower_curtain",
    label: "Einbau eines Duschvorhangs",
    needs: "einen Duschvorhang",
    group: "material",
    target: "Duschvorhang",
    severity: "rot",
    has: (sel) => sel.material("Duschvorhang") || sel.material("Zubehör"),
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
    target: "Duschabtrennung",
    severity: "gelb",
    has: (sel) => sel.material("Duschabtrennung"),
    noReverse: true,
    sharesWith: ["install_enclosure", "install_bathtub_screen"],
  },
  {
    task: "install_bathtub_screen",
    label: "Einbau des Wannenaufsatzes",
    needs: "eine Duschabtrennung oder eine Wanne",
    group: "material",
    target: "Duschabtrennung",
    severity: "gelb",
    has: (sel) => sel.material("Duschabtrennung") || sel.panel("menu_WANNE"),
    noReverse: true,
    sharesWith: ["install_enclosure", "install_distance_profile"],
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
  return {
    tasks,
    opt: (name) => checked(`input[name="${name}"]:checked`),
    panel: (menuId) => checked(`#${menuId} input[type="checkbox"]:checked`),
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
      rows.push({
        id: `arbeit-${rule.task}`,
        group: rule.group,
        target: rule.target,
        title: rule.label,
        status: picked ? "gruen" : rule.severity,
        details: picked ? [] : [`Es fehlt ${rule.needs}.`],
      });
    } else if (picked && !rule.noReverse && !coveredBySibling) {
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
    let hits;
    try {
      hits = rule.test(ctx);
    } catch {
      return null; // a broken rule must never break the check
    }
    const details = (Array.isArray(hits) ? hits : [hits]).filter(Boolean);
    const group = GROUPS.find((g) => g.key === rule.group);
    return {
      id: rule.id,
      group: rule.group,
      target: group?.target,
      title: rule.title,
      status: details.length ? rule.severity : "gruen",
      details,
    };
  }).filter(Boolean);
}

/** pricing = the payload behind the `pricing:updated` event / window.__pricing. */
export function runAngebotscheck(pricing, selection = null) {
  const ctx = {
    services: pricing?.servicesDisplayUI || pricing?.services || {},
    materials: pricing?.materialsDisplayUI || pricing?.materials || {},
    optionals: pricing?.optionalDisplayUI || {},
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
  return node;
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

if (typeof document !== "undefined") {
  window.addEventListener("pricing:updated", paint);
  window.addEventListener("hashchange", paint);
  document.addEventListener("DOMContentLoaded", () => {
    paint();
    // Row → the page that fixes it. Hash navigation only switches the step,
    // so nothing the user entered is lost.
    document
      .getElementById("page-Angebotscheck")
      ?.addEventListener("click", (e) => {
        const target = e.target.closest("[data-target]")?.dataset.target;
        if (target) location.hash = `#${target}`;
      });
  });
  window.repaintAngebotscheck = paint;
}
