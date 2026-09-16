# Plan: Low-Budget → "Standard / Premium" (Phase 1: Duschwanne)

Status: **phases 1–3 implemented and verified; per-section Produktlinien since 2026-09-11.**
Mockup: `docs/mockups/duschwanne-standard-premium.html` (open in browser, tablet width).
Preise des Duschwannen-Zubehörs ändern: [preise-duschwanne-zubehoer.md](preise-duschwanne-zubehoer.md).

## 1. How it works today (verified in code)

| Thing | Where | Notes |
|---|---|---|
| Checkbox `#budgetToggle`, `name=budgetMode` value `1` | `src/public/index.html:4045` | Inline styles, sits next to `#ebenerdigeToggle` in the Duschwanne header |
| Toggle behaviour | `src/public/BadoluxManager.js` | Adds `.budget-mode` to `#form-duschwanne` + `#form-fussboden`, swaps 5 accessory images, shows `#flooringBudgetGroup`, calls hooks `setWvBudgetVisibility` / `renderBudgetWvColors` / `refreshTray` / `updatePricing`. Persists to `sessionStorage["dw_budget_mode"]` |
| Legacy fallback | `src/public/BadoluxLegacyFallback.js` | Only used when `__FEATURES__.badoluxManager === false` (`script.js:10`, boot at `script.js:15127`) |
| Banner "💰 Low Budget Modus aktiv" | `src/public/style.css:4053-4069` | `::before` on `.budget-mode` forms |
| Tray search | `script.js:10273` `initSmartTraySearch()` | **Always renders BOTH rows** (`renderTwoRows`, `script.js:10435`): Hassmann (`series=SLA`) and Badolux (`source=badolux`). The toggle only clears the selection and re-requests — it does *not* filter the rows |
| Badolux card styling | `script.js:10370` `is-budget` class; `style.css:2446`, `4071` | Yellow "Badolux" badge |
| Backend | `src/routes/trays.js` `/api/trays/suggest` | Already supports `series=` and `source=` → filtering to one row needs **no** backend change |
| Payload | `buildPayload()` `script.js:4254` | `formToObject('#form-duschwanne')` → `payload.duschwanne.budgetMode === "1"` only when checked |
| Pricing | `src/logic/pricing-core.js:686` | `isBudgetMode` → `drainSet` = `AGB001` vs `AGD9060`, `smallMaterial` = `AC004` vs `KM02`. Absent flag = premium |
| Freier Posten | `index.html` `#dw-custom` | Always visible fieldset, 4 fields, saved as `duschwanne.quickAdd[0]` (`restoreDuschwanne`, `script.js:15987`) |

### ⚠️ Pre-existing bug found

`restoreDuschwanne()` (`script.js:15946`, the *second* and active definition — the one at 14663 is shadowed)
restores every Duschwanne field **except `budgetMode`**. Loading a draft that was saved with budget ON:

- toggle comes back OFF (unless `sessionStorage` happens to still hold it from the same tab session),
- Badolux floor group + WV budget panels stay hidden,
- on re-save/re-price the offer silently flips `AGB001 → AGD9060` and `AC004 → KM02`.

This must be fixed as part of this work, otherwise the redesign will be blamed for it.

## 2. Target behaviour

- Wording: **Standard** = Badolux (was "Low Budget"), **Premium** = Vigour/Hassmann. The word "Budget" disappears from the UI only — the payload key `budgetMode`, the class `.budget-mode`, session key and all product IDs stay exactly as they are.
- Segmented control instead of a checkbox, always showing which mode is active. Tablet-sized touch targets.
- Duschwanne suggestions: show **only** the selected line (Standard → Badolux, Premium → Hassmann).
- The other line is offered only as a fallback when the selected line has **no match** for the entered size ("Keine Standard-Duschwanne in dieser Größe – Premium anzeigen?").
- Freier Posten: collapsed by default, auto-expands when neither line matches.
- ~~**Scope: one global switch**~~ — superseded 2026-09-11: the sections have their own lines now, see §9.

### Mapping (do not change)

