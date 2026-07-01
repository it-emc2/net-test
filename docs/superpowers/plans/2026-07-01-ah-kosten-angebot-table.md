# AH Kosten → Angebot-style line-item tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two dense AH cost cards on the Kosten-Details page with calm, Angebot-style line-item tables, moving the internal min/frequency breakdown and zone banner behind a per-service ℹ toggle — with no change to any calculated value.

**Architecture:** Extract the AH cost markup into a single **pure, self-contained** function `window.__buildAHKostenHTML(vm)` in `src/public/script.js`. It takes a view-model (the object `computeAHGesamt()` already returns, plus resolved task-label arrays) and returns an HTML string. `renderFromData`'s AH branch builds that view-model, injects the string into `#costsSummary`, and wires the ℹ toggles. Purity makes the builder testable via Playwright `page.evaluate(() => window.__buildAHKostenHTML(fixture))` without driving the whole configurator or touching the DB.

**Tech Stack:** Vanilla browser JS (global `window.*`, no bundler), Playwright (`@playwright/test`, `tests/e2e/*.spec.cjs`, runs against `http://localhost:3000`).

## Global Constraints

- **No value changes.** Every euro/hour figure must equal what the current build shows for the same input. Rates are fixed: `HND_RATE = 40.56`, `AB_RATE = 53.04`, `ANFAHRT_PER_EINSATZ = 7.96` €/Einsatz.
- **Scope is `src/public/script.js` only** for app code — the AH branch of `window.renderFromData` (~lines 10576–10790) and a new sibling function. Do **not** modify `computeAHGesamt`, the AH data-entry page (`page-ah`), the admin panel, or the Word template (`src/templates/generate-ah.mjs`, `src/routes/docx-template.js`).
- **German UI copy**, `de-DE` currency formatting (`Intl.NumberFormat`), comma decimal separator.
- **Selbstzahler logic preserved exactly:** when `isSelbstzahler` and HnD hours > 0, the Servicepauschale (`servicepauschale`, currently 1,20 €) is a line inside the HnD table and folded into its total; otherwise it renders as a footnote and is excluded from the total.
- The builder must be **pure**: no DOM access, no reads of other globals. All inputs arrive via its `vm` argument. It defines its own formatters.

---

## File Structure

- **Modify:** `src/public/script.js`
  - Add `window.__buildAHKostenHTML(vm)` (new pure function, placed just above `window.renderFromData`).
  - Replace the AH card-building block inside `renderFromData` (the `buildSvcCard` helper + the two `renderedCards.push(...)` calls, ~10627–10790) with: build view-model → call `__buildAHKostenHTML` → inject → wire toggles.
- **Create:** `tests/e2e/ah-kosten-angebot.spec.cjs` — Playwright tests that call the pure builder with fixtures and assert markup/values.

### View-model shape (the `vm` argument)

`renderFromData` passes this object (fields taken verbatim from `computeAHGesamt()`, plus two resolved label arrays):

```
{
  hasHnd, hasAb,                          // booleans
  isSelbstzahler, servicepauschale,       // bool, number
  zoneData,                               // {zone, billMin} | null
  // HnD:
  totalMonatlichH, totalEinsaetze, anfahrtTotal, leistungenTotal, gesamtBase,
  hndTaskLabels,                          // string[] (resolved human labels)
  schedRows,                              // [{regelmaessigkeit, dauerMin, reiseRoundMin, perVisitMin, freq, monthlyH}]
  // Alltagsbegleitung:
  abTotalMonatlichH, abTotalEinsaetze, abAnfahrtTotal, abLeistungenTotal, abGesamtBase, abKmRate,
  abTaskLabels,                           // string[]
  abSchedRows,
  gesamt                                  // grand total (already includes Selbstzahler Servicepauschale)
}
```

---

## Task 1: Pure builder scaffold + HnD line-item table

**Files:**
- Modify: `src/public/script.js` (add `window.__buildAHKostenHTML` above `window.renderFromData`)
- Test: `tests/e2e/ah-kosten-angebot.spec.cjs` (create)

