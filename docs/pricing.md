# Pricing Module — `src/logic/pricing.js`

Overview
- Purpose: encapsulates price computation for materials, services and overall offer totals.
- Export: default factory function that accepts a `ProductModel` (Mongoose-like) and returns an object with `computePrices(payload)` and several internal helpers.

Quick usage

```javascript
import pricingFactory from './src/logic/pricing.js';
// ProductModel must expose `.find()` and `.findOne()` that return docs with
// at least `{ productId, price, name }`.
const { computePrices } = pricingFactory(ProductModel);
const result = await computePrices(payload); // returns pricing object (see below)
```

ProductModel expectations
- `find({ productId: { $in: [...] } })` → array of docs with `productId`, `price`, `name`.
- `findOne({ productId })` → single doc used for selected tray lookup.

Main API: computePrices(payload)
- Input: `payload` — shape varies (form data + pages). The function reads fields like
  - `payload.optional`, `payload.duschwanne`, `payload.wandverkleidung`, `payload.bwt`, `payload.Kundendaten`, `payload.Arbeitszeit`, `payload.rabatt`, and `payload.activeOffer`.
- Output: an object containing (most important keys):
  - `items`: array of simple selected product lines (productId, qty, unitPrice, lineTotal).
  - `materials`: { title, lines, sum, grabCounts } — raw material lines resolved from DB.
  - `productsSubtotal`: numeric sum of material line totals.
  - `services`: computed service cost block (title, lines, sum, payer, laborHours, laborRate, distanceKm).
  - `markupPct`, `markup`: configured markup percentage and absolute amount.
  - `Nettobetrag`, `vatOnNet`, `total`: net, VAT and gross totals before/after discounts.
  - `netAfterRabatt`, `totalAfterRabatt`: values after material discount.
  - `bonusGross`, `bonusFlags`: presentation-only promotional bonuses (e.g. Haltegriff bonus).
  - `subsidyKind`, `subsidyAmount`, `selfPayAmount`: helper fields for funding/subsidy flows.
  - `selectedTray`: details for the chosen shower tray (if any).
  - `materialsDisplayUI`, `optionalDisplayUI`, `servicesDisplayUI`: presentation-only subsets used by the UI.
  - `materialsDisplayDocx`, `servicesDisplayDocx`: presentation arrays tailored for DOCX/PDF generation.
  - `bwtIncludedDisplayUI`: BWT-specific "contains per unit" lines (when offer=BWT).

Key helpers & business rules
- `getProductsByIds(ids)`: loads product prices/names from DB and returns a Map(productId → {price, name}).
- `parseMoneyStrict(value)`: robustly parses user-entered money strings like "1.234,56 €" into Numbers.
- `round2(n)`: rounds to 2 decimals safely.
- `TAX_RATE` is 0.19 (VAT).
- `getActiveOffer(payload)`: returns active offer key: `'bu'` (default), `'bwt'` (Badewannentür), or `'hl'` (Handlauf).

Materials computation (computeMaterials)
- Gathers product ids from multiple parts of the `payload` (duschwanne, wandverkleidung, optional, bwt, etc.).
- Builds an internal `lines` array of entries with fields like:
  - `id` / `productId`, `qty`, `label` (display or override), `unitOverride`, `source`, `meta`.
- After collecting IDs, prices/names are resolved via `getProductsByIds` and final line objects have:
  - `productId`, `name`, `color` (from meta), `qty`, `unitPrice`, `lineTotal`, `label`, `labelLines`, `source`, `docxHide`.
- Special behavior:
  - Items flagged `source === 'optional_reha'` have their unit price converted from gross→net using `grossToNet`.
  - `unitOverride` (when provided) forces the unit price for that line.
  - `perM2Base` entries (e.g. TRBDSET7) derive a per-m² price by dividing DB-set price by `perM2Base`.
  - `docxHide: true` hides the line in DOCX exports (useful for delivery fees or ephemeral items).

BWT (Badewannentür) rules
- For offer `bwt` some lines get special markup/handling:
  - For certain grab bars (e.g. `CLPESG30`) a markup percentage from `payload.pricing.markupPct` or `payload.Kundendaten.aufschlag` is applied to the lineTotal.
  - `computeBwtIncludedLines(payload)` computes billed lines such as Lieferkosten and Kleinmaterial with DB-based prices.

Optional items and REHA
- `collectSelections(payload)` extracts `optional` fields (opt_/qty_ pairs and aliasing) and returns [{productId, qty}].
- `extractRehaIdsFromOptional(opt)` tries to parse REHA product ids from `optReha[]` and marks matching optional lines as `optional_reha`.
- REHA optionals trigger an added delivery line `REHA_DELIVERY` (unitOverride used for gross→net handling in DOCX hide scenarios).

Display adjustments & bonuses
- `bonusGrab` and `bonus300` flags in `payload.rabatt` affect presentation only (they adjust `materialsDisplayUI` / `docxMaterials`):
  - If a CLPESG30 is the only grab and `bonusGrab` is set, that single CLPESG30 may be omitted in DOCX or shown as 0 in UI depending on rules.
  - `setCL30LabelToBillable(list, {hideWhenZero})` mutates display labels to show billable quantity = selected - 1.

