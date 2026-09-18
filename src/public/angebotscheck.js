/**
 * Angebotscheck — rule-based plausibility check of the current offer.
 *
 * BU only for now. Results are grouped by the same roman sections BU uses in
 * the sidebar and in the Übersicht (I Arbeiten / II Material / III Optional),
 * so a finding points at the tab the user has to go back to.
 *
 * Status per group and overall: "gruen" | "gelb" | "rot" (worst wins).
 * Adding a check = one entry in RULES. Nothing else.
 */

const RANK = { gruen: 0, gelb: 1, rot: 2 };
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

export const GROUPS = [
  { key: "arbeiten", num: "I", title: "Auszuführende Arbeiten" },
  { key: "material", num: "II", title: "Material für Badumbau" },
  { key: "optional", num: "III", title: "Optionale Produkte" },
];

const lines = (x) => (Array.isArray(x?.lines) ? x.lines : []);
const total = (l) => Number(l?.lineTotal) || 0;
const name = (l) => String(l?.label || l?.name || l?.productId || "Position");
const hasCategory = (ls, cat) =>
  ls.some((l) => String(l?.category || "").toLowerCase() === cat.toLowerCase());

/**
 * ctx = { services, materials, optionals } — each { sum, lines }.
 * A rule returns a finding string (or an array of them), or nothing when it passes.
 */
export const RULES = [
  {
    id: "arbeiten-leer",
    group: "arbeiten",
    severity: "rot",
    test: ({ services }) =>
      lines(services).length === 0 && "Keine Arbeitsposition erfasst.",
  },
  {
    id: "arbeiten-ohne-preis",
    group: "arbeiten",
    severity: "gelb",
    test: ({ services }) =>
      lines(services).length > 0 &&
      Number(services?.sum) <= 0 &&
      "Arbeitspositionen vorhanden, aber Summe ist 0,00 €.",
  },
  {
    id: "material-leer",
    group: "material",
    severity: "rot",
    test: ({ materials }) =>
      lines(materials).length === 0 && "Kein Material erfasst.",
  },
  {
    id: "material-ohne-artikelid",
    group: "material",
    severity: "gelb",
    test: ({ materials }) =>
      lines(materials)
        .filter((l) => !l.productId && !l.id)
        .map((l) => `Ohne Artikel-ID: ${name(l)}`),
  },
  {
    id: "material-ohne-preis",
    group: "material",
    severity: "gelb",
    test: ({ materials }) =>
      lines(materials)
        .filter((l) => total(l) <= 0)
        .map((l) => `Preis 0,00 €: ${name(l)}`),
  },
  {
    id: "duschwanne-ohne-abtrennung",
    group: "material",
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
    severity: "gelb",
    test: ({ optionals }) =>
      lines(optionals)
        .filter((l) => Number(l?.qty) <= 0)
        .map((l) => `Menge 0: ${name(l)}`),
  },
];

/** pricing = the payload behind the `pricing:updated` event / window.__pricing. */
export function runAngebotscheck(pricing) {
  const ctx = {
    services: pricing?.servicesDisplayUI || pricing?.services || {},
    materials: pricing?.materialsDisplayUI || pricing?.materials || {},
    optionals: pricing?.optionalDisplayUI || {},
  };

  const groups = GROUPS.map((g) => ({ ...g, status: "gruen", findings: [] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));

  for (const rule of RULES) {
    const group = byKey.get(rule.group);
    if (!group) continue;
    let hits;
    try {
      hits = rule.test(ctx);
    } catch {
      continue; // a broken rule must never break the check
    }
    const list = (Array.isArray(hits) ? hits : [hits]).filter(Boolean);
    for (const text of list) {
      group.findings.push({ id: rule.id, severity: rule.severity, text });
      group.status = worst(group.status, rule.severity);
    }
  }

  return {
    status: groups.reduce((acc, g) => worst(acc, g.status), "gruen"),
    groups,
    geprueftAm: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------- rendering */

const AMPEL = { gruen: "🟢", gelb: "🟡", rot: "🔴" };
const AMPEL_TEXT = { gruen: "In Ordnung", gelb: "Bitte prüfen", rot: "Fehlt" };

export function renderAngebotscheck(root, result) {
  if (!root) return;
  const head = document.createElement("div");
  head.className = "zf-check-head";
  head.textContent = `${AMPEL[result.status]} Gesamtstatus: ${AMPEL_TEXT[result.status]}`;

  const list = document.createElement("div");
  list.className = "zf-check-groups";
  for (const g of result.groups) {
    const row = document.createElement("div");
    row.className = "zf-check-group";
    const title = document.createElement("div");
    title.className = "zf-check-group__title";
    title.textContent = `${AMPEL[g.status]}  ${g.num}  ${g.title}`;
    row.appendChild(title);
    if (g.findings.length) {
      const ul = document.createElement("ul");
      ul.className = "zf-check-findings";
      for (const f of g.findings) {
        const li = document.createElement("li");
        li.textContent = `${AMPEL[f.severity]} ${f.text}`;
        ul.appendChild(li);
      }
      row.appendChild(ul);
    }
    list.appendChild(row);
  }

  root.replaceChildren(head, list);
}

function paint() {
  // Own wizard step, and only bu has it in its flow — no offer-type check here.
  const body = document.querySelector("#page-Angebotscheck .zf-check-body");
  if (!body) return;

  const result = runAngebotscheck(window.__pricing);
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
  document.addEventListener("DOMContentLoaded", paint);
  window.repaintAngebotscheck = paint;
}