**Interfaces:**
- Consumes: nothing (pure; `vm` argument only).
- Produces: `window.__buildAHKostenHTML(vm) → string` (HTML). After this task it renders the HnD table only.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/ah-kosten-angebot.spec.cjs`:

```js
const { test, expect } = require("@playwright/test");

const BASE_URL = "http://localhost:3000";

// Minimal HnD-only view-model (Kassenkunde).
const HND_ONLY = {
  hasHnd: true, hasAb: false,
  isSelbstzahler: false, servicepauschale: 1.20, zoneData: { zone: 2, billMin: 15 },
  totalMonatlichH: 12.5, totalEinsaetze: 4, anfahrtTotal: 31.84,
  leistungenTotal: 507.0, gesamtBase: 538.84,
  hndTaskLabels: ["Reinigung der Wohnung", "Wäschepflege"],
  schedRows: [
    { regelmaessigkeit: "Wöchentlich", dauerMin: 120, reiseRoundMin: 30, perVisitMin: 150, freq: 4.33, monthlyH: 10.83 },
  ],
  abTotalMonatlichH: 0, abTotalEinsaetze: 0, abAnfahrtTotal: 0, abLeistungenTotal: 0,
  abGesamtBase: 0, abKmRate: 0.35, abTaskLabels: [], abSchedRows: [],
  gesamt: 538.84,
};

async function build(page, vm) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__buildAHKostenHTML === "function", null, { timeout: 15000 });
  return page.evaluate((v) => window.__buildAHKostenHTML(v), vm);
}

