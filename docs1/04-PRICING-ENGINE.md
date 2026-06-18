# Pricing Engine - Deep Dive

## Overview

The pricing engine (`src/logic/pricing.js`, ~1860 lines) is the most complex piece of business logic in the application. It computes all material costs, labor charges, markups, discounts, VAT, and insurance subsidies for any offer type.

## Architecture

The module exports a **factory function** that accepts a `ProductModel` (Mongoose model) and returns the pricing computation methods:

```javascript
export default function pricingFactory(ProductModel) {
  // ... internal helpers
  return { computePrices };
}
```

This factory pattern allows dependency injection for testing (pass a mock ProductModel).

## Main Entry Point

```javascript
const result = await computePrices(payload);
```

**Input**: Full offer payload (same structure stored in Draft/Offer.payload)

**Output**: Comprehensive pricing object (see below)

## Computation Pipeline

```
payload
  |
  v
computeMaterials(payload)        -> materials { lines[], sum, grabCounts }
  |
  v
computeServiceCosts(payload)     -> services { lines[], sum, payer, laborHours, laborRate }
  |
  v
computeWorkNotes(payload)        -> workNotes[] (zero-cost description lines)
  |
  v
computeBwtIncludedLines(payload)  -> bwtIncluded[] (BWT-only breakdown)
  |
  v
Aggregate & Calculate:
  - productsSubtotal = materials.sum
  - markup = markupBase * markupPct (BWT forced to 0%)
  - Nettobetrag = productsSubtotal + markup + services.sum
  - rabattAmount = productsSubtotal * materialDiscountPct
  - bonusGross = bonus deductions
  - netAfterRabatt = Nettobetrag - rabattAmount - bonusGross
  - vatOnNet = netAfterRabatt * 0.19
  - total = netAfterRabatt + vatOnNet
  - subsidyAmount = insurance contribution (max 4180 or 8360)
  - selfPayAmount = total - subsidyAmount
  |
  v
Build display variants (UI, DOCX)
  |
  v
Return pricing result
```

## Material Computation (`computeMaterials`)

Materials are collected from multiple payload sections based on offer type:

### Duschwanne (Shower Tray) - BU offers

Collects from `payload.duschwanne`:
- **Tray**: Selected product (e.g., `SLA8090W`)
- **Drain set**: `AGD9060` or budget variant `AGB001`
- **Sealing**: `TRWDB` (Wannenabdichtband-Set)
- **Small materials**: `KM02` or budget variant `AC004`
- **Stelzlager**: `PLA5282` (floor support)
- **Flooring**: Area-based calculation
  - Panel count: `ceil(area * 1.15 / 0.3)` (15% waste factor, 0.3m2 per panel)
  - Adhesive: Scaled by area
  - Sealing set: If selected

### Wandverkleidung (Wall Cladding) - BU offers

Collects from `payload.wandverkleidung`:
- Wall panels (997x2550mm or 1497x2550mm)
- Panel color variants
- End profiles, corner profiles
- Silicone, adhesive
- Accessories

### Optional Items - BU offers

Collects from `payload.optional`:
- **Grab bars**: CLPESG30/40/60/80 (with quantity tracking)
- **REHA products**: Special handling with gross-to-net conversion
  - REHA items have their price divided by 1.19 (remove embedded VAT)
  - Free delivery line added when REHA items present
- **Other accessories**: Various optional selections

### BWT (Bathtub Door) Items

Collects from `payload.bwt`:
- **Door variants**: Product codes 1226, 1225, 1228, 1227, 1320
  - Standard (1226): Color + height configuration
  - Wien Individual (1227): Custom dimensions
  - Wien Glas (1228): Glass door with frame color
  - Budget/Verona (1225)
  - Variodoor (1320)
- **Grab bars**: Same CLPESG products with BWT-specific markup rules
- **Quick-add items**: Free-form material entries with custom prices

### HL (Grab Bars/Handlauf) Items

Collects from `payload.hl`:
- **Pipes**: Calculated by linear meters (DB price is per meter)
  - Diameter, length, quality, color selections
  - Formula: `price_per_meter * length_meters`
- **Extras**: Additional HL-specific products
- **Quick-add items**: Custom entries

