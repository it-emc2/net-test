# State Runtime Map — Legacy DOM vs State-Driven

Overview
- Purpose: practical map of which runtime behaviors are still driven mainly by legacy DOM code and which ones now have an explicit state-driven path.
- Scope: current live page behavior, not an ideal future architecture.

How to read this
- `Legacy DOM` means the behavior is still primarily coordinated in `src/public/script.js` by direct DOM reads/writes, `buildPayload()`, and browser events.
- `State-driven` means there is an explicit bridge to `window.__EMC2_STATE__` or the module `StateManager` shape, even if DOM fallback still exists.
- `Hybrid` means both are active and the app intentionally supports both right now.

Current runtime categories

## 1. App bootstrap

Status
- Legacy DOM

Details
- `src/public/index.html` loads:
  - `ThemeManager.js`
  - `script.js`
- Result:
  - there is no active module bootstrap entrypoint wired into `src/public/index.html`
  - the page does not reliably boot the module `StateManager` / `KundendatenView` stack
  - `script.js` remains the primary runtime

Files
- `src/public/index.html`
- `src/public/script.js`

## 2. Form rendering and show/hide logic

Status
- Legacy DOM

Details
- Conditional sections such as:
  - Pflegekasse follow-ups
  - Vermieter-Genehmigung
  - stockwerk “Anderes OG”
  - floor area / flooring panel
  - wall panel quantity sections
- are all controlled directly via DOM event listeners and imperative `hidden` / `disabled` toggling.

Files
- `src/public/script.js`
- `src/public/index.html`

## 3. Validation

Status
- Legacy DOM

Details
- `requireBereichValid()`
- `validateBereich()`
- `validateDuschwanne()`
- `validateWandverkleidung()`
- and similar functions still operate directly against the live form DOM.

Notes
- This is currently appropriate because the live page is still DOM-first.

Files
- `src/public/script.js`

## 4. Payload construction

Status
- Legacy DOM

Details
- `buildPayload()` is still assembled from form elements using `formToObject()` plus a large amount of normalization logic.
- This means DOM remains the practical source of truth for final export/pricing payload shape.

Files
- `src/public/script.js`

## 5. Pricing result storage

Status
- Hybrid, moving toward state-driven

Current canonical rule
- Preferred source: `window.__EMC2_STATE__.pricing`
- Compatibility cache: `window.__pricing`

Details
- `window.getCanonicalPricingData()` now reads:
  - `window.__EMC2_STATE__.pricing`
  - otherwise `window.__pricing`
- `updatePricing()` writes to both.

Why this is safe
- old consumers still work
- new consumers can migrate gradually

Files
- `src/public/script.js`

## 6. Pricing refresh triggers

Status
- Hybrid

Primary path now
- `initStateDrivenPricingSync()`

Fallback path
- `initLivePricingSync()`

Details
- Pricing-relevant `Kundendaten` interactions now go through a state bridge first.
- Generic DOM-based repricing still exists for:
  - not-yet-migrated areas
  - programmatic UI changes
  - legacy interactions outside the state bridge

Files
- `src/public/script.js`

## 7. Kundendaten pricing-relevant fields

Status
- State-driven with DOM fallback

Bridged fields
- `payer`
- `aufschlag`
- `hasPflegegrad`
- `pflegegrad`
- `budgetMax`
- `twoPersons`
- `premium`
- `budgetCopay`
- `wohnumfeldDone`
- `wohnumfeldApplication`
- `wohnumfeldAmount`

Details
- The bridge writes those values into `window.__EMC2_STATE__`
- Then it requests repricing centrally
- Fallback DOM repricing still remains for safety

Files
- `src/public/script.js`

## 8. Eigenanteil / Gesamt widget

Status
- Hybrid consumer, fed by pricing updates

Details
- The widget itself is updated imperatively in `script.js`
- But it now benefits from the state-driven pricing flow because `updatePricing()` is more centralized and pricing data is canonicalized

Files
- `src/public/script.js`
- `src/public/index.html`

## 9. Kosten / Rabatt / pricing-dependent displays

Status
- Hybrid

Examples
- cost details rendering
- flooring panel price display
- grab-bonus row visibility

Details
- Some consumers still read `window.__pricing`
- core migrated consumers now use `window.getCanonicalPricingData()`
- more can be moved safely over time

Files
- `src/public/script.js`

## 10. Full module-based state architecture

Status
- Present in codebase, not primary on live page

Pieces
- `src/models/StateManager.js`
- `src/events/EventBus.js`
- `src/views/FormViewBase.js`
- `src/views/pages/KundendatenView.js`

Important note
- This architecture is real and usable, but the live legacy page does not currently bootstrap it in a fully authoritative way.
- That is why the compatibility state facade was added.

## 11. Legacy compatibility facade

Status
- State-driven support for legacy runtime

Helper
- `ensureLegacyStateFacade()`

Purpose
- Creates `window.__EMC2_STATE__` when the true module manager is absent
- Enables the new pricing/state bridge to work on the legacy page

What it is not
- not a full replacement for the module architecture
- not a complete form-state framework

Files
- `src/public/script.js`

Recommended migration order

Lowest-risk next steps
1. Convert more pricing readers from `window.__pricing` to `window.getCanonicalPricingData()`
2. Extend state-driven repricing from `Kundendaten` into:
   - `duschwanne`
   - `wandverkleidung`
   - `optional`
   - `rabatt`
3. Keep DOM listeners as fallback until each area is stable

Higher-risk steps to avoid doing all at once
- replacing DOM-first `buildPayload()` with state-only payload construction
- removing the fallback repricing listeners entirely
- forcing full module bootstrap into the current live page without a staged rollout

Useful heuristic

- If the behavior mostly controls visibility, validation, or payload normalization today:
  - assume `Legacy DOM`
- If the behavior writes into `window.__EMC2_STATE__` before repricing or reads from canonical pricing helper:
  - assume `State-driven` or `Hybrid`

Related docs

- `docs/state-management.md`
- `docs/pricing.md`
