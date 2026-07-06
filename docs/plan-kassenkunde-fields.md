# Implementation Plan — Additional Kassenkunde fields (all Konfiguratoren)

## Goal
When the user selects **Kassenkunde** (in any offer type / "Konfigurator": BU, BWT, HL, BL, HMS, WD, AH), show and collect five fields, persist them in the Entwurf (draft), and restore them on load:

1. **Geburtsdatum** (birthday) — `type="date"`
2. **Versicherungsnummer** — `type="text"`
3. **Name der Krankenkasse** — already exists as `kassenkundeName` (keep)
4. **Adresse der Krankenkasse** — new `type="text"`
5. **Pflegegrad seit** — `type="month"` (month/year picker)

## Decisions (confirmed with user)
- **Shared fields, no duplicates.** One field group used by *all* offer types. The AH-only `ah_geburtsdatum` and `ah_versichertenr` fields are **removed** and replaced by the new shared fields, so nothing appears twice for AH.
- **"Pflegegrad seit"** uses an HTML `month` input.
- **Save/restore only.** No changes to the generated Angebot/offer document (offerMapping.js / docx-template.js untouched).

## Architecture context (already verified)
- Single-page app. All Konfiguratoren share one form `#form-Kundendaten` in `src/public/index.html`; offer-specific visibility is driven by `data-offer="..."` attributes and JS.
- The Kassenkunde block lives at `src/public/index.html:2609-2650` (payer radios + `kassenkundeName` + AH-only `ah_versichertenr`). `ah_geburtsdatum` is at `src/public/index.html:2438-2441`.
- **Save**: `formToObject()` (`script.js:2886`) serialises every *named, enabled* input in the form via `FormData`, then `buildPayload()` (`script.js:3672`) nests it under `payload.Kundendaten`. New named inputs are captured automatically — no save-side wiring needed.
- **Restore** is an allow-list: `restoreKundendaten(k, offer)` (`script.js:12417-12516`) explicitly `setByNameOrId(...)` per field. New fields **must** be added here or they won't restore.
- **Visibility toggle**: `script.js:19863-19884` shows/hides only the `kassenkundeName` `.field` and disables its input when payer ≠ Kassenkunde (disabled inputs are excluded from FormData — this is why fields only save when Kassenkunde is active).
- The AH fields have **no** downstream dependency (grep of `src/logic`, `src/routes`, `src/services`, `src/templates`, `src/controllers` for `ah_geburtsdatum`/`ah_versichertenr` → no matches). Safe to remove.

## Field IDs / names (new)
| Label | id = name | type |
|---|---|---|
| Geburtsdatum | `kk_geburtsdatum` | date |
| Versicherungsnummer | `kk_versichertennr` | text |
| Name der Krankenkasse | `kassenkundeName` (existing) | text |
| Adresse der Krankenkasse | `kk_krankenkasseAdresse` | text |
| Pflegegrad seit | `kk_pflegegradSeit` | month |

---

## Changes

### 1. `src/public/index.html` — restructure the Kassenkunde block
Replace the current fragment at **2642-2649** (the lone `kassenkundeName` field + AH-only `ah_versichertenr`) with a single wrapper `#kassenkundeDetails` containing all five fields in logical order (identity → insurer → care):

```html
<!-- shown only when payer === "Kassenkunde"; toggled + enabled/disabled by JS -->
<div id="kassenkundeDetails" class="full" style="display:none; margin-top:8px;
     display:grid; grid-template-columns:1fr 1fr; gap:12px;">
  <div class="field">
    <label for="kk_geburtsdatum">Geburtsdatum</label>
    <input id="kk_geburtsdatum" name="kk_geburtsdatum" type="date" />
  </div>
  <div class="field">
    <label for="kk_versichertennr">Versicherungsnummer</label>
    <input id="kk_versichertennr" name="kk_versichertennr" type="text" placeholder="z. B. A123456789" />
  </div>
  <div class="field">
    <label for="kassenkundeName">Name der Krankenkasse</label>
    <input id="kassenkundeName" name="kassenkundeName" type="text" placeholder="z. B. AOK Nord" />
  </div>
  <div class="field">
    <label for="kk_krankenkasseAdresse">Adresse der Krankenkasse</label>
    <input id="kk_krankenkasseAdresse" name="kk_krankenkasseAdresse" type="text"
           placeholder="Straße, PLZ Ort" />
  </div>
  <div class="field full">
    <label for="kk_pflegegradSeit">Pflegegrad seit</label>
    <input id="kk_pflegegradSeit" name="kk_pflegegradSeit" type="month" />
  </div>
</div>
```
Notes:
- Keep the existing `id="kassenkundeName"` (so pricing/docx mapping `KrankenkasseKunde` at `offerMapping.js:602` and `docx-template.js:1605` keeps working).
- The initial-display fix: set the wrapper hidden by default (`display:none`); JS reveals it. Use a single inline style block — don't have two `display` declarations (drop the `display:none` and instead rely on JS `update()` running on load to hide it, OR add a `hidden` attribute and have JS clear/set it). Cleanest: give it `hidden` attribute and toggle `hidden` in JS.
- Remove the AH-only `Geburtsdatum` field at **2438-2441** (`ah_geburtsdatum`), since it's now covered by `kk_geburtsdatum` in the shared block.