### Duschabtrennung (Shower Enclosure)

From `payload.duschabtrennung`:
- Hassmann quick-add items (from external API search results)

## Service Cost Computation (`computeServiceCosts`)

Fixed per-day charges:
| Service | Rate | Unit |
|---------|------|------|
| Fahrzeugbereitstellung (vehicle) | 80.00 EUR | per work day |
| Werkzeuge/Maschinen (tools) | 7.50 EUR | per work day |
| Beraumung (clearance) | 4.50 EUR | per work day |
| Kilometerpauschale (mileage) | 0.35 EUR | per km (round trip) |

Labor charges:
| Type | KK Rate | SZ Rate | Workers |
|------|---------|---------|---------|
| Work hours | 69.50 EUR/hr | 59.50 EUR/hr | x2 |
| Travel hours | laborRate + 25 EUR | laborRate + 25 EUR | x2 |
| BWT travel | laborRate + 35 EUR | laborRate + 35 EUR | x2 |

**BWT Extra Hours**: Additional labor for BWT-specific tasks, calculated as `extraHoursTotal * 2 * laborRate`

## Work Notes (`computeWorkNotes`)

Zero-cost descriptive line items that appear in documents:
- Wall cladding type descriptions
- Flooring type descriptions
- Selected work tasks mapped to German labels:
  - `remove_tub` -> "Ausbau der vorhandenen Badewanne"
  - `install_tray` -> "Einbau der neuen Duschwanne"
  - `relocate_faucet` -> "Umsetzen der Armatur"
  - etc.

## Markup Rules

### Standard (BU, HL, BL)
```
markupPct = payload.Kundendaten.aufschlag / 100  (default: 0.35 = 35%)
markupBase = sum of all material lines EXCLUDING KM02 (Kleinmaterial)
markup = markupBase * markupPct
```

### BWT (Bathtub Door)
```
markupPct = FORCED TO 0  (no markup on BWT materials)
```

However, BWT grab bars (CLPESG*) DO get markup applied to their lineTotal only (not the standard base calculation).

## Discount & Bonus Logic

### Material Discount (`rabatt.materialDiscountPct`)
```
rabattAmount = productsSubtotal * (materialDiscountPct / 100)
Range: 0-9%
Applied to materials only, not services
```

### Grab Bar Bonus (`rabatt.bonusGrab`)
When enabled, one grab bar is "free":
- Identifies the cheapest grab bar (CLPESG30 preferred)
- Subtracts its price from the total
- Adjusts grab bar counts for display (qty - 1)
- Sets `grabCounts.freeId` to track which bar is free

### Fixed Bonus (`rabatt.bonus300` / `bonus_neu`)
```
bonusGross = 252.10 EUR (net value of "Bestandskundenbonus")
Deducted from net total before VAT
```

## VAT Calculation

```
TAX_RATE = cfg.get('TAX_RATE', 0.19)   ← runtime-configurable via Admin Panel
vatOnNet = (netAfterRabatt - bonusGross) * TAX_RATE
total = netAfterRabatt + vatOnNet
```

## Subsidy / Insurance Logic

For Kassenkunde (KK) customers:

### Subsidy Types (`zuschuss` field)
| Value | Description | Max Amount |
|-------|-------------|------------|
| `4180 MAXIMAL` | Full subsidy (single person) | 4,180 EUR |
| `4180 MIT ZUZAHLUNG` | Subsidy with copay | 4,180 EUR |
| `ZWEI PERSONEN MIT PFLEGEGRAD` | Two persons | 8,360 EUR (2x 4,180) |
| Custom numeric | Custom amount | As specified |

### Self-Pay Calculation
```
subsidyAmount = min(subsidyAmount_max, total)
selfPayAmount = total - subsidyAmount
```

If `wohnumfeld` (prior home modification amount) is specified, it reduces the available subsidy.

## Display Variants

The pricing engine generates multiple display formats:

### `materialsDisplayUI`
- Non-optional material lines (for the live pricing sidebar)
- Excludes items marked with `isOptional: true`

### `optionalDisplayUI`
- Only optional items (grab bars, REHA products)
- Shown in a separate section in the UI