test("HnD table shows Angebot line items with correct values", async ({ page }) => {
  const html = await build(page, HND_ONLY);
  expect(html).toContain("Haushaltsnahe Dienstleistungen");
  // Leistungen row: 12,5 h × 40,56 € = 507,00 €
  expect(html).toContain("40,56");
  expect(html).toContain("507,00");
  // Anfahrtspauschale row: 4 × 7,96 € = 31,84 €
  expect(html).toContain("Anfahrtspauschale");
  expect(html).toContain("7,96");
  expect(html).toContain("31,84");
  // Gesamt / Monat
  expect(html).toContain("Gesamt / Monat");
  expect(html).toContain("538,84");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in one terminal `npm start`, then):
`npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs -g "HnD table shows"`
Expected: FAIL — `window.__buildAHKostenHTML` is not a function (timeout on `waitForFunction`).

- [ ] **Step 3: Write minimal implementation**

In `src/public/script.js`, immediately **above** the line `window.renderFromData = async function renderFromData(data) {`, insert:

```js
// ── AH Kosten: pure Angebot-style table builder (testable in isolation) ─────
window.__buildAHKostenHTML = function __buildAHKostenHTML(vm) {
  vm = vm || {};
  var HND_RATE = 40.56, AB_RATE = 53.04, ANFAHRT = 7.96;

  var euro = function (n) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
  };
  var fmtH = function (h) {
    return (Math.round((Number(h) || 0) * 100) / 100).toFixed(2).replace(".", ",");
  };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // Renders one service as an Angebot line-item table.
  // opts: { title, subtitle, taskLabels, hours, rate, leistungenTotal,
  //         einsaetze, anfahrtTotal, gesamtLabel, gesamtValue, extraRowsHTML, footnoteHTML }
  function serviceTable(opts) {
    var tasks = (opts.taskLabels || []).filter(Boolean);
    var tasksLine = tasks.length
      ? '<div style="font-size:0.82rem; color:var(--muted); margin:2px 0 12px;">' +
          '<span style="font-weight:600;">Enthaltene Leistungen:</span> ' +
          tasks.map(esc).join(" · ") + "</div>"
      : '<div style="margin-bottom:8px;"></div>';

    var head =
      '<div style="display:grid; grid-template-columns:1fr 90px 100px 110px; gap:6px 12px; ' +
        'font-size:0.72rem; font-weight:600; color:var(--muted); text-transform:uppercase; ' +
        'letter-spacing:0.04em; padding-bottom:6px; border-bottom:1px solid var(--border);">' +
        "<span>Position</span>" +
        '<span style="text-align:right;">Menge</span>' +
        '<span style="text-align:right;">Einzelpreis</span>' +
        '<span style="text-align:right;">Gesamt</span>' +
      "</div>";

    var rowStyle = 'display:grid; grid-template-columns:1fr 90px 100px 110px; gap:6px 12px; ' +
      "align-items:center; padding:9px 0; border-bottom:1px solid var(--border); font-size:0.9rem;";

    var leistungRow =
      '<div style="' + rowStyle + '">' +
        "<span>Leistungen</span>" +
        '<span style="text-align:right; color:var(--muted);">' + fmtH(opts.hours) + " h</span>" +
        '<span style="text-align:right; color:var(--muted);">' + euro(opts.rate) + "</span>" +
        '<span style="text-align:right; font-weight:600;">' + euro(opts.leistungenTotal) + "</span>" +
      "</div>";

    var anfahrtRow =
      '<div style="' + rowStyle + '">' +
        "<span>Anfahrtspauschale</span>" +
        '<span style="text-align:right; color:var(--muted);">' + (opts.einsaetze || 0) + "&times;</span>" +
        '<span style="text-align:right; color:var(--muted);">' + euro(ANFAHRT) + "</span>" +
        '<span style="text-align:right; font-weight:600;">' + euro(opts.anfahrtTotal) + "</span>" +
      "</div>";

    var totalRow =
      '<div style="display:flex; justify-content:space-between; align-items:baseline; ' +
        'padding-top:12px; font-size:1.05rem; font-weight:700;">' +
        "<span>" + esc(opts.gesamtLabel || "Gesamt / Monat") + "</span>" +
        "<span>" + euro(opts.gesamtValue) + "</span>" +
      "</div>";

    return (
      '<section style="margin-bottom:24px;">' +
        '<h3 style="margin:0 0 2px; font-size:1.05rem;">' + esc(opts.title) + "</h3>" +
        (opts.subtitle ? '<div style="font-size:0.85rem; color:var(--muted); margin-bottom:6px;">' + esc(opts.subtitle) + "</div>" : "") +
        tasksLine +
        head +
        leistungRow +
        anfahrtRow +
        (opts.extraRowsHTML || "") +
        totalRow +
        (opts.footnoteHTML || "") +
      "</section>"
    );
  }

  var html = "";
  if (vm.hasHnd) {
    html += serviceTable({
      title: "Haushaltsnahe Dienstleistungen",
      subtitle: "Angebot zur Unterstützung im Haushalt",
      taskLabels: vm.hndTaskLabels,
      hours: vm.totalMonatlichH,
      rate: HND_RATE,
      leistungenTotal: vm.leistungenTotal,
      einsaetze: vm.totalEinsaetze,
      anfahrtTotal: vm.anfahrtTotal,
      gesamtLabel: "Gesamt / Monat",
      gesamtValue: vm.gesamtBase,
    });
  }
  return html;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs -g "HnD table shows"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/script.js tests/e2e/ah-kosten-angebot.spec.cjs
git commit -m "feat(ah-kosten): pure Angebot-table builder with HnD line items"
```

---

## Task 2: Alltagsbegleitung table, combined total, empty state

**Files:**
- Modify: `src/public/script.js` (`window.__buildAHKostenHTML`)
- Test: `tests/e2e/ah-kosten-angebot.spec.cjs`

**Interfaces:**
- Consumes: `serviceTable` from Task 1.
- Produces: builder now renders the AB table, a combined **Gesamt / Monat** row when both services exist, and an empty-state message when neither does.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/ah-kosten-angebot.spec.cjs`:

```js
const BOTH = {
  ...HND_ONLY,
  hasAb: true,
  abTotalMonatlichH: 6.0, abTotalEinsaetze: 2, abAnfahrtTotal: 15.92,
  abLeistungenTotal: 318.24, abGesamtBase: 334.16, abKmRate: 0.35,
  abTaskLabels: ["Begleitung zu Terminen"], abSchedRows: [],
  gesamt: 873.0,
};

const EMPTY = { ...HND_ONLY, hasHnd: false, hasAb: false, gesamt: 0 };

test("Alltagsbegleitung table renders with its rate", async ({ page }) => {
  const html = await build(page, BOTH);
  expect(html).toContain("Alltagsbegleitung");
  expect(html).toContain("53,04");
  expect(html).toContain("318,24");
  expect(html).toContain("334,16");
});

test("combined grand total appears only when both services exist", async ({ page }) => {
  const both = await build(page, BOTH);
  expect(both).toContain("873,00");
  const hnd = await build(page, HND_ONLY);
  // HnD-only: no separate grand-total block beyond the service's own total
  expect((hnd.match(/Gesamt \/ Monat/g) || []).length).toBe(1);
});

test("empty state shown when nothing configured", async ({ page }) => {
  const html = await build(page, EMPTY);
  expect(html).toContain("Noch keine Leistung konfiguriert");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs -g "Alltagsbegleitung|combined grand|empty state"`
Expected: FAIL — AB/total/empty markup not produced yet.

- [ ] **Step 3: Write minimal implementation**

In `window.__buildAHKostenHTML`, replace the final `var html = ""; if (vm.hasHnd) { ... } return html;` block with:

```js
  var html = "";
  if (vm.hasHnd) {
    html += serviceTable({
      title: "Haushaltsnahe Dienstleistungen",
      subtitle: "Angebot zur Unterstützung im Haushalt",
      taskLabels: vm.hndTaskLabels,
      hours: vm.totalMonatlichH,
      rate: HND_RATE,
      leistungenTotal: vm.leistungenTotal,
      einsaetze: vm.totalEinsaetze,
      anfahrtTotal: vm.anfahrtTotal,
      gesamtLabel: "Gesamt / Monat",
      gesamtValue: vm.gesamtBase,
    });
  }
  if (vm.hasAb) {
    html += serviceTable({
      title: "Alltagsbegleitung",
      subtitle: "",
      taskLabels: vm.abTaskLabels,
      hours: vm.abTotalMonatlichH,
      rate: AB_RATE,
      leistungenTotal: vm.abLeistungenTotal,
      einsaetze: vm.abTotalEinsaetze,
      anfahrtTotal: vm.abAnfahrtTotal,
      gesamtLabel: "Gesamt / Monat",
      gesamtValue: vm.abGesamtBase,
    });
  }
  if (vm.hasHnd && vm.hasAb) {
    html +=
      '<div style="display:flex; justify-content:space-between; align-items:baseline; ' +
        'padding-top:14px; border-top:2px solid var(--border); font-size:1.15rem; font-weight:800;">' +
        "<span>Gesamt / Monat</span><span>" + euro(vm.gesamt) + "</span>" +
      "</div>";
  }
  if (!vm.hasHnd && !vm.hasAb) {
    html =
      '<div style="font-size:0.9rem; color:var(--muted); padding:8px 0;">' +
      "Noch keine Leistung konfiguriert." +
      "</div>";
  }
  return html;
```

Note: the combined block uses "Gesamt / Monat" as its label too; the test counts occurrences only in the HnD-only case (exactly 1), so this is consistent.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/public/script.js tests/e2e/ah-kosten-angebot.spec.cjs
git commit -m "feat(ah-kosten): add Alltagsbegleitung table, combined total, empty state"
```

---

## Task 3: ℹ Details block (breakdown + zone) collapsed by default

**Files:**
- Modify: `src/public/script.js` (`window.__buildAHKostenHTML`)
- Test: `tests/e2e/ah-kosten-angebot.spec.cjs`

**Interfaces:**
- Consumes: `serviceTable`, `esc`, `euro`, `fmtH` from Task 1.
- Produces: each service table gains a toggle button (`data-ah-details-toggle`) and a details container (`data-ah-details`, `hidden`) holding the min/frequency breakdown grid and the zone banner. Markup only — click wiring is Task 5.

- [ ] **Step 1: Write the failing test**

Append:

```js
test("details block is present but hidden by default, with breakdown + zone", async ({ page }) => {
  const html = await build(page, HND_ONLY);
  expect(html).toContain("data-ah-details");
  expect(html).toContain("hidden");                 // collapsed by default
  expect(html).toContain("data-ah-details-toggle"); // toggle button
  expect(html).toContain("Details");                // button label
  // breakdown content
  expect(html).toContain("Wöchentlich");
  expect(html).toContain("Zone 2");                 // zone banner inside details
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs -g "details block"`
Expected: FAIL — no `data-ah-details` markup yet.

- [ ] **Step 3: Write minimal implementation**

Inside `serviceTable`, before the `return (...)`, add a details builder and a toggle. First add helper functions near the top of `__buildAHKostenHTML` (after `esc`):

```js
  var hhmm = function (min) {
    var m = Math.round(Number(min) || 0);
    var h = Math.floor(m / 60), r = m % 60;
    return h + ":" + String(r).padStart(2, "0") + " h";
  };

  var toggleSeq = 0; // unique id per service details block
```

Then, inside `serviceTable`, build the details block from `opts.schedRows` and `opts.zoneData`:

```js
    var detId = "ahDet" + (toggleSeq++);
    var zoneHTML = opts.zoneData
      ? '<div style="margin-bottom:8px; font-size:0.82rem; color:var(--muted);">' +
          "<b>Zone " + esc(opts.zoneData.zone) + "</b> · Hin-Fahrt " + esc(opts.zoneData.billMin) +
          " min · Hin &amp; Rück " + (2 * (Number(opts.zoneData.billMin) || 0)) + " min (im Stundenumfang enthalten)" +
        "</div>"
      : '<div style="margin-bottom:8px; font-size:0.82rem; color:#854d0e;">⚠ Keine Zone bestimmt.</div>';

    var brkRows = (opts.schedRows || []).map(function (r) {
      return '<tr style="border-top:1px solid var(--border);">' +
        '<td style="padding:5px 8px; color:var(--muted);">' + esc(r.regelmaessigkeit) + "</td>" +
        '<td style="padding:5px 8px; text-align:right;">' + r.dauerMin + " min</td>" +
        '<td style="padding:5px 8px; text-align:right;">+ ' + r.reiseRoundMin + " min</td>" +
        '<td style="padding:5px 8px; text-align:right;">= ' + r.perVisitMin + " min</td>" +
        '<td style="padding:5px 8px; text-align:right; color:var(--accent,#0ea5e9); font-weight:600;">&times; ' +
          (Math.round((Number(r.freq) || 0) * 100) / 100).toFixed(2).replace(".", ",") + " = " + hhmm(r.monthlyH * 60) + "</td>" +
      "</tr>";
    }).join("");

    var breakdownTable = (opts.schedRows && opts.schedRows.length)
      ? '<table style="border-collapse:collapse; width:100%; font-size:0.78rem; margin-top:4px;">' +
          '<thead><tr style="color:var(--muted); font-weight:600;">' +
            '<th style="padding:5px 8px; text-align:left;">Regelmäßigkeit</th>' +
            '<th style="padding:5px 8px; text-align:right;">Einsatz</th>' +
            '<th style="padding:5px 8px; text-align:right;">+ H&amp;R</th>' +
            '<th style="padding:5px 8px; text-align:right;">= /Einsatz</th>' +
            '<th style="padding:5px 8px; text-align:right;">&times; Freq = /Mon.</th>' +
          "</tr></thead><tbody>" + brkRows + "</tbody></table>"
      : "";

    var detailsToggle =
      '<button type="button" data-ah-details-toggle="' + detId + '" ' +
        'style="background:none; border:1px solid var(--border); border-radius:6px; ' +
        'padding:3px 10px; font-size:0.78rem; cursor:pointer; color:var(--muted); margin-top:10px;">' +
        "ℹ Details</button>";

    var detailsPanel =
      '<div data-ah-details="' + detId + '" hidden ' +
        'style="margin-top:10px; padding:10px 12px; background:var(--bg-alt,#f8fafc); ' +
        'border:1px solid var(--border); border-radius:6px;">' +
        zoneHTML + breakdownTable +
      "</div>";
```

Then change the `serviceTable` `return (...)` to append `detailsToggle + detailsPanel` after `(opts.footnoteHTML || "")`:

```js
        (opts.footnoteHTML || "") +
        detailsToggle +
        detailsPanel +
      "</section>"
```

Finally, pass `schedRows` and `zoneData` into both `serviceTable(...)` calls (add to each opts object):

```js
      schedRows: vm.schedRows, zoneData: vm.zoneData,   // HnD call
```
```js
      schedRows: vm.abSchedRows, zoneData: vm.zoneData,  // AB call
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/public/script.js tests/e2e/ah-kosten-angebot.spec.cjs
git commit -m "feat(ah-kosten): collapsible details with breakdown + zone banner"
```

---

## Task 4: Footnotes — HnD Servicepauschale (with Selbstzahler folding) & AB Fahrten/km

**Files:**
- Modify: `src/public/script.js` (`window.__buildAHKostenHTML`)
- Test: `tests/e2e/ah-kosten-angebot.spec.cjs`

**Interfaces:**
- Consumes: `serviceTable`, `euro`, `esc`.
- Produces: HnD table shows Servicepauschale as an in-table line folded into the total when `isSelbstzahler`, else a footnote; AB table always shows a Fahrten/km footnote.

- [ ] **Step 1: Write the failing tests**

Append:

```js
const HND_SELBSTZAHLER = { ...HND_ONLY, isSelbstzahler: true, gesamt: 540.04 };

test("Selbstzahler: Servicepauschale is a table line folded into the total", async ({ page }) => {
  const html = await build(page, HND_SELBSTZAHLER);
  expect(html).toContain("Servicepauschale");
  expect(html).toContain("1,20");
  // total for the HnD service = gesamtBase + servicepauschale = 540,04
  expect(html).toContain("540,04");
});

test("Kassenkunde: Servicepauschale is a footnote, not in the total", async ({ page }) => {
  const html = await build(page, HND_ONLY);
  expect(html).toContain("Separate Direktrechnung");
  expect(html).toContain("Servicepauschale");
  // HnD total stays at gesamtBase
  expect(html).toContain("538,84");
});

test("Alltagsbegleitung shows Fahrten/km footnote", async ({ page }) => {
  const html = await build(page, BOTH);
  expect(html).toContain("Fahrten im Rahmen der Alltagsbegleitung");
  expect(html).toContain("0,35"); // €/km
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs -g "Servicepauschale|Fahrten"`
Expected: FAIL — footnote/line markup not present.

- [ ] **Step 3: Write minimal implementation**

Add a footnote helper near the other helpers in `__buildAHKostenHTML`:

```js
  var footnote = function (title, body) {
    return '<div style="margin-top:12px; padding:8px 0 0; border-top:1px dashed var(--border); font-size:0.8rem; color:var(--muted);">' +
      '<span style="font-weight:600;">* Separate Direktrechnung — nicht im Gesamtbetrag.</span> ' +
      "<b>" + esc(title) + "</b> " + body +
    "</div>";
  };
```

In the HnD `serviceTable(...)` call, compute the Servicepauschale handling and pass `extraRowsHTML` / `footnoteHTML` / adjusted `gesamtValue`:

```js
  if (vm.hasHnd) {
    var hndExtraRows = "";
    var hndFootnote = "";
    var hndTotal = vm.gesamtBase;
    if (vm.isSelbstzahler) {
      hndTotal = Math.round((vm.gesamtBase + (vm.servicepauschale || 0)) * 100) / 100;
      hndExtraRows =
        '<div style="display:grid; grid-template-columns:1fr 90px 100px 110px; gap:6px 12px; ' +
          'align-items:center; padding:9px 0; border-bottom:1px solid var(--border); font-size:0.9rem;">' +
          "<span>Servicepauschale Reinigungsutensilien <span style=\"font-size:0.78rem; color:var(--muted);\">(inkl. MwSt.)</span></span>" +
          '<span style="text-align:right; color:var(--muted);">1&times;</span>' +
          '<span style="text-align:right; color:var(--muted);">' + euro(vm.servicepauschale) + "</span>" +
          '<span style="text-align:right; font-weight:600;">' + euro(vm.servicepauschale) + "</span>" +
        "</div>";
    } else {
      hndFootnote = footnote(
        "Servicepauschale Reinigungsutensilien für HnD:",
        euro(vm.servicepauschale) + " / Monat · inkl. MwSt. Jährliche Abrechnung, direkt mit dem Kunden."
      );
    }
    html += serviceTable({
      title: "Haushaltsnahe Dienstleistungen",
      subtitle: "Angebot zur Unterstützung im Haushalt",
      taskLabels: vm.hndTaskLabels,
      hours: vm.totalMonatlichH, rate: HND_RATE,
      leistungenTotal: vm.leistungenTotal, einsaetze: vm.totalEinsaetze, anfahrtTotal: vm.anfahrtTotal,
      gesamtLabel: "Gesamt HnD-Leistungen", gesamtValue: hndTotal,
      extraRowsHTML: hndExtraRows, footnoteHTML: hndFootnote,
      schedRows: vm.schedRows, zoneData: vm.zoneData,
    });
  }
```

For the AB call, add the Fahrten footnote:

```js
      footnoteHTML: footnote(
        "Fahrten im Rahmen der Alltagsbegleitung:",
        euro(vm.abKmRate) + " / km · inkl. MwSt. Wird bei Bedarf direkt abgerechnet."
      ),
```

(Add this line inside the existing AB `serviceTable(...)` opts object from Task 2/3.)

**Important:** the combined grand-total block already uses `vm.gesamt`, which `computeAHGesamt` computes to include the Selbstzahler Servicepauschale — so no change is needed there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/public/script.js tests/e2e/ah-kosten-angebot.spec.cjs
git commit -m "feat(ah-kosten): Servicepauschale folding + Fahrten/km footnotes"
```

---

## Task 5: Wire the builder into `renderFromData` + toggle behavior

**Files:**
- Modify: `src/public/script.js` (AH branch of `window.renderFromData`, ~10627–10790)

**Interfaces:**
- Consumes: `window.__buildAHKostenHTML(vm)`, `window.computeAHGesamt()`, existing `HND_TASK_LABELS` / `AB_TASK_LABELS` maps (already defined in the AH branch, ~10580–10605), `escapeHtml`.
- Produces: the Kosten-Details page renders the new tables; clicking a service's ℹ button toggles its details panel.

- [ ] **Step 1: Locate and read the current AH block**

Read `src/public/script.js` lines ~10576–10790 (the "AH: completely separate rendering path" branch inside `renderFromData`). Note the local `HND_TASK_LABELS` / `AB_TASK_LABELS` maps and the destructured `ah` fields.

- [ ] **Step 2: Replace card-building with builder call + injection**

Remove the `buildSvcCard` helper, the `COL`/`thStyle`/`tdStyle`/`tdAccent` locals, the `zoneBanner` local, and the two `renderedCards.push(...)` blocks (HnD + AB). Replace the section that assembled `renderedCards` into the container with:

```js
      const vm = {
        hasHnd: totalMonatlichH > 0,
        hasAb: hasAb,
        isSelbstzahler: isSelbstzahler,
        servicepauschale: servicepauschale,
        zoneData: zoneData,
        totalMonatlichH: totalMonatlichH,
        totalEinsaetze: totalEinsaetze,
        anfahrtTotal: anfahrtTotal,
        leistungenTotal: leistungenTotal,
        gesamtBase: gesamtBase,
        hndTaskLabels: (tasks || []).map((id) => HND_TASK_LABELS[id]).filter(Boolean),
        schedRows: schedRows,
        abTotalMonatlichH: abTotalMonatlichH,
        abTotalEinsaetze: abTotalEinsaetze,
        abAnfahrtTotal: abAnfahrtTotal,
        abLeistungenTotal: abLeistungenTotal,
        abGesamtBase: abGesamtBase,
        abKmRate: abKmRate,
        abTaskLabels: (abTasks || []).map((id) => AB_TASK_LABELS[id]).filter(Boolean),
        abSchedRows: abSchedRows,
        gesamt: gesamt,
      };

      const ahWrap = document.createElement("div");
      ahWrap.className = "card";
      ahWrap.style.cssText = "padding:16px 18px;";
      ahWrap.innerHTML = window.__buildAHKostenHTML(vm);

      // Wire ℹ Details toggles (delegated).
      ahWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ah-details-toggle]");
        if (!btn) return;
        const id = btn.getAttribute("data-ah-details-toggle");
        const panel = ahWrap.querySelector('[data-ah-details="' + id + '"]');
        if (!panel) return;
        const isHidden = panel.hasAttribute("hidden");
        if (isHidden) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
        btn.style.borderColor = isHidden ? "var(--accent,#0ea5e9)" : "var(--border)";
        btn.style.color = isHidden ? "var(--accent,#0ea5e9)" : "var(--muted)";
      });

      container.appendChild(ahWrap);
      return; // AH branch handled — do not fall through to generic renderer