| UI | `budgetMode` | Tray source | Accessories |
|---|---|---|---|
| Premium (default) | absent / unchecked | `series=SLA` (Hassmann) | `AGD9060`, `KM02` |
| Standard | `"1"` | `source=badolux` | `AGB001`, `AC004` |

Default stays **Premium** = today's default (unchecked) → old offers without the flag are unaffected.

## 2b. Lagerbestand-Badge (Premium/Hassmann)

Same component as the Duschabtrennung-neu configurator: pill with a circle holding the quantity —
**identical green/red styling, decided 2026-09-09**, plus one new amber state (see below).
Source there: `configurator-ui.js:678-696`, CSS `index.html:5078-5091` (`.dac-line-stock` / `.dac-stock-in`
/ `.dac-stock-out` / `.dac-stock-qty`). Green `#0a7d33` / circle `#05541f`, red `#c81e3a` / circle `#7a0e21`,
`stockText` as `title`. Rendered **only when the article carries stock data** (`hasStock` check) — copy that rule.

### Data situation (verified against the live vigor DB, 2026-09-09)

| | |
|---|---|
| `KonfiguratorDB.Products`, `productId ^(SLA\|DW)` | 107 trays; the schema (`src/models/Product.js`) has **no** stock fields |
| Of those present in `vigor.products` (by `articleNumber`) | **82 — every `SLA*` (Nuovvo/Hassmann = Premium)** |
| Not present | 25 × `DW*` = Badolux/Standard. Different supplier, not scraped → no badge, by design |
| Fields available | `stockQuantity`, `stockText`, `stockSymbol`, `lastSeenAt` |
| `stockSymbol` | `2` = im Lager (qty > 0) · `1` = muss bestellt werden (qty 0) · `3`/`6`/`9` = Verbundhaus / Zentrallager / Nachtverbund — qty 0 but deliverable |
| Distribution **on tray articles** | sym `1`: 62 · sym `2`: 17 (always qty > 0) · sym `3`: 3. Symbols `6`/`9` don't occur on trays today but do elsewhere — implement them anyway |
| Globally | qty > 0 **only ever** on symbol `2`. 4.999 articles have no `stockSymbol` at all → fall back to the old qty-only rule |

### Three states

| State | Condition | Colour | Circle | Text |
|---|---|---|---|---|
| Auf Lager | `stockQuantity > 0` | green `#0a7d33` / `#05541f` | the quantity | „Auf Lager" |
| Kurzfristig lieferbar | qty 0 **and** `stockSymbol` ∈ {3, 6, 9} | amber `#b45309` / `#78350f` | `⏱` | 3 → „Verbundhaus 2–5 Tage" · 6 → „Zentrallager 24 h" · 9 → „Nachtverbund bis 18 Uhr" |
| Auf Bestellung | everything else (incl. missing `stockSymbol`) | red `#c81e3a` / `#7a0e21` | `0` | „Auf Bestellung" |

Amber articles always carry `stockQuantity: 0`, so a number in the circle would say nothing — hence the clock
glyph. `stockText` stays the `title` in all three states.

Note: `stockSymbol` is **not** part of the `syncVigourNames.js` snapshot, so the Duschabtrennung-neu page keeps
its two-state badge for now. Giving it the amber state too is a separate, optional follow-up.

The existing Duschabtrennung configurator gets stock from a **sync-time snapshot** written into
`vigor.models/_id=vigour` by `scripts/syncVigourNames.js`. For the BU tray search we do **not** need that
detour — read it live.

### How to wire it

1. Add `fetchVigourStock(articleNumbers)` to `src/external/vigorDb.js`, next to `fetchVigourNetPrices`,
   same freshest-wins-by-`lastSeenAt` rule → `Map<articleNumber, {stockQuantity, stockText, stockSymbol}>`.
2. In `src/routes/trays.js`, after `scoreAndRank`, look the ranked ids up (one `$in` query, results are ≤ a
   handful) and attach `stockQuantity` / `stockText` / `stockSymbol` to each result. **Fail open**: if the vigor DB is
   unreachable, log and return the results without stock fields — the badge then simply doesn't render.
   A stock lookup must never break the tray search.
