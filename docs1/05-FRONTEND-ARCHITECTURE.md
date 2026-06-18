# Frontend Architecture

## Overview

The frontend is a **Single Page Application (SPA)** built with vanilla JavaScript (no framework). It uses a wizard-style multi-step form for configuring offers, with hash-based routing.

## File Structure

```
src/public/
+-- index.html              # Main SPA shell (8,645 lines)
+-- script.js               # Core logic bundle (21,514 lines)
+-- style.css               # Styles (6,499 lines)
+-- DraftsManager.js        # Draft save/load/search
+-- ExportManager.js        # PDF/DOCX export orchestration
+-- EmailManager.js         # Email composition & sending
+-- RestoreManager.js       # Offer/draft restoration
+-- DrawingPadManager.js    # Canvas sketch tool
+-- SignaturePadManager.js  # Digital signature capture
+-- HassmannManager.js      # Shower enclosure "Best Finder"
+-- BadoluxManager.js       # Budget mode toggle
+-- AdminManager.js         # Product/service admin panel
+-- ThemeManager.js         # Theme & dark mode
+-- IntegrationsManager.js  # Bitrix CRM integration
+-- TodaysCustomers.js      # Customer quick list
+-- BadoluxLegacyFallback.js  # Legacy compat
+-- DraftsLegacyFallback.js   # Legacy compat
+-- assets/                 # 187 images, icons, product photos
+-- pdfjs/                  # PDF.js viewer integration
```

## Core Concepts

### Wizard Navigation

The application is a multi-step wizard. Each offer type has a defined page sequence:

```javascript
// From src/config/offers.js
OFFERS = {
  bu:  { pages: ['Kundendaten', 'Arbeitszeit', 'Duschwanne', 'Wandverkleidung', 'Duschabtrennung', 'Optional', 'Rabatt'] },
  bwt: { pages: ['Kundendaten', 'bwt'] },
  hl:  { pages: ['Kundendaten', 'hl'] },
  bl:  { pages: ['Kundendaten', 'bl'] },
  ah:  { pages: ['Kundendaten', 'Arbeitszeit', 'ah', 'Kosten', 'Zusammenfassung'] },
  hms: { pages: ['Kundendaten', 'hms'] },
  wd:  { pages: ['Kundendaten', 'wd'] }
}
```

Navigation functions:
- `setStep(step)` - Navigate to a page
- `getCurrentStep()` - Get current page name
- `getCurrentOfferType()` - Get active offer type
- `getPagesForOfferType(type)` - Get allowed pages
- `goHome()` / `goHomeWithoutOffer()` - Return to home screen
- `applyWizardState({offerType, step})` - Set offer type and navigate

Hash-based routing: `#page-Kundendaten`, `#page-Duschwanne`, etc.

### State Management

Three layers of state:

1. **StateManager** (`src/models/StateManager.js`) - Centralized form state
   - Stores all form data organized by page key
   - Persists to `sessionStorage` (key: `emc2_wizard_state`)
   - Emits events on changes
   - Supports legacy migration from per-form keys

2. **EventBus** (`src/events/EventBus.js`) - Pub/sub event system
   - Decoupled communication between components
   - Events for form changes, pricing updates, navigation, notifications

3. **sessionStorage** - Persistence layer
   - Survives page reloads within session
   - Key: `emc2_wizard_state` (unified) or legacy per-form keys

### Data Flow

```
User types in form field
    |
    v
input/change event fires
    |
    v
FormViewBase.handleFieldChange()
    |
    v
EventBus.emit('form:field:changed', {formKey, field, value})
    |
    v
StateManager._setupEventListeners() receives event
    |
    v
StateManager.setField(formKey, field, value)
    -> Persists to sessionStorage (debounced 300ms)
    -> EventBus.emit('field:changed', {formKey, field, value})
    |
    v
Pricing/Export controllers subscribe and react
    |
    v
updatePricing(buildPayload()) -> POST /api/price
    |
    v
EventBus.emit('pricing:updated', pricingResult)
    |
    v
Summary widget + detail views update
```