```

Keep whatever surrounding code updates `kostenHeaderTotal` / summary widgets (`updateSummaryWidgetTotal(gesamt)` etc.) — leave those calls intact, before the injection.

- [ ] **Step 3: Manually verify in the browser**

With `npm start` running, open `http://localhost:3000`, open a configurator with Alltagshilfe, configure at least one HnD service, go to the **Kosten-Details** page. Confirm:
- The HnD table renders with Position/Menge/Einzelpreis/Gesamt columns.
- Values match the previous build for the same input.
- Clicking **ℹ Details** expands the breakdown + zone; clicking again collapses it.

- [ ] **Step 4: Run the full Playwright suite + lint**

Run: `npx playwright test tests/e2e/ah-kosten-angebot.spec.cjs && npm run lint`
Expected: PASS; no new lint errors in `script.js`.

- [ ] **Step 5: Commit**

```bash
git add src/public/script.js
git commit -m "feat(ah-kosten): render Angebot tables in Kosten-Details + wire toggles"
```

---

## Task 6: Verification matrix + finish

**Files:** none (verification only)

- [ ] **Step 1: Run the value-parity matrix manually**

With the app running, for each config below, compare the on-screen totals against the pre-change build (e.g. `git stash`-compare or the `v3` tab) — values must be identical:

