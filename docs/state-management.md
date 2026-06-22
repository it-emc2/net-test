# State Management — Current Runtime Model

Overview
- Purpose: explains how state is handled in this app today, including the newer `StateManager` architecture, the legacy DOM-driven runtime, and the compatibility bridge we added for pricing refresh reliability.
- Important reality: this app currently has two overlapping state styles:
  - module-based state/event architecture in `src/models/StateManager.js`, `src/events/EventBus.js`, `src/views/*`
  - legacy global + DOM-driven behavior in `src/public/script.js`
- Because the production page still loads `src/public/script.js` directly, the module-based state manager is not always bootstrapped on the live page. A lightweight compatibility facade is therefore used as a safe fallback.

Runtime architecture (current live page)

```text
Browser
  |
  +-- src/public/index.html
        |
        +-- ThemeManager.js
        +-- script.js  <-- primary live runtime
               |
               +-- DOM reads/writes
               +-- buildPayload()
               +-- updatePricing() -> /api/price
               +-- window.__pricing
               +-- window.__EMC2_STATE__ (real manager or legacy facade)
               |
               +-- initStateDrivenPricingSync()
               |      |
               |      +-- writes pricing-relevant Kundendaten fields into state
               |      +-- requests repricing
               |
               +-- initLivePricingSync()
                      |
                      +-- DOM fallback repricing for non-migrated interactions

Optional / newer architecture (not guaranteed on live page)
  |
  +-- src/models/StateManager.js
  +-- src/events/EventBus.js
  +-- src/views/*
```

Main pieces

- `src/models/StateManager.js`
  - Canonical state container for the newer architecture.
  - Holds:
    - `currentOfferType`
    - `currentStep`
    - `forms`
    - `pricing`
    - `ui.isRestoring`
    - `ui.isDirty`
  - Emits events through `EventBus`.
  - Persists to `sessionStorage`.

- `src/events/EventBus.js`
  - Lightweight event bus for cross-module communication.
  - Important events:
    - `form:field:changed`
    - `form:data:set`
    - `form:changed`
    - `field:changed`
    - `pricing:requested`
    - `pricing:updated`
    - `state:restored`

- `src/views/FormViewBase.js`
  - Base class for module-driven form views.
  - Syncs fields to and from `StateManager`.

- `src/views/pages/KundendatenView.js`
  - Newer page-level view for `Kundendaten`.
  - Contains some state/event-oriented behavior, but note:
    - the corresponding module init script is not wired into `src/public/index.html`
    - `src/public/js/pages/kundendaten-init.js` exists in the repo but is currently dormant on the live page
    - so this path is not the primary runtime on the legacy page today

- `src/public/script.js`
  - Actual live runtime for the page.
  - Builds payloads from the DOM, updates pricing, renders widgets, and coordinates most user interactions.
  - This is still the operational center of the app in the current deployment model.

Current runtime truth

- The live page currently loads:
  - `ThemeManager.js`
  - `script.js`
- Result:
  - there is no active module bootstrap entrypoint wired into `src/public/index.html`
  - the full module-based `StateManager` / `KundendatenView` stack is not guaranteed to exist on the live page
  - but `script.js` still needs state-like behavior for pricing and UI consistency

Compatibility facade

- File: `src/public/script.js`
- Helper: `ensureLegacyStateFacade()`
- Purpose: provides a minimal `window.__EMC2_STATE__` object when the real module-based state manager is absent.
- Supported methods/shape:
  - `state.forms`
  - `state.pricing`
  - `setField(formKey, field, value)`
  - `setFormData(formKey, data)`
  - `getField(formKey, field)`
  - `getFormData(formKey)`
  - `setPricing(pricingData)`
  - `pricing`
  - `isRestoring`
  - `setRestoring(value)`

This facade is intentionally small. It is not a full replacement for the real module architecture. It exists so legacy runtime code can behave in a more state-driven way without forcing a risky page bootstrap rewrite.

Pricing state flow

Primary pricing functions live in `src/public/script.js`:
- `window.updatePricing(payload)`
- `window.requestPricingRefresh({ delay, payload, reason })`
- `window.getCanonicalPricingData()`

