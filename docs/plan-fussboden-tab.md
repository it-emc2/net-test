# Implementation Plan: Move "Fußboden" into its own tab after Duschwanne

## Goal
In the **BU (Badumbau)** flow, the "Duschwanne" tab currently contains the
*"Möchten Sie Fußboden hinzufügen?"* toggle and everything it reveals (floor
type, area calculator, colors, adhesive, sealing). Move this **entire Fußboden
block (including the toggle)** onto a **new dedicated tab** placed **directly
after Duschwanne** and before Wandverkleidung.

## Decisions (confirmed with user)
1. **Data model:** Keep all floor values under **`payload.duschwanne.*`**
   (`addFlooring`, `floorArea`, `floorKind`, `flooringProduct[]`,
   `floorAdhesive[]`, `floorSealing[]`). No new namespace, no migration.
   → Old offers stored in MongoDB restore unchanged; the server payload shape
   is identical; `Schnellspeichern` writes the same keys.
2. **Scope:** Move the **whole block including the toggle**.
3. **Label:** Tab/sidebar label **"Fußboden"**, page id **`Fussboden`**.

## Why this is low-risk
Because the persisted data stays under `duschwanne.*`:
- `pricing.js` (lines 438–492) reads `dusch.addFlooring` / `dusch.floorArea` /
  etc. → **no change needed**.
- The MongoDB model (`src/models/Draft.js`) and the save/load endpoints
  (`POST/GET /api/drafts` in `src/app.js`) store `payload` as an opaque object
  → **no change needed**.
- ExportManager / offer generation read the same `duschwanne` keys → **no
  change needed**.

The only work is (a) moving DOM into a new page section, (b) making
`buildPayload()` still collect those fields into `payload.duschwanne`, and
(c) repointing the few DOM queries that are currently **scoped to
`#form-duschwanne`** so they find the fields on the new page.

---

## Key files
| File | Role |
|------|------|
| `src/config/offers.js` | Page order for the `bu` flow (add `Fussboden`). |
| `src/public/index.html` | Move the Fußboden markup into a new `<section id="page-Fussboden">`. |
| `src/public/script.js` | Page registry, buildPayload capture, form-scoped queries, restore, resets. |
| `src/public/RestoreManager.js` | Post-restore nudge fires `#addFlooring` change. |

No server-side, model, pricing, or export changes required.

---

## Step-by-step

### Step 1 — Add the page to the BU flow order
**File:** `src/config/offers.js` (lines 5–15)

Insert `"Fussboden"` right after `"Duschwanne"`:
```js
bu: {
  name: "Badumbau",
  pages: [
    "Kundendaten",
    "Arbeitszeit",
    "Arbeiten",
    "Duschwanne",
    "Fussboden",        // <-- NEW
    "Wandverkleidung",
    "DuschabtrennungNeu",
    "Duschabtrennung",
    "Optional",
    "Rabatt",
  ],
},
```
This automatically:
- adds it to `ALL_PAGES` / `steps` (script.js:2189–2194),
- includes it in prev/next navigation (`getFlowSteps`, script.js:2556),
- renders it in the sidebar (`updateSidebarForOffer`, script.js:2614–2642),
- includes it in `pagesToRestoreFor` (RestoreManager.js:48–52).

### Step 2 — Sidebar label
**File:** `src/public/script.js` (`specialLabels`, ~line 2623)

The sidebar label defaults to the page id (`Fussboden`). To show the ß, add:
```js
const specialLabels = {
  ...,
  Fussboden: "Fußboden",
};
```
(Also verify the mobile/step nav uses the same label source; it reads from the
same `specialLabels` map.)

### Step 3 — Create the new page section and move the markup
**File:** `src/public/index.html`

1. Create a new section **after** `#page-Duschwanne` closes (before
   `#page-Wandverkleidung` at line 3972):
   ```html
   <section class="card page" id="page-Fussboden" hidden>
     <div class="page-head"><h2 style="margin:0">Fußboden</h2></div>
     <form id="form-fussboden" autocomplete="on">
       <!-- moved Fußboden block goes here -->
       <!-- prev/next nav buttons (copy pattern from Duschwanne) -->
     </form>
   </section>
   ```
2. **Cut** the Fußboden markup from inside `#form-duschwanne`:
   - the label + `#addFlooring` checkbox (index.html:3752–3755)
   - the whole `#flooringPanel` container and its contents
     (index.html:3757 through the closing `</div>` of the panel, ~line 3960)
   - the floor calculator template (`#floorCalcRowTemplate`) if it lives in
     this block — keep it together with the moved markup.
   Paste it inside `#form-fussboden`.
3. Keep all `id`s and `name`s **exactly the same** (`addFlooring`, `floorArea`,
   `floorKind`, `flooringProduct[]`, `floorAdhesive[]`, `floorSealing[]`,
   `flooringBudgetGroup`, `floorCalc*`, etc.). Unchanged ids mean all
   `document.getElementById(...)`-based logic keeps working.
4. Add the standard prev/next nav buttons (`data-nav="prev"` / `data-nav="next"`)
   inside `#form-fussboden`, matching the Duschwanne section, so the wizard
   flows Duschwanne → Fußboden → Wandverkleidung.
5. Move the Fußboden-specific CSS if it is scoped under a `#page-Duschwanne`
   ancestor. The `#flooringPanel` rules (index.html:562–592) are id-scoped and
   need no change.

