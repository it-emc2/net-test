# Duschwanne: Two-Row Suggestions (Hassmann + Badolux)

**Date:** 2026-06-29
**Branch:** `feature/duschwanne-two-row-suggestions`

## Goal

In the Badumbau konfigurator's Duschwanne (shower tray) step, remove the
`Badolux` and `Slate` filter checkboxes. When the user enters the tray
dimensions (Maße), show **two labeled rows of suggestions at once** instead of
the current single mixed list:

- **Hassmann** — products from the current "slate" category (`SLA*` product IDs)
- **Badolux** — products from the current "badolux" category (`source: "badolux"`)

This lets the user see options from both categories simultaneously rather than
toggling a filter.

## Decisions (from brainstorming)

- **Per-row count:** up to **3** suggestions per row (top 3 closest matches each).
- **Selection model:** **single selection total** — picking any card in either
  row deselects everything else. A shower needs only one tray.
- **Empty category:** still render the row's heading and show a small
  "Keine passenden Vorschläge" note.
- **Budget toggle:** no longer gates the suggestion list (both rows always
  shown). The toggle element itself is left untouched (it may affect pricing
  elsewhere).

## Approach

**Two parallel fetches, reusing the existing endpoint — no backend change.**

`/api/trays/suggest` already accepts `series=SLA` and `source=badolux`. When the
dimensions change, the frontend fires two requests in parallel:

- `/api/trays/suggest?w=<>&l=<>&series=SLA` → **Hassmann** row (top 3)
- `/api/trays/suggest?w=<>&l=<>&source=badolux` → **Badolux** row (top 3)

Both share one `AbortController` and a single `reqSeq` stale-response guard.

*Alternatives rejected:*
- A new grouped backend endpoint returning `{hassmann, badolux}` — adds backend
  surface for no real gain.
- One fetch + client-side split — fails because the endpoint caps results at 3
  total, so one category could be starved.

## Changes

### 1. HTML — `src/public/index.html` (~3040–3052)

Delete the filter checkbox block:

```html
<div class="row" style="gap:16px; margin: 6px 0 10px; flex-wrap:wrap;">
  <label class="check-pill" ...><input id="trayFilterBadolux" type="checkbox" />...Badolux</label>
  <label class="check-pill" ...><input id="trayFilterSlate" type="checkbox" />...Slate</label>
</div>
```

The Maße inputs (`tray_w_cm`, `tray_l_cm`, hidden `tray_h_cm`), the
`#tray-suggestions` container, and the hidden `chosenTrayProductId` / `traySize`
fields stay exactly as they are.

### 2. Frontend — `src/public/script.js` (`initSmartTraySearch`, ~8666–8979)

- Remove `badoluxEl` / `slateEl` lookups, the `enforceExclusiveFilters` helper,
  and the checkbox `change` listeners.
- `fetchAndRender`:
  - Empty inputs → clear everything (unchanged behavior).
  - Otherwise build the base query (`w`, `l`, `h`) and issue **two** parallel
    fetches: one with `series=SLA` (Hassmann), one with `source=badolux`
    (Badolux). Use one shared `AbortController`; bump `reqSeq` once and ignore
    both responses if a newer request started.
- New `renderTwoRows(hassmannList, badoluxList)` replacing `renderSuggestions`:
  - Render two sections, each: a heading (`Hassmann` / `Badolux`) + a
    `.suggestion-list` of up to 3 `.suggestion-card`s (reuse existing card
    markup and CSS classes).
  - **All radios keep `name="traySuggestion"`** so selection is single across
    both rows; existing `applySelection` logic is reused unchanged.
  - Source badge text is fixed per row: `Hassmann` for the slate row,
    `Badolux` for the badolux row.
  - `Beste Übereinstimmung` badge marks the top (closest) card **within each
    row**.
  - An empty category still renders its heading plus a
    "Keine passenden Vorschläge" note.
- Saved-selection restore: scan **both** lists for the persisted `productId`
  and check the matching radio if found (carry over the existing
  `dw_tray_touched` / `localStorage` behavior).
- Budget toggle: keep its existing `change` listener (harmless re-request), but
  the suggestion list no longer depends on it.

### 3. Selection / pricing — unchanged

`chosenTrayProductId` still holds a single product ID. Selecting an `SLA*`
(Hassmann) tray still triggers `toggleSlateTrayColorVisibility()` because that
function keys off the `SLA` prefix, which is unaffected by the display rename.

## Verification

There is no automated test harness for this vanilla-JS file. Verify by running
the app and confirming, with seed data containing both `SLA*` and
`source: "badolux"` products:

1. Entering dimensions renders two rows ("Hassmann" and "Badolux"), each with up
   to 3 cards.
2. Selecting a card in one row deselects any card in the other (single
   selection total).
3. Selecting a Hassmann (`SLA*`) tray reveals the slate color section.
4. A category with no matching tray shows its heading + "Keine passenden
   Vorschläge".
5. Clearing the dimension inputs clears both rows and the chosen tray.

## Out of scope

- Backend changes to `src/routes/trays.js`.
- Removing or rewiring the budget toggle.
- Changes to pricing logic.