### 2. `src/public/script.js` — generalise the visibility toggle (currently 19863-19884)
Rework the DOMContentLoaded handler to operate on the whole `#kassenkundeDetails` container and every input inside it, instead of just `kassenkundeName`:

```js
document.addEventListener("DOMContentLoaded", () => {
  const wrap = document.getElementById("kassenkundeDetails");
  if (!wrap) return;
  const radios = document.querySelectorAll('input[name="payer"]');
  const inputs = wrap.querySelectorAll("input, select, textarea");

  const update = () => {
    const isKK = Array.from(radios).some(r => r.checked && r.value === "Kassenkunde");
    wrap.hidden = !isKK;                       // or wrap.style.display = isKK ? "grid" : "none"
    inputs.forEach(el => {
      el.disabled = !isKK;                     // disabled => excluded from FormData => only saved when KK
      // (do NOT auto-clear on toggle — keeps values if user flips back; see note)
    });
  };
  radios.forEach(r => r.addEventListener("change", update));
  update();
});
```
- **Behaviour note:** the current code *clears* `kassenkundeName` when switching to Selbstzahler. Recommend dropping the auto-clear so accidental toggles don't lose typed data (disabling already prevents it being saved). If parity with old behaviour is preferred, keep the clear. Flag either way in the PR.

### 3. `src/public/script.js` — restore (`restoreKundendaten`, ~12461-12497)
- Add restore lines for the new fields, with **backward-compat fallback** to the old AH keys so existing drafts still populate:
```js
setByNameOrId("kk_geburtsdatum",      k.kk_geburtsdatum      ?? k.ah_geburtsdatum);
setByNameOrId("kk_versichertennr",    k.kk_versichertennr    ?? k.ah_versichertenr);
setByNameOrId("kk_krankenkasseAdresse", k.kk_krankenkasseAdresse);
setByNameOrId("kk_pflegegradSeit",    k.kk_pflegegradSeit);
```
- Remove (or repoint) the old AH restore lines at **12477-12478** (`ah_versichertenr`, `ah_geburtsdatum`) since those inputs no longer exist. The fallback above preserves old-draft data.
- Update the visibility block at **12489-12497**: replace the `kassenkundeName`-`.field` show/hide with toggling `#kassenkundeDetails` (mirror the logic in §2) so the group appears correctly right after a restore. Keep the trailing `applySelbstzahlerVisibility()` call.

### 4. No save-side code changes
New inputs are named and inside `#form-Kundendaten`, so `formToObject()` captures them automatically. They land under `payload.Kundendaten.kk_*`. Nothing to add in `buildPayload()`.

---

## Edge cases & notes
- **AH behaviour change:** previously AH showed `Geburtsdatum` always (independent of payer). After this change it only appears when Kassenkunde is selected (consistent with the other four fields and with "shown when Kassenkunde"). Confirm this is acceptable for AH; if AH must always show Geburtsdatum regardless of payer, we'd need to keep `kk_geburtsdatum` outside the toggled group for AH — currently out of scope per the "no dupes / shared" decision.
- **Disabled = not saved:** because inputs are disabled when payer ≠ Kassenkunde, switching to Selbstzahler and saving will omit these keys. Intended.
- **Two `display` declarations** in the wrapper style must be avoided — use `hidden` attribute (recommended) toggled by JS.
- **Grid/`hidden` interaction:** `hidden` wins over `display:grid`. When shown, remove `hidden`; the CSS grid then applies. If using `style.display` instead, set it to `"grid"` when showing.

## Manual test checklist
1. Each offer type (BU, BWT, HL, BL, HMS, WD, AH): select Kassenkunde → the 5 fields appear; select Selbstzahler → they hide.
2. Fill all 5, save Entwurf, reload/restore → all 5 values return and the group is visible.
3. Save as Selbstzahler → fields omitted; restore → group hidden, no stale values.
4. Restore an **old** draft that used `ah_geburtsdatum`/`ah_versichertenr` → values still show in `kk_geburtsdatum`/`kk_versichertennr`.
5. Confirm `kassenkundeName` still flows into the generated offer (`KrankenkasseKunde`) unchanged.

## Files touched
- `src/public/index.html` (Kassenkunde block ~2642-2649; remove `ah_geburtsdatum` ~2438-2441)
- `src/public/script.js` (toggle ~19863-19884; restore ~12461-12497)