Service costs (computeServiceCosts)
- Builds a lines array for vehicle readiness, tools, clearance, kilometer allowance and labor.
- Uses `payload.Kundendaten` and `payload.Arbeitszeit` for payer, distance, hours and extra BWT hours.
- Labor rates and several hard-coded rates (e.g., `laborRateKK = 69.5`, `kmRate = 0.35`) are defined in the function.

Rounding, discounts and totals
- Markup calculation: builds a `markupBase` from material lines (skipping `KM02`) and multiplies by `markupPct` (unless `offer === 'bwt'`, where markup is forced to 0).
- Material discount (`payload.rabatt.materialDiscountPct`) is applied to `productsSubtotal` before VAT.
- VAT applied after discounts using `TAX_RATE`.

Notes & gotchas
- The module prints several debug/info lines via `console.log`/`console.warn` — expect logs when running compute flows.
- The code is defensive about payload shapes (supports array-or-string inputs for checkbox groups, odd keys like `workTasks[]`, and numeric strings with German formatting).
- Several areas use business-specific magic ids (e.g., `CLPESG30`, `KM02`, `V5FB02`) — check DB product catalog for semantics.
- `computePrices` may call DB via `ProductModel.find()`/`findOne()`; ensure the provided model is connected.

If you want, I can:
- add a small unit test that exercises `computePrices` with a fake `ProductModel` (in `tests/unit/`), or
- expand this doc with example payloads and expected outputs for common offer types (BU, BWT).

Examples
------

Notes for examples below:
- I list assumed `ProductModel` prices for reproducible results.
- All numeric amounts are rounded to 2 decimals using the module's `round2` helper.

Example A — simple BU (basic materials + one optional grab bar)

Assumed product prices (DB):
- `CLPESG30`: 30.00 €/unit
- `V3WVK09` (997×2550 panel): 100.00 €/unit
- `KM02` (Kleinmaterial): 10.00 €/unit

Payload (minimal):

```json
{
  "activeOffer": "bu",
  "optional": {
    "opt_CLPESG30": true,
    "qty_CLPESG30": 1
  },
  "wandverkleidung": {
    "wvQty997": 1,
    "wvColor": "Weiß"
  }
}
```

Expected important parts of the `computePrices(payload)` result (partial):

```json
{
  "materials": {
    "title": "Material für Badumbau",
    "lines": [
      { "productId":"CLPESG30","qty":1,"unitPrice":30.00,"lineTotal":30.00 },
      { "productId":"V3WVK09","qty":1,"unitPrice":100.00,"lineTotal":100.00 }
    ],
    "sum": 130.00,
    "grabCounts": { "cl30": 1, "total": 1 }
  },
  "productsSubtotal": 130.00,
  "markupPct": 0.35,
  "markup": 45.50,
  "Nettobetrag": 175.50,
  "vatOnNet": 33.35,
  "total": 208.85
}
```

Explanation: markup default is 35% (0.35). Markup base = 130.00 → markup = 45.50. Net subtotal = 130 + 45.50 = 175.50. VAT 19% = 33.345 → 33.35. Gross total = 208.85.

Example B — BWT (Badewannentür) with a door and one grab bar, applying a BWT-specific markup for grab bars

Assumed product prices (DB):
- `1226` (Standard door): 500.00 €/unit
- `CLPESG30`: 30.00 €/unit
- `KM02`: 10.00 €/unit

Payload (minimal):

```json
{
  "activeOffer": "bwt",
  "bwt": {
    "bwtDoorStdQty": 1
  },
  "optional": {
    "opt_CLPESG30": true,
    "qty_CLPESG30": 1
  },
  "pricing": {
    "markupPct": 0.20
  }
}
```

Notes on BWT behavior used here:
- For `offer === 'bwt'` the global markup used for most materials is forced to 0, but `computeMaterials` applies `markupPctForBwt` to BWT-specific grab bars if provided.

Expected important parts of the `computePrices(payload)` result (partial):

```json
{
  "materials": {
    "lines": [
      { "productId":"1226","qty":1,"unitPrice":500.00,"lineTotal":500.00 },
      { "productId":"CLPESG30","qty":1,"unitPrice":30.00,"lineTotal":36.00 }
    ],
    "sum": 536.00
  },
  "bwtIncludedDisplayUI": [ /* Lieferkosten, Kleinmaterial computed from DB prices if present */ ],
  "markupPct": 0,
  "markup": 0,
  "Nettobetrag": 536.00,
  "vatOnNet": 101.84,
  "total": 637.84
}
```

Calculation notes: grab bar `CLPESG30` gets BWT markup 20% → unit 30 → lineTotal 30*(1+0.2)=36. Door lineTotal = 500. Sum = 536. Markup for BWT is forced to 0, so Nettobetrag = 536. VAT 19% = 101.84. Total = 637.84.

Wanted next?
- I can add runnable unit tests that assert these examples using a fake `ProductModel` (fast). Reply if you want tests added and where to place them.
