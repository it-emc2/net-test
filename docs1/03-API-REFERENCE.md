# API Reference

All endpoints are served from Express.js on port 3000 (configurable). No authentication is required.

## Health

### `GET /api/health`
Returns server health status.

**Response**:
```json
{
  "ok": true,
  "db": "KonfiguratorDB",
  "time": "2026-04-20T14:30:00.000Z"
}
```

---

## Products

### `GET /api/products`
List/search products.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | - | Search query (name/productId) |
| `prefix` | string | - | Filter by productId prefix |
| `source` | string | - | Filter by source (e.g., "badolux") |
| `limit` | number | 200 | Max results (1-500) |

**Response**: `Product[]`

### `GET /api/products/:id`
Get single product by productId.

**Response**: `Product` or 404

### `POST /api/products/bulk`
Upsert multiple products.

**Body**: `Product[]` (array of product objects)

**Response**: `{ ok: true, upserted: number, modified: number }`

### `GET /api/products/sla`
Get SLA-prefix shower tray products sorted by dimensions.

**Response**: `Product[]` (productId, name, dimensions, price)

---

## Services

### `GET /api/services`
List/search services.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search by serviceId, name, or internal_name |

**Response**: `Service[]`

### `GET /api/services/:id`
Get single service by serviceId.

### `POST /api/services/bulk`
Upsert multiple services.

**Body**: `Service[]`

---

## Pricing

### `POST /api/price`
Compute prices for an offer payload (stateless - does not save).

**Body**: Full offer payload (see Payload Structure in Database Models doc)

**Response**: Computed pricing object:
```json
{
  "items": [],
  "materials": {
    "title": "Materialkosten",
    "lines": [
      { "key": "SLA8090W", "label": "Duschwanne SLA 80x90", "qty": 1, "unitPrice": 299.00, "lineTotal": 299.00 }
    ],
    "sum": 1500.00,
    "grabCounts": { "cl30": 1, "cl40": 0, "cl60": 0, "cl80": 0, "total": 1, "freeId": "CLPESG30" }
  },
  "services": {
    "title": "Dienstleistungskosten",
    "lines": [
      { "key": "fahrzeugbereitstellung", "label": "Fahrzeugbereitstellung", "qty": 2, "unitPrice": 80.00, "lineTotal": 160.00 }
    ],
    "sum": 2500.00,
    "payer": "kk",
    "laborHours": 8,
    "laborRate": 69.50,
    "distanceKm": 150
  },
  "productsSubtotal": 1500.00,
  "markupPct": 0.35,
  "markup": 525.00,
  "Nettobetrag": 4025.00,
  "baseSubtotal": 4025.00,
  "baseVat": 764.75,
  "base_total": 4789.75,
  "netAfterRabatt": 3950.00,
  "materialDiscountPct": 0.05,
  "rabattAmount": 75.00,
  "totalAfterRabatt": 4700.50,
  "vatOnNet": 750.50,
  "total": 4700.50,
  "bonusGross": 0,
  "bonusFlags": { "bonusGrab": true, "bonus300": false },
  "subsidyKind": "4180 MAXIMAL",
  "subsidyAmount": 4180.00,
  "subsidyAmount_max": 4180.00,
  "selfPayAmount": 520.50,
  "selectedTray": { "productId": "SLA8090W", "name": "Duschwanne...", "sizeLabel": "80x90", "unitPrice": 299.00 },
  "materialsDisplayUI": [...],
  "optionalDisplayUI": [...],
  "servicesDisplayUI": [...],
  "materialsDisplayDocx": [...],
  "servicesDisplayDocx": [...],
  "bwtIncludedDisplayUI": [...]
}
```

---

## Offers

### `GET /api/offers`
List offers with search.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | - | Search query |
| `offerType` | string | - | Filter by offer type |
| `limit` | number | 50 | Max results |

**Response**: `Offer[]` (limited fields: offerNumber, offerType, status, timestamps, payload, pricing)