## Event System

### EventBus Events

```javascript
// Wizard lifecycle
'offer:started'     // User selected an offer type
'offer:reset'       // User returned to home
'step:changed'      // Wizard step navigation

// Form data
'form:changed'            // Any form data changed
'form:field:changed'      // Single field changed
'form:data:set'           // Bulk form data set
'field:changed'           // Confirmed state change

// Pricing
'pricing:requested'       // Request pricing computation
'pricing:updated'         // New pricing available
'pricing:error'           // Pricing computation failed

// Validation
'validation:requested'    // Trigger validation
'validation:result'       // Validation results available

// UI
'notification:show'       // Show generic notification
'notification:success'    // Success toast
'notification:error'      // Error toast
'notification:warning'    // Warning toast
'loading:start'           // Show loading indicator
'loading:end'             // Hide loading indicator
```

### Debug Mode

```javascript
window.debugEvents(true)   // Enable event logging
window.debugEvents(false)  // Disable
```

## Manager Modules

### DraftsManager
**Purpose**: Save, search, and load draft offers.

**Features**:
- Search drafts by name (live results with highlighting)
- Auto-load on click
- Save with auto-generated or custom name
- Draft naming: `ANG-{TYPE}-{CUSTOMER}-{TIMESTAMP}`
- Slug generation (removes diacritics, converts umlauts)

**API Calls**: `GET /api/drafts/search`, `POST /api/drafts`, `GET /api/drafts/:id`

### ExportManager
**Purpose**: Orchestrate document export (PDF, DOCX, material lists, work reports).

**Features**:
- Generate offer number: `ANG{YYYY}-{MMDD}-{HHMMSS}`
- Sanitize material labels for customer-facing documents
- Progress tracking during export
- Save final offer snapshot after export

**Material Label Sanitization**:
- Shortens technical descriptions
- Removes codes like `[CODE]`, `DIN xxxx`
- Known overrides: TRWDB -> "Wannenabdichtband-Set", KM02 -> "Kleinmaterial", etc.

**API Calls**: `POST /docx-template`, `POST /pdf-template`, `POST /material-overview`, `POST /arbeitsbericht`, `POST /api/offers`

### EmailManager
**Purpose**: Compose and send offer emails.

**Features**:
- Auto-fill subject (from offer number + type)
- Auto-fill recipient (from customer email)
- Auto-fill body (German template with EMC2 branding)
- Attachment preset tiles (Abtretungserklaerung, Barrierefreies_Wohnen, Vollmacht)
- Bitrix timeline comment posting

**API Calls**: `POST /api/email/send-offer`

### RestoreManager
**Purpose**: Restore configurator state from saved offers/drafts.

**Features**:
- Normalize legacy offer structures
- Restore form fields per offer type
- Restore sketch/drawing data
- Trigger recalculation after restore
- Post-restore nudges (dispatch change events)

**Global APIs**:
```javascript
window.restoreConfiguratorFromOffer(doc)       // From saved offer
window.restoreConfiguratorFromSnapshot({payload}) // From snapshot
```

### DrawingPadManager
**Purpose**: Canvas-based sketch tool for annotations.

**Features**:
- Tools: pen, eraser, line, ruler
- Color picker + stroke size selector
- Undo functionality
- Device pixel ratio handling (retina displays)
- Serialized as JSON operations + PNG dataUrl

**Data Format**:
```javascript
{
  json: { version: 1, ops: [{type: "stroke", tool, color, size, points}, ...] },
  dataUrl: "data:image/png;base64,..."
}
```

### SignaturePadManager
**Purpose**: Digital signature capture.

**Features**:
- Pointer events (mouse/touch/pen)
- Preserves on canvas resize
- Stores as PNG dataUrl in hidden field

### HassmannManager
**Purpose**: Shower enclosure "Best Finder" search wizard.