### `materialsDisplayDocx`
- All material lines for DOCX document export
- Excludes items with `docxHide: true`
- Customer-facing (labels may be sanitized by ExportManager)

### `servicesDisplayUI` / `servicesDisplayDocx`
- Service line items for UI and DOCX respectively

### `bwtIncludedDisplayUI`
- BWT-specific "Enthalt je Einheit" (included per unit) breakdown
- Shows: delivery, small materials, km allowance, travel time, door variants

## Output Structure

```javascript
{
  // Raw data
  items: [],
  materials: { title, lines[], sum, grabCounts },
  services: { title, lines[], sum, payer, laborHours, laborRate, distanceKm },
  
  // Aggregates
  productsSubtotal: Number,
  markupPct: Number,
  markup: Number,
  
  // Totals pipeline
  Nettobetrag: Number,           // Products + markup + services
  baseSubtotal: Number,
  baseVat: Number,
  base_total: Number,
  
  // After discounts
  netAfterRabatt: Number,
  materialDiscountPct: Number,
  rabattAmount: Number,
  totalAfterRabatt: Number,
  
  // Final
  vatOnNet: Number,
  total: Number,
  
  // Bonuses
  bonusGross: Number,
  bonusFlags: { bonusGrab, bonus300 },
  
  // Insurance
  subsidyKind: String,
  subsidyAmount: Number,
  subsidyAmount_max: Number,
  selfPayAmount: Number,
  
  // Display variants
  materialsDisplayUI: [],
  optionalDisplayUI: [],
  servicesDisplayUI: [],
  materialsDisplayDocx: [],
  servicesDisplayDocx: [],
  bwtIncludedDisplayUI: [],
  
  // Grab bar tracking
  grabCounts: { cl30, cl40, cl60, cl80, total, freeId },
  
  // Selected tray info
  selectedTray: { productId, name, sizeLabel, unitPrice }
}
```

## Key Constants (Runtime-Configurable)

All business constants are read at request-time from `src/services/configService.js` via `cfg.get(key, fallback)`. Values are persisted in MongoDB (`AppConfigs` collection) and can be changed without a code deploy through the **⚙ Admin Panel** at `/admin/`.

| Config Key | Default | Unit | Description |
|-----------|---------|------|-------------|
| `TAX_RATE` | `0.19` | — | German VAT (19 %) |
| `LABOR_RATE_KK` | `69.50` | €/h | Labor rate for Kassenkunde |
| `LABOR_RATE_SZ` | `59.50` | €/h | Labor rate for Selbstzahler |
| `LABOR_RATE_BWT` | `79.50` | €/h | Labor rate for BWT |
| `KM_RATE` | `0.35` | €/km | Mileage rate |
| `FAHRZEUGBEREITSTELLUNG` | `80.00` | €/day | Vehicle provision |
| `WERKZEUG` | `7.50` | €/day | Tools & machinery |
| `BERAEUMUNG` | `4.50` | €/day | Site clearance |
| `MAX_MATERIAL_DISCOUNT` | `0.09` | — | Max material discount (9 %) |
| `OFFER_VALIDITY_WEEKS` | `8` | weeks | Offer validity period |
| `KK_PAYMENT_THRESHOLD` | `2000` | € | Threshold for alternate KK payment terms |
| `BWT_KM_FREE_THRESHOLD` | `200` | km | Free km for BWT (round-trip) |
| `BWT_TRAVEL_TIME_FREE_HOURS` | `2` | h | Free travel time for BWT |
| `BWT_WORKER_COUNT` | `1` | — | Workers per BWT job |
| `BU_FLOOR_PANEL_SIZE_M2` | `0.3` | m² | Floor panel area |
| `BU_FLOOR_WASTE_FACTOR` | `1.15` | — | Floor cutting waste (+15 %) |
| `BU_FLOOR_ADHESIVE_COVERAGE` | `0.6` | m²/pack | Adhesive coverage per pack |
| `BU_STELZLAGER_DEFAULT_QTY` | `8` | pcs | Default pedestal feet quantity |
| `SUBSIDY_AMOUNT_4180` | `4180` | € | KK subsidy — single person |
| `SUBSIDY_AMOUNT_8360` | `8360` | € | KK subsidy — two persons |
| `BONUS_NEW_CUSTOMER_GROSS` | `252.10` | € | New-customer bonus (gross) |