### `GET /api/offers/:offerNumber`
Get single offer by offer number.

**Response**: Full `Offer` document

### `POST /api/offers`
Save/upsert an offer.

**Body**:
```json
{
  "offerNumber": "ANG2026-0420-143022",
  "offerType": "bu",
  "payload": { /* full form data */ },
  "pricing": { /* computed pricing */ },
  "status": "final"
}
```

**Response**: Updated `Offer` document. Returns 409 on duplicate key conflict.

### `GET /api/offers/search-all`
Global search across both Drafts and Offers.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | (required) | Search query |
| `limit` | number | 20 | Max results (1-50) |

**Response**: Mixed results with scoring:
```json
[
  { "kind": "offer", "id": "...", "title": "ANG2026-...", "offerType": "bu", "score": 10, "updatedAt": "..." },
  { "kind": "draft", "id": "...", "title": "Draft Name", "offerType": "bwt", "score": 8, "updatedAt": "..." }
]
```

### `GET /api/offers/external/search`
External API for searching offers (used by embedded iframes).

**Query Parameters**: `q` (search query)

**Response**: Structured search results with `{kind, id, title, offerType, ...}`

### `GET /api/offers/external/offers/:offerNumber`
External API for fetching a specific offer.

### `GET /api/offers/external/drafts/:id`
External API for fetching a specific draft.

---

## Drafts

### `POST /api/drafts`
Create a new draft.

**Body**:
```json
{
  "name": "ANG-BU-Mustermann-20260420",
  "offerType": "bu",
  "payload": { /* full form data */ }
}
```

**Response**: Created `Draft` document. Returns 409 if name+offerType already exists.

### `GET /api/drafts/search`
Search drafts.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `offerType` | string | (required) Offer type filter |
| `q` | string | Optional search query |

**Response**: `Draft[]` (limited fields, sorted by updatedAt, max 10)

### `GET /api/drafts/:id`
Get draft by MongoDB ObjectId.

**Response**: Full `Draft` with payload

---

## Customers

### `POST /api/customers`
Save/upsert a customer.

**Body**: Customer data object (flexible structure, see Kundendaten fields)

**Upsert Strategy**: Matches by `customerNumber` OR by `(firstName, lastName, company, email)`

**Response**: Upserted `Customer` document

### `GET /api/customers/search`
Search customers.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | (required) | Search query |
| `limit` | number | 10 | Max results (1-50) |

**Searched Fields**: customerNumber, firstName, lastName, company, email, phone, city, street, cp_name, emc2_contact, kassenkundeName, fullName

**Response**: `Customer[]`

### `GET /api/customers/:id`
Get customer by MongoDB ObjectId.

---

## Email

### `POST /api/email/send-offer`
Send offer via email with PDF attachment.

**Content-Type**: `multipart/form-data`

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `to` | string | Recipient email |
| `subject` | string | Email subject |
| `body` | string | Email body (HTML) |
| `offerNumber` | string | Offer number |
| `offerType` | string | Offer type |
| `payload` | string | JSON-stringified offer payload |
| `dealId` | string | Bitrix deal ID (optional) |
| `contactId` | string | Bitrix contact ID (optional) |
| `excludePreset` | string | Comma-separated preset names to exclude |
| `attachments[]` | File[] | Additional file attachments (max 10) |

**Behavior**:
1. Generates PDF from offer payload on-the-fly
2. Attaches preset files unless excluded (Abtretungserklaerung, Barrierefreies_Wohnen, Vollmacht)
3. Sends via SMTP
4. Logs to EmailLog collection
5. Posts timeline comment to Bitrix CRM (if dealId provided)

**Response**: `{ ok: true, messageId: "...", attachmentNames: [...], bitrixComment: {...} }`

### `GET /api/email/smtp-test`
Test SMTP connectivity.

**Response**: `{ ok: true/false, host: "...", port: 587, resolved: "IP", msg: "..." }`

---

## Bitrix CRM

### `GET /api/bitrix/contact/:id`
Get Bitrix24 contact by ID.