Current pricing data rules:
- `stateManager.pricing` or facade `state.pricing` is treated as preferred when available
- `window.__pricing` is still kept for backward compatibility
- `window.getCanonicalPricingData()` returns:
  - `window.__EMC2_STATE__.pricing`
  - otherwise `window.__pricing`

Why both exist
- Many existing consumers still read `window.__pricing`
- Newer code should prefer `window.getCanonicalPricingData()`
- This allows gradual migration without breaking legacy logic

Pricing refresh flow

1. User changes a pricing-relevant field
2. `initStateDrivenPricingSync()` in `src/public/script.js` inspects the target
3. If the field is pricing-relevant, it writes the value into `window.__EMC2_STATE__`
4. It then calls `window.requestPricingRefresh({ reason: "state-bridge-dom" })`
5. `window.updatePricing()` builds a fresh payload and calls `/api/price`
6. Returned pricing is written to:
  - `window.__pricing`
  - `window.__EMC2_STATE__.pricing`
7. UI consumers update from the returned pricing data and `pricing:updated`

Fallback pricing refresh

- `initLivePricingSync()` in `src/public/script.js` still listens at the DOM level
- This is intentional
- Reason:
  - the codebase is still partly legacy
  - not all pricing-affecting interactions are fully routed through state yet
- Behavior:
  - state-driven refresh is intended to be primary
  - DOM-driven refresh remains as backup
  - a recent-state-refresh guard suppresses redundant fallback requests for important `Kundendaten` fields

Why the compatibility work was needed

Problem we observed:
- `Eigenanteil` sometimes stayed stale
- users had to click `Pflegegrad` again to force a refresh

Root causes:
- pricing was async and older responses could overwrite newer ones
- important `Kundendaten` interactions were not reliably using a central state path
- on the live page, `window.__EMC2_STATE__` did not exist because the module bootstrap was not active

Fixes added

- Request sequencing in `updatePricing()`
  - older pricing responses are ignored if a newer one already applied

- Canonical pricing helper
  - `window.getCanonicalPricingData()`

- State-driven pricing bridge
  - `initStateDrivenPricingSync()`
  - tracks pricing-relevant `Kundendaten` fields

- Legacy state facade
  - `ensureLegacyStateFacade()`
  - gives the bridge something safe to write into even when the full module state stack is absent

- Fallback suppression
  - generic DOM fallback skips repricing when a recent state-driven refresh already handled the same interaction

Pricing-relevant fields currently bridged in `Kundendaten`

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

Debugging

Enable pricing/state refresh debug logging in the browser console:

```javascript
window.setPricingDebug(true);
```

Disable:

```javascript
window.setPricingDebug(false);
```

Useful log reasons:
- `state-facade:created`
- `state-bridge:init`
- `state-bridge:inspect-target`
- `state-bridge-dom:field`
- `state-form-changed:seen`
- `requestPricingRefresh`
- `updatePricing:start`
- `updatePricing:stale-ignored`
- `updatePricing:applied`
- `live-dom-fallback:target`
- `live-dom-fallback:skipped`

What is canonical today

Safest interpretation of the current app:
- DOM is still the source of truth for many user interactions
- built payload is still derived from DOM via `buildPayload()`
- pricing result should be treated as canonical in `window.__EMC2_STATE__.pricing`
- `window.__pricing` exists as compatibility cache

What is not fully migrated yet

- Full page bootstrap through the module-based MVC stack
- Event-bus-first runtime for the legacy page
- State-first payload construction replacing DOM-first `buildPayload()`
- Removal of generic DOM fallback repricing

Safe next steps

- Convert more pricing consumers from `window.__pricing` to `window.getCanonicalPricingData()`
- Extend the state-driven pricing bridge beyond `Kundendaten`
  - good next candidates:
    - `duschwanne`
    - `wandverkleidung`
    - `optional`
    - `rabatt`
- Keep DOM listeners as fallback until those areas are migrated safely

Related docs

- `docs/pricing.md`
- `docs/state-runtime-map.md`
