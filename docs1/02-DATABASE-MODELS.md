# Database Models & Schema Reference

## Database

- **Engine**: MongoDB Atlas (cloud-hosted)
- **ODM**: Mongoose 8.18.1
- **Database Name**: `KonfiguratorDB` (configurable via `MONGODB_DB` env var)
- **Connection**: Via `MONGODB_URI` environment variable

## Models

### Product (`src/models/Product.js`)

**Collection**: `Products`

Stores the product catalog (materials, equipment, accessories).

```javascript
{
  productId: String,       // Unique identifier (e.g., "SLA8090W", "CLPESG30", "KM02")
  name: String,            // Display name (e.g., "Duschwanne SLA 80x90 weiß")
  price: Number,           // Unit price in EUR (min: 0)
  widthCm: Number,         // Width in cm (optional)
  heightCm: Number,        // Height in cm (optional)
  lengthCm: Number,        // Length in cm (optional)
  source: String,          // Data origin (e.g., "badolux", "flexofit")
  createdAt: Date,         // Auto-generated
  updatedAt: Date          // Auto-generated
}
```

**Indexes**: `productId` (unique)

**Notable Product ID Prefixes**:
| Prefix | Category |
|--------|----------|
| `SLA*` | Shower trays (Duschwannen) |
| `DW*` | Duschwannen (alternative line) |
| `BP*` | Budget floor panels (Badolux) |
| `IRIS*` | Bathtubs (excluding `IRISWAS*`) |
| `IRISWAS*` | Bathtub shower screens |
| `CLPESG*` | Grab bars (30/40/60/80 cm) |
| `KM02` | Kleinmaterial (small materials kit) |
| `TRWDB` | Wannenabdichtband-Set |
| `AGD9060` | Ablaufgarnitur (drain set) |
| `PLA5282` | Plattenlager/Stelzlager |

---

### Service (`src/models/Service.js`)

**Collection**: `Services`

Stores labor and service definitions.