**Response**: Contact object with address fields (merged from contact + requisites)

### `POST /api/bitrix/timeline/comment`
Add timeline comment to Bitrix entity.

**Body**:
```json
{
  "entityType": "deal",
  "entityId": "456",
  "comment": "Angebot gesendet",
  "attachments": [{ "name": "file.pdf", "content": "base64..." }]
}
```

### `GET /api/bitrix/kundendaten`
Fetch today's customers from Bitrix via n8n webhook.

**Query Parameters**: `stageId` (default: `C72:UC_YOESDE`)

---

## Routing / Geolocation

### `POST /api/routing/suggest-distance`
Calculate travel distance from company to customer.

**Body**: Kundendaten object with address fields (street, city, postalCode)

**Geocoding Providers** (tried in order): Photon (Komoot), ORS, Nominatim

**Routing Providers** (tried in order): ORS, OSRM

**Response**:
```json
{
  "ok": true,
  "oneWayKm": 150.5,
  "roundTripKm": 301.0,
  "oneWaySeconds": 5400,
  "roundTripSeconds": 10800,
  "from": { "lat": 50.3135, "lng": 11.9128 },
  "to": { "lat": 50.1234, "lng": 11.5678 },
  "geocodeProvider": "photon",
  "routeProvider": "ors"
}
```

### `GET /api/routing/health`
Check routing service availability.

---

## Product Suggestions

### `GET /api/trays/suggest`
Suggest shower trays matching dimensions.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `w` | number | Width in cm |
| `l` | number | Length in cm |
| `h` | number | Height in cm |
| `budget` | 0/1 | Budget mode |
| `series` | string | "SLA" or "DW" prefix filter |

**Response**: Top 3 matching trays ranked by closeness (Euclidean distance) then price

### `GET /api/bathtubs/suggest`
Suggest bathtubs matching dimensions.

**Query Parameters**: `w` (width), `l` (length)

**Response**: Top 3 matching bathtubs (IRIS* prefix, excluding IRISWAS*)

### `GET /api/bathtubs/screens/suggest`
Suggest bathtub shower screens.

**Query Parameters**: `bucket` (70/75), `side` (L/R)

### `GET /api/bathtubs/recommend-screen`
Recommend a screen for a specific bathtub.

**Query Parameters**: `bathtubProductId`

**Response**: `{ bathtub: {...}, recommended: { productId, name, price, heightCm, bucket, side } }`

---

## External API Proxy (Hassmann/Magic)

### `GET /api/magic/health`
Health check of external shower enclosure API.

### `GET /api/magic/products`
List products from external API.

### `POST /api/magic/search`
Search for shower enclosure combos.

**Body**:
```json
{
  "kind": "corner",
  "payload": {
    "width": 90,
    "depth": 90,
    "priceRange": [500, 2000],
    "openingTypes": ["swing"],
    "orientation": "left"
  }
}
```

**Kind Values**: `corner` | `niche` | `uform` | `walkin`

**Response**: `{ ok: true, kind: "corner", path: "/api/eckeinstieg-best-all/search", results: [...] }`

---

## Document Generation

### `POST /pdf`
Generate basic PDF from offer data.

**Body**: Full offer payload

**Response**: PDF file download (`Content-Type: application/pdf`)

### `POST /docx-template`
Generate DOCX from template.

**Body**: Full offer payload + pricing

**Template Selection**: Based on `activeOffer` field:
- `bu` -> `Angebot.docx`
- `bwt` -> `Angebot-BWT.docx`
- `hl` -> `Angebot-HL.docx`
- `bl` -> `Angebot-BL.docx`

**Response**: DOCX file download

### `POST /pdf-template`
Generate PDF from DOCX template (DOCX -> LibreOffice -> PDF).

### `POST /api/adobe-pdf/docx`
Generate DOCX via Adobe PDF Services.

### `POST /api/adobe-pdf/pdf`
Generate PDF via Adobe PDF Services.

