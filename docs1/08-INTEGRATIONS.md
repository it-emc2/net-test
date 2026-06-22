# External Integrations

## Bitrix24 CRM

### Overview
The application integrates with **Bitrix24** (`emczwei.bitrix24.de`) for customer relationship management.

### Configuration
- **Webhook Base**: `BITRIX_WEBHOOK_BASE` env var (default: hardcoded emczwei.bitrix24.de REST endpoint)
- **Authentication**: Webhook-based (secret token in URL path)

### Client (`src/services/bitrixClient.js`)
```javascript
bitrixCall(method, payload, { retries = 3, retryDelayMs = 1000 })
```

Automatic retry on:
- `QUERY_LIMIT_EXCEEDED`
- `OVERLOAD_LIMIT`
- HTTP 429 (Too Many Requests)
- HTTP 503 (Service Unavailable)

### Endpoints Used

#### Contact Lookup
```
GET /api/bitrix/contact/:id
-> Calls: crm.contact.get (id=:id)
-> Fallback: crm.requisite.list + crm.address.list for address data
-> Returns: Merged contact with ADDRESS_* fields
```

#### Timeline Comments
```
POST /api/bitrix/timeline/comment
-> Calls: crm.timeline.comment.add
-> Payload: { entityType, entityId, comment, attachments[] }
-> Used after: Email sending, document generation
```

#### Today's Customers
```
GET /api/bitrix/kundendaten?stageId=C72:UC_YOESDE
-> Proxies to: n8n webhook (N8N_TODAYS_CUSTOMERS_URL)
-> Returns: Customer list from Bitrix pipeline stage
```

### Field Mapping (Bitrix -> Form)
| Bitrix Field | Form Field |
|-------------|-----------|
| `NAME` | `firstName` |
| `LAST_NAME` | `lastName` |
| `EMAIL[0].VALUE` | `email` |
| `PHONE[0].VALUE` | `phone` |
| `HONORIFIC` (HNR_DE_1) | `salutation` = "Frau" |
| `HONORIFIC` (HNR_DE_2) | `salutation` = "Herr" |
| `ADDRESS_*` | street, city, postalCode |

---

## Hassmann / Magic API (Shower Enclosures)

### Overview
External product API for searching shower enclosure configurations.

### Configuration
- **Base URL**: `EXTERNAL_API_BASE` env var (default: `https://duschabtrennung-backend.fly.dev`)
- **Authentication**: Bearer token (cached, auto-refreshed on expiry)
- **Login**: `EXTERNAL_API_USER` + `EXTERNAL_API_PASSWORD`

### Token Management
```javascript
// Token cached in memory
let cachedToken = null;
let tokenExpiry = 0;

// Auto-login when token expired
async function getToken() {
  if (Date.now() < tokenExpiry) return cachedToken;
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  cachedToken = res.data.token;
  tokenExpiry = Date.now() + 3600000; // 1 hour
  return cachedToken;
}
```

### Search Endpoint
```
POST /api/magic/search
Body: { kind: "corner"|"niche"|"uform"|"walkin", payload: {...} }
```

**Kind to External Path Mapping**:
| Kind | External Endpoint |
|------|------------------|
| `corner` | `/api/eckeinstieg-best-all/search` |
| `niche` | `/api/niche-best-all/search` |
| `uform` | `/api/uform-gleitur-all/search` |
| `walkin` | `/api/walkin-best-all/search` |

### Response Structure
```json
{
  "ok": true,
  "kind": "corner",
  "results": {
    "best": { "productId": "...", "name": "...", "priceNet": 500, "priceGross": 595, "images": [...] },
    "sidePanel": { ... },
    "tray": { ... },
    "totalPriceNet": 1200,
    "widthRangeMessage": "Breite: 85-95 cm"
  }
}
```

---

## OpenRouteService (ORS) - Geolocation & Routing

### Overview
Calculates travel distance from company location to customer address.

### Configuration
- **API Key**: `ORS_API_KEY` env var (optional - enables ORS as provider)
- **Company Location**: `COMPANY_LAT`, `COMPANY_LNG`, `COMPANY_ADDRESS` env vars

### Multi-Provider Strategy

The routing system uses multiple providers with automatic fallback:

#### Geocoding (Address -> Coordinates)

**Priority Order**:
1. **Photon** (Komoot) - Primary geocoder
   - URL: `https://photon.komoot.io/api`
   - Free, no API key required
   - Best for German addresses

2. **ORS** (OpenRouteService) - Secondary
   - URL: `https://api.openrouteservice.org/geocode/search`
   - Requires API key
   - Good international coverage

3. **Nominatim** (OpenStreetMap) - Fallback
   - URL: `https://nominatim.openstreetmap.org/search`
   - Free but rate-limited
   - Last resort

**Address Variant Builder**:
The system generates multiple address variants from most to least specific:
1. `"Musterstr. 1, 12345 Musterstadt, Germany"`
2. `"Musterstr., 12345 Musterstadt, Germany"`
3. `"12345 Musterstadt, Germany"`
4. `"Musterstadt, Germany"`