```javascript
{
  serviceId: String,        // Unique identifier
  name: String,             // Display name
  description: String,      // Detailed description
  internal_name: String,    // Internal reference name
  price: Number,            // Price per unit
  time: Number,             // Time in hours
  source: String,           // Data origin
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: `serviceId` (unique)

---

### Offer (`src/models/Offer.js`)

**Collection**: `Offers`

Stores finalized customer offers/quotes.

```javascript
{
  offerNumber: String,      // Unique offer ID (e.g., "ANG2026-0420-143022")
  offerType: String,        // "bu" | "bwt" | "hl" | "bl" | "ah" | "hms" | "wd"
  payload: Mixed,           // Full form data (entire wizard state)
  pricing: Mixed,           // Computed pricing result from pricing engine
  customer: {               // Customer snapshot (denormalized)
    salutation: String,
    firstName: String,
    lastName: String,
    phone: String,
    email: String,
    customerNumber: String,
    city: String,
    postalCode: String
  },
  hassmannQuickAdd: [{      // Shower enclosure quick-add items
    kind: String,
    productId: String,
    price: Number,
    qty: Number
  }],
  pdfUrl: String,           // Generated PDF URL
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: `offerNumber` (unique), `offerType`

**Offer Number Format**: `ANG{YYYY}-{MMDD}-{HHMMSS}` (e.g., `ANG2026-0420-143022`)

---

### Draft (`src/models/Draft.js`)

**Collection**: `Drafts`

Stores work-in-progress offer drafts.

```javascript
{
  name: String,             // Draft name (required, trimmed)
  offerType: String,        // "bu" | "bwt" | "hl" | "bl" (required)
  payload: Object,          // Full form data snapshot
  savedAt: Date,            // When the USER hit save (client-stamped)
  clientSaveId: String,     // Client-generated id of the save (idempotency)
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: Compound unique index on `(offerType, name)` - no two drafts with same name and type

**Draft Name Format**: `ANG-{TYPE}-{CUSTOMER}-{TIMESTAMP}` (auto-generated, or user-provided)

**`savedAt` vs `createdAt`** — these differ for drafts saved offline that only
reached the server on a later sync. `GET /api/drafts/search` deliberately sorts
by `savedAt` (falling back to `updatedAt` for pre-offline records), otherwise a
batch synced after an offline stretch would all get near-identical timestamps
in replay order rather than the order the user actually made them.

**`clientSaveId`** — stamped by `OfflineSaveQueue.trySaveOrQueue()`. When a
queued save is replayed and its first attempt had in fact landed, the server
matches on `clientSaveId` and answers **200 (idempotent success)** rather than
409. This is what makes retry unconditionally safe. A 409 therefore always
means a collision with a genuinely *different* draft, which the client resolves
by renaming.

---

### Customer (`src/models/Customer.js`)

**Collection**: `Kundendaten`

Stores customer master data.

```javascript
{
  customerNumber: String,      // Unique customer ID (sparse index)
  bitrixContactId: String,     // Bitrix24 CRM contact ID
  salutation: String,          // "Herr" | "Frau"
  firstName: String,
  lastName: String,
  company: String,
  email: String,               // Lowercase, indexed
  phone: String,
  street: String,
  city: String,
  postalCode: String,
  state: String,
  country: String,
  kundendaten: Mixed,          // Flexible nested data (full form snapshot)
  sourceOfferType: String,     // Which offer type created this customer
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: 
- `customerNumber` (unique, sparse)
- `bitrixContactId`
- `firstName`, `lastName`, `company` (individual)
- `email`
- `sourceOfferType`
- Compound: `(lastName, firstName, company)`
- `updatedAt`

**Upsert Logic**: When saving a customer, the system upserts by:
1. `customerNumber` if provided, OR
2. `(firstName, lastName, company, email)` combination

---

### EmailLog (`src/models/EmailLog.js`)

**Collection**: `EmailLogs`

Tracks sent emails.

```javascript
{
  to: String,               // Recipient email (required)
  subject: String,           // Email subject
  body: String,              // Email body text
  attachmentNames: [String], // List of attachment filenames
  offerNumber: String,       // Related offer
  offerType: String,         // Related offer type
  createdAt: Date,
  updatedAt: Date
}
```

---

### User (`src/models/User.js`)

**Collection**: `users`

Named users for the internal configurator + admin auth gate.

```javascript
{
  email: String,             // unique, lowercase, trimmed, indexed
  name: String,
  firstName: String,
  lastName: String,
  passwordHash: String,      // scrypt, format "salt:hash"
  role: String,              // 'user' | 'admin'
  active: Boolean,           // default true; inactive users cannot log in
  signatureDataUrl: String,  // PNG data URL, used when this user is the
                             //   Ansprechpartner on a document
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Created via `scripts/createUser.mjs` or `POST /admin/api/users`.
See `01-ARCHITECTURE.md` → Authentication & Authorization.

---

### SigningRequest (`src/models/SigningRequest.js`)

**Collection**: `signingrequests`

One document per offer sent to a customer for online signing. Everything the
customer sees is a **snapshot taken at send time** — later edits to the offer
do not change what was signed.

```javascript
{
  token: String,             // >=32-char random hex, unique, the only thing in the URL
  offerNumber: String,
  offerId: ObjectId,         // ref: 'Offer'
  offerType: String,
  customerType: String,      // 'SZ' | 'KASSE' (from payload.Kundendaten.payer)
  bitrixEntityType: String,  // 'deal' | 'contact'
  bitrixEntityId: String,
  customerEmail: String,
  customerName: String,
  payloadSnapshot: Mixed,    // required — source of prefill + PDF
  prefill: Mixed,            // editable fields shown on the signing page
  documents: [{
    key: String,             // 'angebot'|'vollmacht'|'abtretung'|'zusatzblatt'|'abtretung_ah'
    status: String,          // 'pending' | 'signed'
    editedFields: Mixed,     // corrections the customer made
    extraFields: Mixed,      // doc-specific input not in the offer payload
    signatureImage: String,  // PNG data URL
    place: String,
    signedAt: Date,
    signedIp: String,        // audit trail
    userAgent: String
  }],
  status: String,            // 'sent'|'opened'|'partially_signed'|'completed'|'expired'
  openedAt: Date,
  completedAt: Date,
  expiresAt: Date,           // default now + 14 days
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: `token` (unique), `offerNumber`, `status`

**Methods**: `recomputeStatus()` rolls the per-document states up into
`status`; `isExpired()`.

**Document sets by customer type**: SZ → `angebot`. KASSE → `angebot`,
`vollmacht`, `abtretung`, `zusatzblatt`. AH offers → `abtretung_ah`.

---

### BitrixLog (`src/models/BitrixLog.js`)

**Collection**: `bitrixlogs`

Audit log of outbound Bitrix24 REST calls. Surfaced in the admin panel via
`GET /admin/api/bitrix-logs`.

---

### Submission (`src/models/Submission.js`)

**Collection**: `Submissions`

Legacy model for one-time form submissions.

```javascript
{
  payload: Object,           // Form data (required)
  computed: Object,          // Computed pricing results
  createdAt: Date            // Manual date field
}
```

---

## Entity Relationships

```
Customer (Kundendaten)
    |
    +-- 1:N --> Offer (via customer.customerNumber or denormalized snapshot)
    |
    +-- 1:N --> Draft (via payload.Kundendaten)
    |
    +-- 1:1 --> Bitrix Contact (via bitrixContactId)

Offer
    |
    +-- contains --> payload (full form data including Kundendaten)
    +-- contains --> pricing (computed by pricing engine)
    +-- contains --> hassmannQuickAdd[] (shower enclosure items)
    +-- references --> Products (via material productIds in payload)
    +-- references --> Services (via service line items)

Draft
    |
    +-- contains --> payload (same structure as Offer.payload)
    +-- references --> Products/Services (via payload)

Product
    |
    +-- referenced by --> Offer.payload (material selections)
    +-- referenced by --> pricing.materials[].productId
    +-- used by --> Trays suggest API
    +-- used by --> Bathtubs suggest API

Service
    |
    +-- referenced by --> pricing.services[].serviceId
```

## Payload Structure

The `payload` field in Offers and Drafts contains the complete wizard state:

```javascript
{
  activeOffer: "bu",                    // Current offer type
  offerNumber: "ANG2026-0420-143022",   // Generated offer number
  offerType: "bu",                      // Redundant but present
  
  Kundendaten: {                        // Customer data
    salutation: "Herr",
    firstName: "Max",
    lastName: "Mustermann",
    email: "max@example.com",
    phone: "0123456789",
    street: "Musterstr. 1",
    city: "Musterstadt",
    postalCode: "12345",
    customerNumber: "K-001",
    bitrixContactId: "123",
    dealId: "456",
    emc2_contact: "Berater Name",
    payer: "kk",                        // "kk" (insurance) or "sz" (self-pay)
    pflegegrad: "3",                    // Care level (1-5)
    zuschuss: "4180 MAXIMAL",           // Subsidy type
    aufschlag: "35",                    // Markup percentage
    wohnumfeld: "0",                    // Prior home modification subsidies
    // ... more fields
  },
  
  Arbeitszeit: {                        // Work hours / travel
    arbeitszeit: "8",                   // Work hours
    reisezeit: "2",                     // Travel hours (one way)
    arbeitstage: "2",                   // Work days
    reisetage: "1",                     // Travel days
    distanceKm: "150",                  // One-way distance km
    roundTripKm: "300",                 // Round-trip km
    extraHoursTotal: "0",              // Extra labor hours (BWT)
  },
  
  duschwanne: {                         // Shower tray selection
    tray: "SLA8090W",                   // Selected tray productId
    tray_color: "weiss",                // Tray color
    entry: "front",                     // Entry direction
    drain: "AGD9060",                   // Drain set
    sealing: "TRWDB",                   // Sealing set
    flooring: "PLA5282",               // Floor material
    workTasks: ["remove_tub", "install_tray", ...],
    // ... more fields
  },
  
  wandverkleidung: {                    // Wall cladding
    panelColor: "weiss_matt",
    panelType: "997x2550",
    // ... panels, profiles, adhesive, silicone selections
  },
  
  optional: {                           // Optional accessories
    qty_CLPESG30: "1",                  // Grab bar 30cm qty
    opt_CLPESG30: true,                 // Grab bar 30cm selected
    qty_CLPESG40: "0",
    // ... REHA items, other accessories
  },
  
  rabatt: {                             // Discounts & bonuses
    bonusGrab: true,                    // Free grab bar promotion
    bonus300: false,                    // 252.10 EUR bonus
    materialDiscountPct: "5",           // Material discount %
  },
  
  bwt: {                                // BWT-specific fields
    bwtDoorStd: true,                   // Standard door selected
    bwtDoorStdQty: "1",
    bwtDoorStdColor: "weiss",
    bwtDoorStdHeight: "36",
    bwtAnschlag: "Links",              // Hinge side
    // ... more door variants
  },
  
  hl: {                                 // Grab bar specific fields
    // Pipe configurations, lengths, colors
  },
  
  // Additional sections: ah, hms, wd, duschabtrennung
}
```

---

### AppConfig (`src/models/AppConfig.js`)

**Collection**: `AppConfigs`

Stores runtime overrides for business constants managed via the Admin Panel. Only keys whose values differ from the hardcoded defaults need a DB entry — `configService` falls back to defaults for any missing key.

```javascript
{
  key:       String,  // Unique config key (e.g. "TAX_RATE", "LABOR_RATE_KK")
  value:     Mixed,   // Current value (Number in practice)
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: `key` (unique)

**Usage**: Read via `configService.get(key, fallback)` throughout pricing.js and offerMapping.js. Written via `POST /admin/api/config/reset` or `PUT /admin/api/config`.

See `src/services/configService.js` → `CONFIG_SCHEMA` for the full list of configurable keys with defaults, labels, and units.

---

## Data Seeding

Seed scripts populate the product and service catalogs:

```bash
npm run seed:products    # scripts/seedProducts.js - General products
npm run seed:flexofit    # scripts/seedFlexofit.js - Flexofit product line
npm run seed:badewannen  # scripts/seedBadewannen.js - Bathtub products (IRIS*)
npm run seed:badolux     # scripts/seedbadolux.js - Badolux budget products (BP*)
```

Service seeding: `node scripts/seedServices.js`
