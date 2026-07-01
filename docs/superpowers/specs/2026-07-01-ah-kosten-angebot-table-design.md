# AH Kosten → Angebot-style line-item tables

**Date:** 2026-07-01
**Branch:** `feature/ah-kosten-angebot-table` (off `v3`)

## Problem

In the Alltagshilfe configurator, the **Kosten-Details** step renders the two AH
services — *HnD-Leistungen* (Haushaltsnahe Dienstleistungen) and
*Alltagsbegleitung* — as dense, cramped cards. Each card packs a nested
5-column breakdown grid (*Zeitzeile / Einsatz / +H&R Reise / =/Einsatz /
×Freq*), task bullets, an hourly-rate column, and footer boxes with footnotes.

This view is customer-facing but reads like an internal calculation worksheet.
The goal is to make it calm and legible — it should **read like an Angebot
(offer)**, not a data dump.

## Non-goals / out of scope

- **Prices are already correct** (40,56 € HnD, 53,04 € Alltagsbegleitung) across
  `script.js` and `docx-template.js`. No price change.
- **No math changes.** `computeAHGesamt()` stays byte-for-byte the same; the
  redesign only reformats the values it already returns.
- **Data entry is untouched** — the add-a-service card form on the AH page
  (`page-ah`) is not part of this work.
- **The Word template is untouched** (`src/templates/generate-ah.mjs`,
  `src/routes/docx-template.js`).

## Scope

Only the AH rendering block inside the `initKostenDetails` IIFE in
`src/public/script.js` (~lines 10627–10790): the `buildSvcCard` helper and the
two `renderedCards.push(...)` calls for HnD and Alltagsbegleitung.

## Design

### Layout: one calm line-item table per service

Each service renders as a titled Angebot-style table:

```
Haushaltsnahe Dienstleistungen
────────────────────────────────────────────────
Position               Menge      Einzel     Gesamt
────────────────────────────────────────────────
Leistungen            12,5 h     40,56 €    507,00 €
Anfahrtspauschale         4×      7,96 €     31,84 €
────────────────────────────────────────────────
Gesamt / Monat                             538,84 €        [ℹ Details]
```

- Four columns: **Position · Menge · Einzelpreis · Gesamt**.
- Numbers right-aligned; generous row padding; quiet borders. Visual feel
  matches the printed Word offer.
- All values come verbatim from `computeAHGesamt()`:
  - **Leistungen** row: `totalMonatlichH` h × `stundensatz` = `leistungenTotal`.
  - **Anfahrtspauschale** row: `totalEinsaetze` × 7,96 € = `anfahrtTotal`.
  - **Gesamt / Monat**: `gesamtBase` (+ Servicepauschale when applicable, see
    below).

### ℹ Details toggle (per service)

- Collapsed by default. One toggle button per service table.
- Expanded, it reveals the **existing internal breakdown** — the
  *Zeitzeile / Einsatz / +H&R Reise / =/Einsatz / ×Freq = /Mon.* grid — plus the
  **zone / Reisezeit banner**.
- Rationale: customers see calm numbers; staff are one click from the full math.
  Nothing is lost, only relocated.

### Included tasks ("Enthaltene Leistungen")

- The service subtitle (e.g. *"Angebot zur Unterstützung im Haushalt —
  Haushaltsnahe Dienstleistung"*) and the selected task labels render as a
  compact "Enthaltene Leistungen" line/list under the service title, outside the
  number grid.

### Service-specific footnotes

Restyled from dashed boxes into quiet footnotes below the relevant table:

- **HnD Servicepauschale Reinigungsutensilien** (1,20 €/Monat, incl. MwSt.):
  - If **Selbstzahler**: appears as a line in the table and is folded into
    *Gesamt HnD-Leistungen* (unchanged logic).
  - Otherwise: rendered as a quiet "* Separate Direktrechnung — nicht im
    Gesamtbetrag" footnote below the table.
- **Alltagsbegleitung Fahrten** (0,35 €/km, incl. MwSt.): quiet
  "* Separate Direktrechnung" footnote below the table.

### Combined total

When both services are present, a **Gesamt / Monat** grand-total row renders
below both tables, using `gesamt` (which already accounts for the Selbstzahler
Servicepauschale). Same behavior as today.

### Empty state

When no AH service is configured, the existing "no service" message is
preserved.

## Data flow

```
AH page (data entry)  →  ahServicesJson (hidden input)
                      →  computeAHGesamt()  [UNCHANGED]
                      →  initKostenDetails AH block  [REDESIGNED]
                      →  costsSummary DOM (Kosten-Details page)
```

## Testing / verification

- Manual verification against representative configurations, comparing on-screen
  totals to the current build (values must be identical):
  1. HnD only, Kassenkunde.
  2. HnD only, Selbstzahler (Servicepauschale folds into total).
  3. Alltagsbegleitung only.
  4. Both services (grand total appears).
  5. No service configured (empty state).
  6. Zone determined vs. not determined (banner content inside ℹ Details).
- Confirm the ℹ toggle expands/collapses the breakdown + zone banner per service.
- Confirm generated Word Angebot is unaffected (no template changes).

## Risks

- The AH block is embedded in a large single file; edits must stay inside the
  identified region and reuse existing helpers (`euroC`, `fmtH`,
  `formatDurationHHMM`, `escapeHtml`, `card`).
- Selbstzahler / non-Selbstzahler branching must be preserved exactly to keep
  totals correct.