3. Frontend `buildCard()`: render the pill when `stockQuantity != null || stockText != null`, three states per the table above.
4. `heightCm` and everything else stays as it is.

⚠️ **Display-only, never persisted.** Do not write `stockQuantity` into `payload.duschwanne`, the PDF, or the
DOCX. Stock at quote time is not stock at order time — same warning the header of `scripts/syncVigourNames.js`
already carries. The badge is a hint for the technician on site, nothing more.

Open detail: the red pill currently shows a `0` in the circle (that's what the existing component does).
If a plain red dot without a number is preferred for "auf Bestellung", that is a one-line CSS/markup change —
but it would then differ from the Duschabtrennung page.

## 3. Implementation steps

1. ~~**Restore fix**~~ ✅ **done** — see §5.
2. ~~**Markup**~~ ✅ — replace the `<label for="budgetToggle">` block in `index.html:4045` with the segmented control. Keep `<input id="budgetToggle" name="budgetMode" value="1" hidden>` inside it so `formToObject`, `BadoluxManager`, and the legacy fallback keep working untouched. The segmented buttons only set `.checked` + dispatch `change`.
3. ~~**CSS**~~ ✅ — new `.tier-switch` block; replace the `::before` yellow banner (`style.css:4053`) with the switch itself as the status indicator.
4. ~~**Tray rendering**~~ ✅ — in `renderTwoRows()`, render one row based on `#budgetToggle.checked`; keep both fetches (cheap, parallel, already there) so the fallback banner can say whether the other line has matches.
5. ~~**Freier Posten**~~ ✅ — wrap `#dw-custom` in a `<details>`; force-open when both lists are empty. Field names must not change.
6. ~~**Mismatch guard on restore**~~ ✅ Because both rows are visible today, existing offers can carry a
   `chosenTrayProductId` from the *other* line than their `budgetMode` (e.g. `budgetMode` absent = Premium, but a
   `DWBL…` Badolux tray saved). With one row rendered, that card would no longer exist in the DOM and the selection
   would vanish silently.
   **Never auto-switch the tier to match the product** — the tier drives the accessory IDs
   (`AGB001/AC004` vs `AGD9060/KM02`), so switching it on load would change the price of a saved offer.
   Instead: keep the restored tier as saved, resolve the saved product id, and render it as a **pinned card**
   above the list, labelled „Gespeicherte Auswahl (<Marke>)", with an explicit
   „Zu <andere Linie> wechseln" button the user must press. Detection: the product's `source` /
   `productId` prefix vs the active tier.
7. ~~**Stock badge**~~ ✅ — see §7.
8. ~~Fußboden + Wandverkleidung~~ ✅ — see §8.

## 4. Test checklist (regression is the risk, not the UI)

- [ ] Old draft, no `budgetMode`: loads → Premium selected, Hassmann row, prices identical to before (compare `/api/pricing` totals pre/post change).
- [ ] Old draft with `budgetMode:"1"`: loads → Standard selected, Badolux row, Badolux floor group visible, WV budget panels visible, `AGB001`/`AC004` in pricing.
- [ ] Old *offer* (not draft) restore path (`restoreConfiguratorFromSnapshot` / `_LEGACY`) — same two cases.
- [ ] Saved tray selection (`chosenTrayProductId`) still re-checks after restore even though only one row renders.
- [ ] **Cross-line offer**: `budgetMode` absent + Badolux tray saved → tier stays Premium, tray appears as pinned card, price identical to before the change. Same test mirrored (budgetMode "1" + `SLA…` tray).
- [ ] Switching Standard↔Premium clears `chosenTrayProductId` (current behaviour, `script.js:10578`).
- [ ] PDF/DOCX output unchanged for both cases.
- [ ] `sessionStorage["dw_budget_mode"]` still honoured on a fresh page load without a draft.
- [ ] Feature flag off (`__FEATURES__.badoluxManager = false`) → legacy fallback still binds to the hidden checkbox.
- [ ] Tablet (iPad landscape + portrait) layout.
- [ ] Vigor DB unreachable → tray search still returns results, just without badges (kill the URI in `.env` and retry).
- [ ] Badolux/Standard cards show **no** badge (no stock data) — not a red "0" badge.
- [ ] Amber state: an article with qty 0 + `stockSymbol` 3 renders amber „Verbundhaus 2–5 Tage", not red (e.g. a 120×100 SLA tray).
- [ ] Article with qty 0 and **no** `stockSymbol` still renders red „Auf Bestellung".
- [ ] `stockQuantity` does not appear anywhere in the saved payload / PDF / DOCX.


## 5. Step 1 — restore fix (done 2026-09-09)

Three bugs, all pre-existing, all in the same failure chain. Verified live against a local server
(port 3000) with the unmodified code on port 3001 as the control.

| # | Bug | Fix |
|---|---|---|
| 1 | `restoreDuschwanne()` never restored `budgetMode`, and a leftover `sessionStorage["dw_budget_mode"]` could flip an unrelated premium offer to Badolux | `setCheckbox("budgetToggle", …)` as the **first** thing in `restoreDuschwanne()`. Absent/false/"" all restore as OFF, explicitly — the checkbox only serializes when checked, so "absent" is the normal premium case |
| 2 | Badolux floor and wall selections were dropped: those tiles are fetched asynchronously and don't exist while restore runs | The renderers now announce (`notifyBudgetTilesRendered()`), and the restores register what to re-apply (`registerBudgetReapply(key, fn)`). Whoever renders last re-applies the newest saved selection — no waiting, no ordering to get wrong. The first attempt (each restore awaits its own render) raced: two waiters each triggered a render and the later one wiped what the earlier had just selected |
| 3 | Concurrent renders duplicated every tile (clear → `await` → append, so both calls appended). Reproducible by toggling the checkbox twice quickly, independent of restore | Render tokens in `renderBudgetWvColors()` and `BadoluxManager.renderBudgetFloors()` — clear only after the list is in, and bail if a newer render started. `BadoluxManager` already declared an unused `floorRenderToken` for exactly this |

Files: `src/public/script.js`, `src/public/BadoluxManager.js`, `tests/unit/budget-mode-restore.test.js` (new, 7 tests).

### Verified

| Case | Unmodified (port 3001) | Fixed |
|---|---|---|
| Budget offer, `budgetMode:"1"`, Badolux floor BP003 + wall WP004, poisoned session | toggle **off**, floor silently swapped to the default `V5FB02\|Lava-Beige`, wall reset to „Marmor weiß", drain image back to premium | toggle on, BP003 selected, WP004 selected, 997-override kept, `assets/budget/AGB001.png` |
| Legacy premium offer (no `budgetMode`), session poisoned with `"1"` | — | toggle off, budget groups hidden, premium floor + colour, session corrected to `"0"`, premium drain image |
| Tile duplication | 21 wall tiles / 10 floor tiles | 7 / 5 |

Unit suite: 6 suites / 13 tests fail **identically before and after** (`sidebarGroups`, `StateManager`,
`config/offers`, `EventBus`, `logic/pricing`, `vigor-live-price`) — all pre-existing, none touched by this change.

### Notes for whoever picks this up

- `restoreFlooringSelections()` (`script.js:1170`) is **dead code** — nothing calls it. The live path is
  `restoreFloorColorFromPayload` inside `restoreDuschwanne`. Don't "fix" the wrong one.
- `syncColorWithAreaDW()` deliberately clears the floor colour when `#floorArea` is empty. A test payload
  without `floorArea` will therefore look like a broken restore when it isn't.
- There are **two** `restoreDuschwanne` declarations (`script.js:14663` shadowed, `~15972` live) and two
  `restoreFloorColorFromPayload`. script.js is a classic script, not a module, so the later declaration wins.
  Edits must go into the later one. Deleting the dead copy is a separate cleanup.
- `.claude/launch.json` (git-excluded, local only) gained a `konfigurator-3000` entry so this worktree can run
  while another chat holds port 3001.


## 6. Steps 2–6 — Duschwanne UI (done 2026-09-09)

### ⚠️ Found while doing it: budgetMode never reached the payload

`#budgetToggle` sat **outside** `#form-duschwanne` with no `form=` attribute, so `FormData` skipped it.
Verified in the browser: `buildPayload().duschwanne.budgetMode` was absent even with the toggle on. Consequence:
`pricing-core.js` `isBudgetMode` has **always** been false, so a Low-Budget offer showed the Badolux accessory
*images* but was priced, exported and ordered with `AGD9060` / `KM02`.

Fixed with `form="form-duschwanne"` on the input. **This changes prices for new Standard offers** — they now
quote `AGB001` / `AC004` (cheaper), which is what is actually installed. Offers saved before this have no flag,
restore as Premium, and are byte-for-byte unaffected.

### What changed

| Area | Change |
|---|---|
| `index.html` | Checkbox → segmented control (`.tier-switch`), status line `#tierStatus`. The input keeps its id/name/value and stays the single source of truth; the buttons only flip it. Freier Posten wrapped in `<details id="dw-custom-details">` — field names untouched |
| `style.css` | `.tier-switch` / `.tier-seg` / `.tier-status`, pinned card, fallback box, collapsible Freier Posten, dark-mode overrides. The yellow „💰 Low Budget Modus aktiv" `::before` banner is gone — the switch is the indicator now |
| `script.js` | `getTrayTier` / `setTrayTier` / `syncTierSwitchUi` / `initTierSwitch`; `renderTwoRows` → `renderRows` (one line + fallback + pinned card); `updateCustomPostVisibility`; the tier-change listener no longer wipes a restored selection (`window.__RESTORING__` guard) |
| `BadoluxManager.js`, `BadoluxLegacyFallback.js` | New `syncTierUi` hook / `window.syncTierSwitchUi?.()` call: both restore `sessionStorage["dw_budget_mode"]` by setting `.checked` directly with no change event, so nothing else would notice and the switch would read Premium on a Standard session |

### Verified in the running app (port 3000)

- Premium default → only Hassmann cards; Standard → only Badolux cards; switch, status colour and heading all follow.
- 100×210 in Standard → „Keine Standard-Duschwanne in dieser Größe. In der Linie Premium gibt es 2 passende Treffer ab 660,87 €" + working „Zu Premium wechseln".
- 100×400 → neither line matches; Freier Posten opens itself, turns amber, relabels to „Sonderform / Maßanfertigung". A manual close sticks (`data-user-closed`).
- Cross-line offer (Premium + saved `DW020`): pinned amber card above the Premium list, `chosenTrayProductId` stays `DW020`, tier stays Premium, „Auf Standard umstellen" offered but not taken automatically.
- Changing a dimension that excludes the picked tray no longer drops it silently — added 2026-09-10 after a third report from the tablet. The drop itself is correct (an 80 cm tray does not fit a 90 cm requirement) and is pre-existing `clearChosen` behaviour; what was missing is that the technician saw the choice and the price vanish with no reason. `renderRows` now shows „Bisherige Auswahl entfernt: <Produkt> … passt nicht mehr zu den eingegebenen Maßen (gesucht war 80 × 100 cm)" with a „Vorherige Maße zurück" button. The search dimensions are stored alongside the selection in `dw_tray_selection` for that undo. When the tray still fits the new dimensions it is re-selected automatically, as before.
- Switching the line un-freezes a saved offer and recomputes — fixed 2026-09-10 after a second report from the tablet. `initLivePricingSync` ignores untrusted events on purpose (a restore fires plenty of synthetic ones), and the segmented control flips the hidden checkbox programmatically, so nothing un-froze and a frozen offer kept showing its pinned total. `setTrayTier` now calls `requestPricingRefresh` itself, except during a restore.
- Pressing „Auf Standard umstellen" keeps the product selected (it belongs to the target line) — fixed 2026-09-10 after a report from the tablet; the tier-change listener cleared the selection on every switch. Only the pinned card carries `data-tray-keep="1"`; a click on the segmented control and the fallback banner still drop the selection as before.
- Old-draft restore, both cases, still green through the new UI, and `budgetMode` now round-trips (`"1"` / absent).
- Tablet 768×1024: no horizontal overflow, 52px touch targets. No console errors.
- Unit suite: 219 pass, same 6 pre-existing suites fail as before.


## 7. Step 7 — Lagerbestand badges (done 2026-09-09)

| Where | What |
|---|---|
| `src/external/vigorDb.js` | `fetchVigourStock(articleNumbers)` + `pickFreshestStock(docs)`, mirroring the existing `fetchVigourNetPrices` / `pickFreshestNetPrices` pair. Freshest-wins by `lastSeenAt`, counting only docs that actually carry stock data — the scraper reaches the same article through several config paths and not every path records stock |
| `src/routes/trays.js` | `attachStock(results)` after `scoreAndRank`: one `$in` lookup, attaches `stockQuantity` / `stockText` / `stockSymbol` |
| `src/public/script.js` | `trayStockState(p)` + the pill in `buildCard`, rendered only when the article carries stock data |
| `src/public/style.css` | `.sc-stock` etc., same colours as `.dac-line-stock` on `#page-DuschabtrennungNeu` |

### Fail-open **and** fail-fast

The first version only caught the error. Measured against a server pointed at an unreachable vigor DB: the
search still returned its results, but took the full mongoose server-selection timeout — 1.5 s with an explicit
setting, and **30 s on the production URI, which has none**, on *every* search. A 30-second search is worse
than no badges, so `attachStock` races the lookup against `STOCK_LOOKUP_TIMEOUT_MS = 1500`.

Measured: unreachable vigor DB → 1.59 / 1.53 / 1.52 s, HTTP 200, 3 results, no stock fields, no badges.
Healthy → 65–75 ms with stock attached.

### Verified

- `SLA100` qty 10 → green „10 Auf Lager"; `SLA110100` qty 0 sym 1 → red „0 Auf Bestellung";
  `SLA11075` sym 3 → amber „⏱ Verbundhaus 2–5 Tage".
- Badolux (`DW020`–`DW022`) come back with no stock fields at all → no badge, as intended.
- `stockText` (which can contain `<b>` from the scraper) goes through `escapeHtml` **plus** a quote replacement
  before landing in the `title` attribute — `escapeHtml` alone does not escape quotes.
- `tests/unit/tray-stock-badge.test.js`: 11 tests. Full suite 229 pass; the 6 known suites still fail, and
  `offline-save-queue` times out under parallel load but passes alone (same flakiness as `vigor-live-price`).

### Follow-up für die Fachseite

Weil `budgetMode` bis jetzt nie im Payload ankam, wurden die Badolux-Artikel **nie** abgerechnet — jedes
Angebot lief über `AGD9060` / `KM02`. Seit der Korrektur wirken die hinterlegten Preise real, und zwei davon
sehen falsch aus: `AGB001` (33,42 €) ist teurer als das Premium-Pendant `AGD9060` (20,20 €), und `AC004` ist
ein „1KU-PU-Kleber" für 7,59 € an der Stelle von „Kleinmaterial groß" (150,00 €). Details und Änderungsweg:
[preise-duschwanne-zubehoer.md](preise-duschwanne-zubehoer.md).

### Not done on purpose

- Display-only. `stockQuantity` is never written into the payload, PDF or DOCX — stock at quote time is not
  stock at order time.
- The Fußboden and Wandverkleidung tiles get no badges yet; that belongs with phase 2.
- `#page-DuschabtrennungNeu` keeps its two-state badge: its data comes from the `syncVigourNames.js` snapshot,
  which does not carry `stockSymbol`. Adding the field there is a small separate follow-up.


## 8. Phase 2 — Fußboden + Wandverkleidung (done 2026-09-10)

Same promise as the Duschwanne: only the active line is shown. One global flag still, as decided.

| Area | Change |
|---|---|
| `index.html` | The segmented control + status line now also sit on `page-Fussboden` and `page-Wandverkleidung`. **Only the buttons** — the single `input[name=budgetMode]` stays on the Duschwanne page; a second one would put duplicate values in the payload. Labels renamed: „Budget-Fußboden (Badolux)" → „Standard-Fußboden (Badolux)", „Budget-Wandpaneele" → „Standard-Wandpaneele", premium groups labelled as such. `#flooringPremiumGroup` added as a handle |
| `script.js` | `PRODUKTLINIE_GROUPS`, `setGroupActive`, `clearHiddenLineSelection`, `ensureRadioDefault`, `syncProduktlinieGroups`, called from `syncTierSwitchUi` and again from `notifyBudgetTilesRendered` once the async Badolux tiles exist. `syncTierSwitchUi` updates every `.tier-status`, not just `#tierStatus` |

### Three things that had to be got right

1. **`#wvBudgetColorSection` was nested inside `#wvColorSection`.** Hiding the premium group therefore hid the
   Badolux panels with it, leaving Standard mode with no wall panels at all. Moved out to be a sibling.
2. **Hidden is not enough — the inactive group is disabled too.** Otherwise its inputs stay in `FormData` and
   in HTML validation, and the premium `wvColor` radios are `required`: a hidden required radio makes the form
   unsubmittable and, worse, unfocusable.
3. **A `required` radio group is only satisfied by a checked radio**, and both lines share `name="wvColor"`.
   Disabling the premium radios does not lift the requirement, so the active line gets its own default via
   `ensureRadioDefault` — preferring the markup's own `checked` attribute, so returning to Premium restores
   „Marmor weiß" instead of silently picking another decor. Likewise `syncColorWithAreaDW` now only auto-picks
   from enabled tiles, or it would tick an invisible premium floor while Standard is active.

### Verified in the running app

- Premium → premium groups visible, Badolux hidden + disabled. Standard → the reverse, and the Badolux panels
  actually render (that is what the nesting fix bought).
- Switching away from a line that holds a selection clears it and says so:
  „Fußbodenfarbe: „Hydroträgerplatte steingrau" gehört zur Linie Standard und wurde entfernt." Price follows
  (4736,20 € → 3635,64 €).
- `form-wandverkleidung` stays **valid** in Premium, Standard, and back again — with „Marmor weiß" restored.
- Restore, both cases, still green and **silent** (no toast): legacy premium offer → Premium, `V5FB02|Loft-Grau`,
  flag absent; Standard offer → Standard, `BP003`, `WP004`, flag `"1"`.
- Unit suite: 247 pass, same 6 pre-existing suites fail.

### Still open

- Per-section switches (Duschwanne/Fußboden/Wandverkleidung independently) — deliberately not built; one flag,
  as decided 2026-09-09.
- Stock badges exist only on the Duschwanne suggestions, not on floor/wall tiles.


## 9. Per-section Produktlinien (2026-09-11)

The global flag made switching the Wandverkleidung throw away the Duschwanne and Fußboden selections. That is
not how these are sold — a Badolux floor next to a Vigour shower tray is a normal combination.

### Data model

| Section | Field | Lives in | Reaches pricing? |
|---|---|---|---|
| Duschwanne | `budgetMode` | `payload.duschwanne` (unchanged) | **yes** — swaps `AGB001`/`AC004` ↔ `AGD9060`/`KM02` |
| Fußboden | `floorBudgetMode` | `payload.duschwanne` (the Fußboden form merges in there) | no |
| Wandverkleidung | `wvBudgetMode` | `payload.wandverkleidung` | no |

All three are **additive and independent**: a missing field means Premium, and one section's field is never
consulted for another. No migration and no version marker are needed, because **none of the 3075 saved
offers/drafts carries any of them** (verified) — every one of them restores exactly as before.

Deliberately *no* fallback from `budgetMode` to the other two: it would misfire on precisely the combination
this change exists to allow (Standard Duschwanne + Premium Fußboden). The only cost is that a draft saved
during the 2026-09-09/10 testing window, which has `budgetMode` alone, restores with Premium floor and wall.

`floorBudgetMode` and `wvBudgetMode` are UI-only — the chosen floor panel or wall decor carries its own price,
so the server never needs the flag. Do not add them to `pricing-core.js`.

### Implementation

`PRODUKT_LINES` maps each key to its toggle, its page and its groups; `getLine(key)` / `setLine(key, tier)`
replace the single getter/setter (`setTrayTier` remains as the Duschwanne-specific wrapper). A switch belongs
to the line of the page it sits on (`lineKeyForElement`). `syncProduktlinieGroups` walks all three lines and
only touches each one's own groups. `BadoluxManager.applyAll` no longer touches Fußboden or Wandverkleidung —
driving them from the Duschwanne checkbox is exactly the bug — it keeps the accessory images and the
`.budget-mode` class.

**Watch out:** the renderers end by calling `notifyBudgetTilesRendered()`, which calls back into
`syncProduktlinieGroups`. Rendering from there again is an infinite loop that freezes the tab — hence the
`render: false` argument on that path. Cost me two wedged browser tabs to find.

### Verified in the running app

- Duschwanne `SLA100` + premium floor + premium wall, then switch **only** the Wandverkleidung: tray and floor
  untouched, only the wall line flips. That was the report.
- Payload round-trip: mixed → `budgetMode` absent, `floorBudgetMode` absent, `wvBudgetMode: "1"`;
  all-Standard → all three `"1"`.
- Restore, legacy payload with a poisoned `sessionStorage`: all three Premium, `V5FB02|Loft-Grau`, „Marmor weiß".
- Restore, mixed payload: Duschwanne Standard, Fußboden **Premium**, Wandverkleidung Standard — each section
  following its own field.
- Unit suite: 251 pass, same 6 pre-existing suites fail.


## 10. Warnung statt Meldung beim Linienwechsel (2026-09-16)

Zwei Meldungen aus der Praxis:

1. Auf einem **neuen** Angebot erschien beim Wechsel „Wandverkleidungsfarbe: „Marmor weiß" gehört zur
   Linie Premium und wurde entfernt" — „Marmor weiß" ist aber der **Vorgabewert aus dem Markup**, den
   niemand ausgewählt hat und der beim Zurückwechseln sofort wieder da ist. Es ging nichts verloren,
   also war die Meldung reines Rauschen.
2. Bei einem **geladenen Angebot/Entwurf** soll **vorher** gewarnt werden, nicht hinterher gemeldet.

Gelöst über „war das überhaupt eine Auswahl?" statt Raten:

- `__lineUserChoice` je Bereich, gesetzt von einem delegierten `change`-Listener, der **nur echte
  (`isTrusted`) Eingaben** zählt — eine Wiederherstellung feuert reichlich synthetische Events.
- `restoreWV` / `restoreDuschwanne` setzen die Markierung selbst, wenn das Angebot eine Farbe bzw.
  einen Bodenbelag mitbringt: eine gespeicherte Auswahl ist eine echte Auswahl.
- `setLine()` fragt **vor** dem Umschalten per `window.confirm` (die im Projekt übliche Form für
  Datenverlust-Warnungen, vgl. „Alle Auswahlen dieser Konfiguration gehen verloren"). Abbrechen lässt
  Linie **und** Auswahl unangetastet.
- Nach dem Wechsel wird die Markierung zurückgesetzt — die Vorgabe der neuen Linie ist keine Auswahl.
- Der nachgelagerte Toast entfällt ersatzlos; `clearHiddenLineSelection()` räumt nur noch auf.

Dialogtext: „Wandverkleidung auf „Standard" umstellen? — Die bisherige Auswahl „Stein beige" gehört zur
Linie Premium und wird entfernt. Sie müssen anschließend neu wählen."

### Geprüft

| Fall | Verhalten |
|---|---|
| Neues Angebot, nur Vorgabe | 0 Dialoge, 0 Toasts; „Marmor weiß" ist nach Hin- und Zurückwechseln wieder da |
| Eigene Wahl „Stein beige", **Abbrechen** | Linie bleibt Premium, „Stein beige" bleibt gewählt |
| Eigene Wahl „Stein beige", **OK** | Wechselt, neue Linie startet auf ihrer Vorgabe |
| Geladenes Angebot (Wand + Boden) | Beide Bereiche warnen mit Namen; die Wiederherstellung selbst fragt nichts |

Unit-Suite: 257 grün, dieselben 6 vorbestehenden Suites rot.