Each variant is tried until a valid result (matching postal code + city) is found.

#### Routing (Coordinates -> Distance)

**Priority Order**:
1. **ORS** (OpenRouteService) - Primary router
   - URL: `https://api.openrouteservice.org/v2/directions/driving-car`
   - Requires API key

2. **OSRM** (Open Source Routing Machine) - Fallback
   - URL: `https://router.project-osrm.org/route/v1/driving`
   - Free, no API key
   - Fallback when ORS unavailable

### Response
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

---

## Binect - Postal Delivery Service

### Overview
Sends physical mail (printed letters) to customers via Binect API.

### Configuration
- **Base URL**: `BINECT_BASE_URL` env var (default: `https://app.binect.de/binectapi/v1`)
- **Authentication**: Basic auth (`BINECT_USERNAME`, `BINECT_PASSWORD`)

### Workflow

```
1. Validate & normalize recipient address
   |
2. POST /documents -> Upload main document (base64)
   |
3. PUT /documents/{id}/coverpage -> Add cover page (optional)
   |
4. POST /documents -> Upload each attachment
   |
5. PUT /documents/{mainId}/attachments/{attachId} -> Link attachments
   |
6. POST /sendings/{id} -> Send document for printing/delivery
   |
7. POST /api/bitrix/timeline/comment -> Record in CRM (optional)
```

### Static Attachments
Pre-configured attachments that can be included:
- `Abtretungserklaerung` - Assignment declaration
- `emc2_Barrierefreies_Wohnen` - Barrier-free living brochure
- `Vollmacht` - Power of attorney

---

## Nodemailer - Email (SMTP)

### Configuration
- **Host**: `SMTP_HOST`
- **Port**: `SMTP_PORT` (default: 587)
- **User**: `SMTP_EMAIL`
- **Password**: `SMTP_PASS`
- **Reply-To**: `SMTP_REPLY_TO` (optional)

### Usage
Email is sent via `POST /api/email/send-offer` with:
- On-the-fly PDF generation
- Preset file attachments
- User-uploaded attachments (up to 10, via multer)
- SMTP timeout: 8000ms

### SMTP Health Check
```
GET /api/email/smtp-test
-> DNS resolve SMTP_HOST
-> TCP connect to host:port
-> Returns: { ok, host, port, resolved, msg }
```

---

## Adobe PDF Services

### Configuration
- **Client ID**: `PDF_SERVICES_CLIENT_ID`
- **Client Secret**: `PDF_SERVICES_CLIENT_SECRET`

### Capabilities
- **Document Merge**: Merge JSON data into DOCX/PDF templates
- **DOCX Generation**: Generate Word documents from templates
- **PDF Conversion**: Convert DOCX to PDF
- **Batch Processing**: Generate DOCX + PDF in single request

### Endpoints
```
POST /api/adobe-pdf/docx          -> Generate DOCX
POST /api/adobe-pdf/pdf           -> Generate PDF
POST /api/adobe-pdf/document-merge -> Merge JSON into template
POST /api/adobe-pdf/batch         -> DOCX + PDF combo
GET  /api/adobe-pdf/status        -> Check configuration
```

---

## n8n - Workflow Automation

### Overview
n8n webhook integration for fetching today's customer list.

### Configuration
- **Webhook URL**: `N8N_TODAYS_CUSTOMERS_URL`

### Usage
```
GET /api/bitrix/kundendaten?stageId=C72:UC_YOESDE
-> Proxies to n8n webhook
-> Returns: Customer list filtered by Bitrix pipeline stage
```

---

## Route Planning Service

### Overview
External planning/scheduling API (separate application).

### Configuration
- **Base URL**: `PLANNING_API_BASE_URL` (default: `https://route-plannung.fly.dev`)

### Endpoints
```
GET /api/planning/current  -> Current planning state (proxied JSON)
GET /api/planning/stream   -> Server-Sent Events stream (proxied SSE)
```

The stream endpoint supports real-time updates via SSE, with automatic abort on client disconnect.

---

## Integration Architecture Summary

```
                    EMC2 Konfigurator
                         |
         +---------------+---------------+
         |               |               |
    Customer Data    Products &       Documents
         |           Pricing             |
         v               |               v
   +----------+          |         +-----------+
   | Bitrix24 |          |         | Binect    |
   | CRM      |          |         | (postal)  |
   +----------+          |         +-----------+
         |               |
         v               v
   +----------+    +-----------+    +-----------+
   | n8n      |    | Hassmann  |    | Adobe PDF |
   | (webhook)|    | (products)|    | Services  |
   +----------+    +-----------+    +-----------+
                         |
                   +-----------+
                   | Geocoding |
                   | ORS/Photon|
                   | Nominatim |
                   +-----------+
                         |
                   +-----------+
                   | Routing   |
                   | ORS/OSRM  |
                   +-----------+
```