### `POST /api/adobe-pdf/document-merge`
Merge JSON data into PDF template via Adobe SDK.

### `POST /api/adobe-pdf/batch`
Generate DOCX + PDF in single request.

### `POST /api/adobe-pdf/status`
Check Adobe PDF Services configuration status.

### `POST /api/latex-template`
Generate document via LaTeX compilation.

---

## Work Reports & Calculations

### `POST /arbeitsbericht`
Generate work report (Arbeitsbericht) PDF.

**Auto-generates**: Unique ID `ARB-XXXXXX` (DB-backed with collision retry)

**Response**: PDF download or `{ ok: true, arbId: "ARB-...", base64: "..." }`

### `POST /kalkulation`
Generate cost calculation PDF.

**Auto-generates**: Unique ID `CALC-XXXX`

**Response**: PDF download or JSON with base64

### `POST /material-overview`
Generate material overview PDF.

**Body**: Offer payload with computed pricing

**Response**: PDF with aggregated material list

---

## Postal Delivery

### `POST /api/post/send`
Send document via postal service (Binect).

**Body**:
```json
{
  "recipient": { "name": "...", "street": "...", "city": "...", "postalCode": "..." },
  "document": "base64...",
  "options": { "color": false, "duplex": true },
  "attachments": ["Abtretungserklaerung", "Vollmacht"],
  "meta": { "offerNumber": "..." },
  "dealId": "456",
  "bitrixEntityType": "deal"
}
```

**Workflow**: Upload document -> Add coverpage -> Upload attachments -> Send -> Post Bitrix comment

**Response**: `{ ok: true, documentId: "...", uploadStatus: {...}, sendingStatus: {...}, bitrix: {...} }`

---

## Planning (SSE)

### `GET /api/planning/current`
Get current planning state (proxied from external planning service).

### `GET /api/planning/stream`
Stream planning updates via Server-Sent Events.

**Response**: `Content-Type: text/event-stream` (streaming)

---

---

## Admin Panel

All admin endpoints require a `Bearer` token in the `Authorization` header. Obtain the token via `POST /admin/api/login`.

The admin panel UI is served as a static page at `GET /admin/` and also embedded as an iframe modal in the main SPA via the ⚙ Admin button on the home screen.

### `POST /admin/api/login`
Authenticate with the admin password.

**Body**:
```json
{ "password": "your-admin-password" }
```

**Response** (200):
```json
{ "token": "1750000000000.abc123..." }
```
Token is a HMAC-SHA256 signed string, valid for 24 hours. Set `ADMIN_PASSWORD` in `.env`.

---

### `GET /admin/api/config`
Return all configurable business constants with current values and metadata.

**Headers**: `Authorization: Bearer <token>`

**Response**: Array of config items:
```json
[
  {
    "key": "LABOR_RATE_KK",
    "label": "Stundensatz Kassenkunde",
    "description": "Stundensatz für Kassenpatienten (KK)",
    "unit": "€/h",
    "type": "euro",
    "section": "shared",
    "order": 2,
    "defaultValue": 69.5,
    "value": 69.5
  }
]
```

---

### `PUT /admin/api/config`
Bulk-update config values. Only keys defined in `CONFIG_SCHEMA` are accepted.

**Headers**: `Authorization: Bearer <token>`

**Body**: `{ "LABOR_RATE_KK": 72.0, "KM_RATE": 0.40 }`

**Response**: `{ "ok": true, "updated": 2 }`

---

### `POST /admin/api/config/reset`
Reset a single key to its hardcoded default.

**Headers**: `Authorization: Bearer <token>`

**Body**: `{ "key": "LABOR_RATE_KK" }`

**Response**: `{ "ok": true, "key": "LABOR_RATE_KK", "value": 69.5 }`

---

## Submissions (Legacy)

### `POST /api/submissions`
Save a form submission with computed pricing.

**Body**: Offer payload

**Response**: `{ id: "MongoDB_ObjectId", computed: { /* pricing */ } }`