### Step 4 — Register the form and keep buildPayload writing to `duschwanne`
**File:** `src/public/script.js`

`buildPayload()` currently seeds `duschwanne` from
`formToObject(document.getElementById("form-duschwanne"))` (line 3676). Once the
fields move out, `floorArea` / `floorKind` / `addFlooring` would be lost from
that object. Fix by **merging the new form into `duschwanne`**:
```js
duschwanne: {
  ...formToObject(document.getElementById("form-duschwanne")),
  ...formToObject(document.getElementById("form-fussboden")), // <-- NEW
  computed: window.__DW_COMPUTED__ || {},
},
```
The explicit array capture block (lines 3828–3866) uses
`new FormData(document.getElementById("form-duschwanne"))` to gather
`flooringProduct[]`, `floorAdhesive[]`, `floorSealing[]` and reads
`#addFlooring`. Repoint the FormData source to `form-fussboden`:
```js
const formDW = document.getElementById("form-fussboden"); // was form-duschwanne
```
(`#addFlooring` is read via `document.getElementById` so it still resolves.)
Result written unchanged into `payload.duschwanne.*`.

Also add `form-fussboden` to the `resetAllForms()` `formIds` list (line 2209).

### Step 5 — Repoint the `#form-duschwanne`-scoped queries
Search script.js for `form-duschwanne` and update the ones that touch flooring
fields to query `#form-fussboden` (or the document). Known spots:
- `syncColorWithAreaDW()` (lines 4980–4991, 5000, 5010) — `form =
  getElementById("form-duschwanne")`; the flooring color inputs now live on the
  new page → change to `form-fussboden`.
- `restoreFloorColorFromPayload` inside `restoreDuschwanne` (lines 12608,
  12640) — same repoint to `form-fussboden`.
- The flooring single-select enforcement handler (lines 5366–5390) uses
  `e.target.closest("form")` / document-wide `querySelectorAll` — verify it is
  not scoped to `#page-Duschwanne`; likely fine but confirm.
- Validation on "Weiter" (lines 5556–5562) that checks `#floorArea` /
  `flooringProduct[]` — if this validation should gate leaving the **Fußboden**
  page, move/attach it to that page's next handler; otherwise leave as-is.
Leave all `document.getElementById("floorArea")` / `#addFlooring` calls
(pricing/arbeitszeit at lines 1747, 2551, 8224–8243) unchanged — they are
id-based and page-independent.

### Step 6 — Restore path
**File:** `src/public/script.js` — `restoreDuschwanne(dw)` (lines 12552–12672)

Data still arrives under `payload.duschwanne`, and this handler already sets the
floor fields by **id/name** (`setNumber("floorArea")`, `setRadio("floorKind")`,
`setCheckbox("addFlooring")`, `restoreTrinnityFloorSealing`) which are
page-independent. After Step 5 repoints the color-restore query, restore works
as before. **Keep the flooring restore inside `restoreDuschwanne`** — do NOT add
a separate `Fussboden` restore handler, because the data lives under
`duschwanne` and `restoreDuschwanne` runs for every BU restore (Step 1 ensures
`Duschwanne` is in `pagesToRestoreFor`).

> Note: there is a second, legacy `restoreDuschwanne` (script.js:13685, inside
> `restoreConfiguratorFromOffer_LEGACY`) with its own
> `restoreFloorColorFromPayload` (13756). If the legacy path can still run,
> apply the same `form-fussboden` repoint there; otherwise confirm it's dead
> code and leave a note.

**File:** `src/public/RestoreManager.js` — `postRestoreNudges` (line 69) fires a
`change` on `#addFlooring` to re-run `apply()` (panel show/hide). Still valid
since the id is unchanged and the toggle handler (script.js:8715) binds by id.

### Step 7 — Verify the toggle/apply wiring
`apply()` (script.js:8606–8663) and the calculator setup (8224–8584) all bind
via `document.getElementById(...)`. As long as ids are preserved and the markup
exists in the DOM at init time (it does — sections are `hidden`, not removed),
no changes are needed. Confirm the init runs regardless of which page is active
(it runs on DOMContentLoaded, not on page-show).

---

## Test checklist
1. **New offer:** BU flow shows tab order Duschwanne → **Fußboden** →
   Wandverkleidung in sidebar and prev/next.
2. Toggle "Möchten Sie Fußboden hinzufügen?" on the new tab → panel, area,
   floor type, colors, calculator, adhesive, sealing all show/behave as before.
3. Pricing updates correctly (panels, adhesive packs, sealing m²) — values match
   pre-change behavior.
4. **Schnellspeichern** → inspect saved draft: `payload.duschwanne.floorArea`,
   `.floorKind`, `.addFlooring`, `.flooringProduct`, `.floorAdhesive`,
   `.floorSealing` all present.
5. **Reload a freshly saved offer:** Fußboden tab restores toggle, area, type,
   color, sealing; pricing recomputes.
6. **Reload an OLD offer** created before this change (data already under
   `duschwanne.*`): floor values still restore on the new tab — this is the key
   backward-compat check.
7. Offer PDF / Materialübersicht still list flooring correctly.
8. Reset/clear flow (`resetAllForms`) clears the new form and floor state.

## Rollback
Single-branch change; revert the commits. No DB migration performed, so stored
drafts are unaffected either way.