1. HnD only, Kassenkunde → HnD total = `gesamtBase`; Servicepauschale footnote present.
2. HnD only, Selbstzahler → Servicepauschale is a table line; HnD total = `gesamtBase + 1,20`.
3. Alltagsbegleitung only → AB table + Fahrten/km footnote; no HnD.
4. Both services → both tables + combined **Gesamt / Monat** = `gesamt`.
5. No service → "Noch keine Leistung konfiguriert."
6. Zone determined vs. not → zone line vs. ⚠ note, inside ℹ Details.

- [ ] **Step 2: Confirm the Word template is unaffected**

Run: `npm run gen:ah`
Expected: completes without error; generated offer unchanged (no template edits were made).

- [ ] **Step 3: Final commit if any doc/notes updated**

```bash
git add -A
git commit -m "test(ah-kosten): verification matrix confirmed" --allow-empty
```

---

## Self-Review (completed)

- **Spec coverage:** line-item table (T1–T2) ✓; ℹ Details toggle w/ breakdown + zone (T3, T5) ✓; Enthaltene Leistungen line (T1) ✓; Servicepauschale folding + footnotes (T4) ✓; combined total (T2) ✓; empty state (T2) ✓; no math change / prices untouched (Global Constraints, `computeAHGesamt` not modified) ✓; Word template untouched (T6 confirms) ✓; verification matrix (T6) ✓.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** `__buildAHKostenHTML(vm)` view-model fields match those produced by `computeAHGesamt()` and mapped in T5; `serviceTable` opts keys (`gesamtLabel`, `gesamtValue`, `extraRowsHTML`, `footnoteHTML`, `schedRows`, `zoneData`) are consistent across T1–T4; toggle attributes `data-ah-details` / `data-ah-details-toggle` match between T3 (markup) and T5 (wiring).