**Features**:
- Form: width, depth, price range, opening types, orientation
- Renders combo results (main + side panel + tray)
- Media URL normalization for CDN images
- Currency formatting (EUR)

**API Calls**: `POST /api/magic/search`

### BadoluxManager
**Purpose**: Budget mode toggle for shower tray accessories.

**Features**:
- Toggle checkbox saves to sessionStorage (`dw_budget_mode`)
- Swaps accessory images when budget mode on
- Loads budget floor products (BP* prefix) dynamically
- Triggers pricing update

**API Calls**: `GET /api/products?prefix=BP&source=badolux`

### ThemeManager
**Purpose**: Theme and dark mode management.

**Themes**:
| Theme | Accent Color | Default For |
|-------|-------------|-------------|
| `base` | Purple (#6d28d9) | - |
| `wohnen` | Green (#75C19F) | bu |
| `pflege` | Purple (#AC84BC) | hl, ah |
| `gesundheit` | Blue (#00C6F6) | bwt |
| `kfz` | Gold (#DFA029) | kfz |

**Modes**: `light` (default), `dark`

**Persistence**: `localStorage` keys `emc2.theme`, `emc2.mode`

### AdminManager
**Purpose**: Product and service CRUD admin panel.

**Features**:
- Search with debounce (250ms)
- Inline edit (ID, name, price, dimensions, source)
- Bulk save
- Table rendering

**API Calls**: `GET/POST /api/products`, `GET/POST /api/services`

### IntegrationsManager
**Purpose**: External CRM integration.

**Features**:
- Bitrix contact loader by ID
- Field mapping: NAME->firstName, LAST_NAME->lastName, EMAIL->email, PHONE->phone
- Salutation mapping: HNR_DE_1->Frau, HNR_DE_2->Herr

**API Calls**: `GET /api/bitrix/contact/:id`

## View System

### ViewBase (`src/views/ViewBase.js`)

Abstract base class for all views:

```javascript
class ViewBase {
  constructor(container) { /* ... */ }
  render(data) { /* override */ }
  addListener(element, event, handler, options) { /* auto-tracked */ }
  subscribe(event, handler) { /* EventBus subscription, auto-tracked */ }
  $(selector) { /* query within container */ }
  $$(selector) { /* queryAll within container */ }
  show() { /* set visible, aria-hidden=false */ }
  hide() { /* set hidden, aria-hidden=true */ }
  destroy() { /* cleanup all listeners and subscriptions */ }
}
```

### FormViewBase (`src/views/FormViewBase.js`)

Form-specific view subclass:

```javascript
class FormViewBase extends ViewBase {
  registerFormField(name, selector) { /* register single field */ }
  registerAllFields(containerSelector) { /* register all inputs */ }
  getFieldValue(element) { /* handle checkbox/radio/select/text */ }
  setFieldValue(name, value) { /* restore field value */ }
  getFormData() { /* bulk read */ }
  setFormData(data) { /* bulk write */ }
  setupStateSync() { /* bidirectional sync with StateManager */ }
  validate() { /* run validation rules */ }
  displayErrors(errors) { /* show inline errors */ }
  clearErrors() { /* remove error displays */ }
}
```

### KundendatenView (`src/views/pages/KundendatenView.js`)

Customer data form:
- Field validation (name, email, phone, address)
- Bitrix contact loader integration
- Distance calculation trigger
- Budget panel UI with conditional sub-panels
- Real-time pricing updates on field change

## HTML Structure

Key page containers in `index.html`:

```html
<div id="page-home">            <!-- Service selection tiles -->
<div id="page-Kundendaten">     <!-- Customer data form -->
<div id="page-Arbeitszeit">     <!-- Work hours configuration -->
<div id="page-Duschwanne">      <!-- Shower tray selection -->
<div id="page-Wandverkleidung"> <!-- Wall cladding selection -->
<div id="page-Duschabtrennung"> <!-- Shower enclosure (Hassmann) -->
<div id="page-Optional">        <!-- Optional accessories -->
<div id="page-Rabatt">          <!-- Discounts & bonuses -->
<div id="page-Kosten">          <!-- Cost overview -->
<div id="page-Zusammenfassung"> <!-- Summary page -->
<div id="page-bwt">             <!-- BWT offer form -->
<div id="page-hl">              <!-- Grab bar form -->
<div id="page-bl">              <!-- Bath lift form -->
<div id="page-ah">              <!-- Everyday aids form -->
<div id="page-admin">           <!-- Admin panel -->
<div id="page-services">        <!-- Services admin -->
<div id="page-crm-emc2">       <!-- CRM integration -->
```

UI Components:
- **Sidebar**: Fixed left panel (260px) with progress dots (idle/active/done)
- **Summary Widget**: Fixed top-right floating panel (customer name, totals, save/export)
- **Toast System**: Center-screen notifications (success/error/info/warn)
- **Modal Dialogs**: Overlay with centered content, fade animations
- **Image Tiles**: Grid of clickable product images with checkbox/radio selection

## CSS Architecture

### Variables (CSS Custom Properties)

```css
:root {
  --bg: #ffffff;
  --panel: #f8f9fa;
  --text: #1a1a2e;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #6d28d9;
  --accent-weak: #ede9fe;
  --accent-strong: #5b21b6;
  --shadow: rgba(0,0,0,0.08);
  --ring: rgba(109,40,217,0.3);
}
```

Theme variants override these via `[data-theme="wohnen"]`, `[data-theme="pflege"]`, etc.

Dark mode overrides via `[data-mode="dark"]`.

### Responsive Breakpoints

| Breakpoint | Changes |
|-----------|---------|
| 1300px | App max-width |
| 900px | Sidebar becomes drawer, layout shift |
| 768px | Mobile tweaks |
| 640px | Single column forms |
| 520px | Compact mobile |

## Window Globals

The following are exposed globally for cross-module communication:

```javascript
// Navigation
window.getCurrentOfferType()
window.getCurrentStep()
window.setStep(step)
window.getPagesForOfferType(type)
window.goHome()
window.goHomeWithoutOffer()

// Data
window.buildPayload()              // Serialize current state
window.updatePricing(payload)      // Trigger pricing computation
window.resetAllForms()             // Clear all form data

// Restoration
window.restoreConfiguratorFromOffer(doc)
window.restoreConfiguratorFromSnapshot({payload})

// Utilities
window.toast.success(title, msg)
window.toast.error(title, msg)
window.toast.info(title, msg)
window.toast.warn(title, msg)
window.parseMoneyEuro(value)       // Parse EUR currency string
window.escapeHtml(str)             // XSS protection

// Managers
window.__managers = { theme, drafts, badolux, signature, drawing, email, export, integrations, admin }

// Debug
window.__FEATURES__                // Feature flags
window.__DEBUG_MANAGERS__          // Manager debug logging
window.__restoring                 // Restore guard flag
window.__RESTORING__               // Restore guard flag (alt)
window.__EMC2_STATE__              // StateManager instance
window.__EMC2_EVENTS__             // EventBus instance
window.debugEvents(enable)         // Toggle EventBus logging
```

## Feature Flags

```javascript
window.__FEATURES__ = {
  draftsManager: true,    // Use new DraftsManager (vs legacy)
  badoluxManager: true,   // Use new BadoluxManager (vs legacy)
  // ... more flags
}
```

Legacy fallback modules (`DraftsLegacyFallback.js`, `BadoluxLegacyFallback.js`) check these flags and skip initialization if the new manager is enabled.

## AH · Alltagshilfe — Duration Calculation

### How totals are computed

Each schedule row contributes: `minutes × freq × periodMonths × days.length`

- **minutes** — duration entered in HH:MM (parsed to minutes)
- **freq** — occurrences per month (from `FREQ_PER_MONTH`, see below)
- **periodMonths** — 1 (/ Monat) or 12 (/ Jahr), selected per card
- **days.length** — number of selected weekday buttons (Mo/Di/Mi…)

`Einmalig` is a special case: `minutes × days.length` (happens once per selected day, no frequency multiplier).

### Frequency table (`FREQ_PER_MONTH`)

Uses fixed 52-week yearly averages divided by 12. This is intentional: months vary (28–31 days) and years vary (365/366 days). Averaging over 52 weeks gives a stable, fair rate for service offer quoting — the error is < 0.3% per year.

| Regelmäßigkeit   | Formula      | Per month |
|------------------|--------------|-----------|
| Wöchentlich      | 52 ÷ 12      | ≈ 4.33×   |
| 14-tägig         | 26 ÷ 12      | ≈ 2.17×   |
| alle drei Wochen | (52÷3) ÷ 12  | ≈ 1.44×   |
| Monatlich        | 1            | 1×        |
| Vierteljährlich  | 4 ÷ 12       | ≈ 0.33×   |
| Halbjährlich     | 2 ÷ 12       | ≈ 0.17×   |
| Jährlich         | 1 ÷ 12       | ≈ 0.083×  |
| Einmalig         | once total   | —         |

## AH Offer — Frontend Architecture

### Wizard Flow

5 steps: Kundendaten → Arbeitszeit → AH → Kosten → Zusammenfassung

### Arbeitszeit Page (AH-specific)

- Only shows: distanceKm field (with routing suggestion button) + Reisezeit field
- Hides: Arbeitszeit/laborHours, Uebernachten, BU travel rate note, suggestion card, totals
- Controlled via `data-offer="bu,bwt,hl,bl,hms,wd"` on those elements
- travelTime is filled automatically by routing API (OpenRouteService via `/api/routing/suggest-distance`)

### AH Page (`src/public/index.html #page-ah`)

- Two service sections: Haushaltsnahedienstleistungen (first) and Alltagsbegleitung
- Max 1 Leistung card per section (add button hides when card exists)
- Each card supports multiple Zeitzeilen (schedule rows) with + Zeitzeile hinzufügen
- Per-row display: Dauer | Regelmäßigkeit | Bev. Uhrzeit | /Monat (service time only)
- Card total (Gesamt) shows service time only (not including travel)
- Data serialized to hidden `#ahServicesJson` field + localStorage key `ahServices:v1`

### Zone System

- Travel time bucketed into 5-min ceiling zones: Zone 1=10min, Zone 2=15min, Zone 3=20min…
- Formula: `billMin = max(10, ceil(oneWayMinutes/5)×5)`, `zone = (billMin-10)/5+1`
- Zone determined from routing API result (oneWaySeconds) when offer type is AH
- Fallback chain: `window.__ahZoneData` → `#ahTravelZone` hidden field → computed from `#travelTime`
- travelTime change listener: any change to travelTime recomputes zone and refreshes Kosten
- Key functions: `window.computeAHZoneFromMinutes(mins)`, `window.getAHZoneData()`

### Kosten Page (AH)

- Completely separate render path in `renderFromData()` — skips server pricing
- Uses `window.computeAHGesamt()` which reads ahServicesJson + zone data
- Shows: Zone banner, Anfahrtspauschale row, HnD-Leistung row with time breakdown table
- Time breakdown per Zeitzeile: Einsatz + H&R Reise = /Einsatz × Freq = /Mon.
- Servicepauschale: added to Gesamtbetrag for Selbstzahler, shown as separate note for Kassenkunde
- Kosten page re-renders when: navigating to it, travelTime changes, AH services change

### Key Global Functions (AH)

- `window.computeAHGesamt()` — main pricing computation, returns all line items + totals
- `window.computeAHZoneFromMinutes(oneWayMinutes)` — zone bucketing formula
- `window.getAHZoneData()` — reads zone with 3-level fallback
- `window.updatePricing()` — bypasses server for AH, calls computeAHGesamt directly