`DEFAULT_MARKUP` (35 %) is still hard-coded in pricing.js as it is offer-payload-driven.

## Testing

The pricing engine is tested in:
- `tests/unit/pricing.test.js` - Unit tests with mock ProductModel
- `tests/unit/logic/pricing.test.js` - Direct logic tests

Example test scenarios:
- **Example A**: BU offer with optional grab bar -> verifies 35% markup applied
- **Example B**: BWT offer with door + grab bar -> verifies zero markup + BWT grab bar handling

---

## AH (Alltagshilfe) Pricing — Client-Side Only

### Architecture

AH pricing is **100% client-side**. When the server renders an AH offer, it returns an empty shell — no BU/BWT pricing logic runs on the server. All cost computation happens in `script.js` in the browser.

### Main Entry Point

```javascript
window.computeAHGesamt()   // recomputes and renders the full AH Kosten block
```

### Currently Implemented Service Type

**HnD (Haushaltsnahedienstleistungen)** — domestic household services billed in hourly blocks with a zone-based travel surcharge.

### Zone System

Travel time (one-way, in minutes) from the routing result is bucketed into 5-minute ceiling steps to determine the billing zone:

```
billMin = max(10, ceil(oneWayMinutes / 5) × 5)
zone    = (billMin - 10) / 5 + 1
```

| oneWayMinutes | billMin | zone |
|---------------|---------|------|
| 0 – 10        | 10      | 1    |
| 11 – 15       | 15      | 2    |
| 16 – 20       | 20      | 3    |
| …             | …       | …    |

### Constants

```javascript
const ANFAHRT_PER_EINSATZ   =  7.96;   // EUR flat fee per visit
const STUNDENSATZ_HND       = 40.56;   // EUR/h for HnD labour
const SERVICEPAUSCHALE_HND  =  1.20;   // EUR/month admin fee
```

### HnD Billing Formula

For each schedule row:

```
reisezeitH = zone one-way travel time in hours (from zone lookup table)
monthlyH   = (dauer + 2 × reisezeitH) × freq
```

`freq` comes from `FREQ_PER_MONTH`:

| Schedule cadence | freq        |
|------------------|-------------|
| Weekly           | 52 / 12     |
| Bi-weekly        | 26 / 12     |
| Monthly          | 1           |

The factor `2 × reisezeitH` bills the round trip; `dauer` is the service duration in hours.

### Line Items in Kosten

| Line item         | Formula                                 | Payer condition         |
|-------------------|-----------------------------------------|-------------------------|
| Anfahrtspauschale | `totalEinsaetze × 7.96 €`              | always shown            |
| HnD-Leistung      | `totalMonatlichH × 40.56 €`            | always shown            |
| Servicepauschale  | `1.20 €/Monat`                         | added to **Gesamt** for Selbstzahler; shown as informational note for Kassenkunde |

### Payer Distinction

```javascript
const isSelbstzahler = document.querySelector('input[name="payer"]:checked')?.value === 'SZ';
```

The `Servicepauschale` of 1.20 €/month is included in the running **Gesamt** total only when `isSelbstzahler` is `true`. For Kassenkunde it is displayed as a note but not added to the total.

### Key Functions

| Function | Purpose |
|---|---|
| `window.computeAHGesamt()` | Full recompute + DOM render of the AH Kosten block |
| `window.computeAHZoneFromMinutes(mins)` | Converts raw one-way minutes → `{ zone, billMin, reisezeitH }` |
| `window.getAHZoneData()` | Returns the currently active zone data object |

### Zone Fallback Chain

`getAHZoneData()` resolves the active zone through the following priority chain:

```
1. window.__ahZoneData           (set by the last routing result)
2. #ahTravelZone hidden field    (serialised into the form)
3. computed from #travelTime     (plain minutes field, fallback)
```

### Travel Time Listener

Whenever the `#travelTime` input changes while the AH offer type is active, the zone is automatically recomputed and `window.__ahZoneData` is updated, triggering a fresh `computeAHGesamt()` call. No manual refresh is required.
