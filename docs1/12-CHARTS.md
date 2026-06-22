# Architecture & Flow Charts

All diagrams use Mermaid syntax for portable rendering.

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Browser["Browser (SPA)"]
        HTML["index.html<br/>8645 lines"]
        JS["script.js<br/>21514 lines"]
        CSS["style.css<br/>6499 lines"]
        MGR["Manager Modules<br/>12 ES6 modules"]
        EB["EventBus"]
        SM["StateManager"]
        SS["sessionStorage"]
    end

    subgraph Server["Express.js Server (src/app.js)"]
        MW["Middleware Stack<br/>Helmet | CORS | Compression | Morgan"]
        RT["20+ Route Handlers"]
        BL["Business Logic<br/>pricing.js | offerMapping.js"]
        MOD["Mongoose Models<br/>7 collections"]
    end

    subgraph External["External Services"]
        MONGO[(MongoDB Atlas<br/>KonfiguratorDB)]
        BITRIX[Bitrix24 CRM]
        HASS[Hassmann API<br/>Shower Enclosures]
        GEO[Geocoding<br/>Photon / ORS / Nominatim]
        ROUTE[Routing<br/>ORS / OSRM]
        SMTP[SMTP Server<br/>Email]
        BINECT[Binect<br/>Postal Delivery]
        ADOBE[Adobe PDF Services]
        N8N[n8n Webhooks]
        PLAN[Planning API<br/>route-plannung.fly.dev]
    end

    Browser -->|"Fetch API<br/>(JSON / multipart)"| Server
    Server -->|"JSON / PDF / DOCX"| Browser

    SM <--> SS
    EB <--> SM
    MGR <--> EB
    JS <--> EB

    RT --> BL
    BL --> MOD
    MOD --> MONGO

    RT --> BITRIX
    RT --> HASS
    RT --> GEO
    RT --> ROUTE
    RT --> SMTP
    RT --> BINECT
    RT --> ADOBE
    RT --> N8N
    RT --> PLAN
```

---

## 2. Express Middleware Pipeline

```mermaid
flowchart LR
    REQ([Incoming Request]) --> HELMET[Helmet<br/>Security Headers + CSP]
    HELMET --> CORS[CORS<br/>Origin Whitelist]
    CORS --> COMP[Compression<br/>gzip]
    COMP --> MORGAN[Morgan<br/>Request Logging]
    MORGAN --> JSON[express.json<br/>25MB limit]
    JSON --> URL[express.urlencoded]
    URL --> STATIC["express.static<br/>(src/public/)"]

    STATIC -->|"API route"| ROUTES[Route Handlers]
    STATIC -->|"Non-API GET"| SPA["SPA Fallback<br/>index.html"]

    ROUTES --> RES([Response])
    SPA --> RES
```

---

## 3. Database Entity Relationship Diagram

```mermaid
erDiagram
    PRODUCT {
        string productId PK "unique, indexed"
        string name
        number price
        number widthCm
        number heightCm
        number lengthCm
        string source
    }

    SERVICE {
        string serviceId PK "unique, indexed"
        string name
        string description
        string internal_name
        number price
        number time
        string source
    }

    CUSTOMER {
        ObjectId _id PK
        string customerNumber UK "sparse"
        string bitrixContactId
        string salutation
        string firstName
        string lastName
        string company
        string email
        string phone
        string street
        string city
        string postalCode
        mixed kundendaten
        string sourceOfferType
    }

    OFFER {
        ObjectId _id PK
        string offerNumber UK "indexed"
        string offerType "bu|bwt|hl|bl|ah|hms|wd"
        mixed payload "full wizard state"
        mixed pricing "computed pricing"
        object customer "denormalized snapshot"
        array hassmannQuickAdd
        string pdfUrl
    }

    DRAFT {
        ObjectId _id PK
        string name "required"
        string offerType "required"
        object payload "full wizard state"
    }

    EMAILLOG {
        ObjectId _id PK
        string to
        string subject
        string body
        array attachmentNames
        string offerNumber
        string offerType
    }

    SUBMISSION {
        ObjectId _id PK
        object payload
        object computed
        date createdAt
    }

    CUSTOMER ||--o{ OFFER : "has many"
    CUSTOMER ||--o{ DRAFT : "referenced in payload"
    OFFER ||--o{ EMAILLOG : "tracked by offerNumber"
    OFFER }o--o{ PRODUCT : "references via payload"
    OFFER }o--o{ SERVICE : "references via pricing"
    DRAFT }o--o{ PRODUCT : "references via payload"
```

---

## 4. Offer Wizard Flow (Page Navigation)

```mermaid
flowchart TD
    HOME["#page-home<br/>Offer Type Selection"]

    HOME -->|"bu (Badumbau)"| KD_BU
    HOME -->|"bwt (Badewannentuer)"| KD_BWT
    HOME -->|"hl (Haltegriffe)"| KD_HL
    HOME -->|"bl (Badelift)"| KD_BL
    HOME -->|"ah / hms / wd"| KD_OTHER

    subgraph BU["BU Flow (7 steps)"]
        KD_BU["Kundendaten"] --> AZ["Arbeitszeit"]
        AZ --> DW["Duschwanne"]
        DW --> WV["Wandverkleidung"]
        WV --> DA["Duschabtrennung"]
        DA --> OPT["Optional"]
        OPT --> RAB["Rabatt"]
    end

    subgraph BWT["BWT Flow (2 steps)"]
        KD_BWT["Kundendaten"] --> BWT_PAGE["BWT Page"]
    end

    subgraph HL["HL Flow (2 steps)"]
        KD_HL["Kundendaten"] --> HL_PAGE["HL Page"]
    end

    subgraph BL["BL Flow (2 steps)"]
        KD_BL["Kundendaten"] --> BL_PAGE["BL Page"]
    end

    subgraph OTHER["AH/HMS/WD Flow (2 steps)"]
        KD_OTHER["Kundendaten"] --> OTHER_PAGE["AH / HMS / WD Page"]
    end

    RAB --> EXPORT["Export / Email / Save"]
    BWT_PAGE --> EXPORT
    HL_PAGE --> EXPORT
    BL_PAGE --> EXPORT
    OTHER_PAGE --> EXPORT
```

---

## 5. Frontend State Management Flow

```mermaid
flowchart TD
    subgraph UI["User Interface"]
        INPUT["User types / clicks<br/>form field"]
        TILES["Image tile selection"]
        CANVAS["Drawing pad / Signature"]
    end

    subgraph Events["EventBus (pub/sub)"]
        E1["form:field:changed"]
        E2["field:changed"]
        E3["pricing:updated"]
        E4["step:changed"]
        E5["offer:started"]
    end

    subgraph State["StateManager"]
        SET["setField(formKey, field, value)"]
        GET["getField / getFormData"]
        PERSIST["persist to sessionStorage<br/>(debounced 300ms)"]
    end

    subgraph Backend["Server"]
        PRICE_API["POST /api/price"]
    end

    subgraph Display["UI Updates"]
        WIDGET["Summary Widget<br/>(totals, customer name)"]
        SIDEBAR["Sidebar<br/>(progress dots)"]
        DETAIL["Detail views<br/>(material lists, costs)"]
    end

    INPUT -->|"input/change event"| E1
    TILES -->|"change event"| E1
    CANVAS -->|"save ops"| State

    E1 -->|"subscribe"| SET
    SET --> PERSIST
    SET -->|"emit"| E2

    E2 -->|"triggers"| PRICE_API
    PRICE_API -->|"response"| E3

    E3 --> WIDGET
    E3 --> DETAIL
    E4 --> SIDEBAR
    E5 --> SIDEBAR

    GET -.->|"read"| WIDGET
    GET -.->|"buildPayload()"| PRICE_API
```

---

## 6. Pricing Engine Pipeline

```mermaid
flowchart TD
    PAYLOAD["Offer Payload<br/>(from buildPayload)"]

    PAYLOAD --> CM["computeMaterials(payload)"]
    PAYLOAD --> CS["computeServiceCosts(payload)"]
    PAYLOAD --> CW["computeWorkNotes(payload)"]
    PAYLOAD --> CB["computeBwtIncludedLines(payload)<br/>(BWT only)"]

    subgraph Materials["Material Collection"]
        CM --> DW_MAT["Duschwanne items<br/>tray, drain, sealing, flooring"]
        CM --> WV_MAT["Wandverkleidung items<br/>panels, profiles, adhesive"]
        CM --> OPT_MAT["Optional items<br/>grab bars, REHA products"]
        CM --> BWT_MAT["BWT items<br/>door variants, aids"]
        CM --> HL_MAT["HL items<br/>pipes by linear meter"]
        CM --> DA_MAT["Duschabtrennung<br/>Hassmann quick-add"]
    end

    subgraph Services["Service Costs"]
        CS --> VEH["Fahrzeugbereitstellung<br/>80 EUR/day"]
        CS --> TOOLS["Werkzeuge<br/>7.50 EUR/day"]
        CS --> CLEAR["Beraeumung<br/>4.50 EUR/day"]
        CS --> KM["Kilometerpauschale<br/>0.35 EUR/km"]
        CS --> LABOR["Labor<br/>KK: 69.50 | SZ: 59.50<br/>x2 Handwerker"]
        CS --> TRAVEL["Reisezeit<br/>laborRate + 25/35 EUR"]
    end

    DW_MAT & WV_MAT & OPT_MAT & BWT_MAT & HL_MAT & DA_MAT --> PROD_SUB["productsSubtotal"]
    VEH & TOOLS & CLEAR & KM & LABOR & TRAVEL --> SVC_SUM["services.sum"]

    PROD_SUB --> MARKUP{"Markup?<br/>BWT = 0%<br/>Others = 35% default"}
    MARKUP --> NETTO["Nettobetrag<br/>= products + markup + services"]

    NETTO --> RABATT["Material Discount<br/>0-9% on productsSubtotal"]
    RABATT --> BONUS["Bonus Deductions<br/>bonusGrab | bonus300"]
    BONUS --> NET_AFTER["netAfterRabatt"]
    NET_AFTER --> VAT["VAT 19%"]
    VAT --> TOTAL["total = net + VAT"]

    TOTAL --> SUBSIDY{"Kassenkunde?"}
    SUBSIDY -->|"KK"| SUB_CALC["subsidyAmount<br/>max 4180 / 8360 EUR"]
    SUBSIDY -->|"SZ"| SELF_PAY["selfPayAmount = total"]
    SUB_CALC --> SELF_PAY2["selfPayAmount<br/>= total - subsidy"]
```

---

## 7. Document Generation Pipelines

```mermaid
flowchart LR
    subgraph Input
        PL["Offer Payload<br/>+ Pricing"]
    end

    subgraph Pipeline1["Pipeline 1: DOCX Template"]
        MAP["offerMapping.js<br/>mapOfferToDocxData()"]
        TMPL["docxtemplater<br/>+ PizZip"]
        DOCX_OUT["DOCX File"]
    end

    subgraph Pipeline2["Pipeline 2: DOCX -> PDF"]
        LIBRE["LibreOffice<br/>--headless --convert-to pdf"]
        PDF_OUT1["PDF File"]
    end

    subgraph Pipeline3["Pipeline 3: Direct PDF"]
        PDFKIT["PDFKit<br/>programmatic"]
        PDF_OUT2["PDF File"]
    end

    subgraph Pipeline4["Pipeline 4: Adobe PDF"]
        ADOBE["Adobe PDF<br/>Services SDK"]
        PDF_OUT3["PDF File"]
    end

    subgraph Pipeline5["Pipeline 5: LaTeX"]
        TEX["LaTeX Template"]
        PDFLATEX["pdflatex"]
        PDF_OUT4["PDF File"]
    end

    PL --> MAP --> TMPL --> DOCX_OUT
    DOCX_OUT --> LIBRE --> PDF_OUT1

    PL --> PDFKIT --> PDF_OUT2
    PL --> ADOBE --> PDF_OUT3
    PL --> TEX --> PDFLATEX --> PDF_OUT4
```

---

## 8. DOM Structure (Page Layout)

```mermaid
graph TD
    HTML["html<br/>[data-theme] [data-mode]"]
    BODY["body"]
    HTML --> BODY

    BODY --> SIDEBAR["#sidebar<br/>Fixed left 260px"]
    BODY --> MAIN["main content area"]
    BODY --> WIDGET["#summaryWidget<br/>Fixed top-right"]
    BODY --> TOASTER["#nt-toaster<br/>Toast notifications"]
    BODY --> MODALS["Modal overlays<br/>z-index 9990"]

    subgraph SB["Sidebar"]
        NAV_ITEMS["Nav items with<br/>progress dots"]
        SB_TOGGLE["Toggle button<br/>(mobile)"]
        THEME_CTL["Theme selector<br/>+ Dark mode toggle"]
    end
    SIDEBAR --> NAV_ITEMS
    SIDEBAR --> SB_TOGGLE
    SIDEBAR --> THEME_CTL

    subgraph Pages["Page Containers (only 1 visible)"]
        P_HOME["#page-home<br/>Offer type tiles"]
        P_KD["#page-Kundendaten<br/>Customer form"]
        P_AZ["#page-Arbeitszeit<br/>Work hours"]
        P_DW["#page-Duschwanne<br/>Shower tray"]
        P_WV["#page-Wandverkleidung<br/>Wall cladding"]
        P_DA["#page-Duschabtrennung<br/>Shower enclosure"]
        P_OPT["#page-Optional<br/>Accessories"]
        P_RAB["#page-Rabatt<br/>Discounts"]
        P_KOS["#page-Kosten<br/>Cost overview"]
        P_ZUS["#page-Zusammenfassung<br/>Summary"]
        P_BWT["#page-bwt<br/>BWT form"]
        P_HL["#page-hl<br/>Grab bars"]
        P_BL["#page-bl<br/>Bath lift"]
        P_AH["#page-ah<br/>Everyday aids"]
        P_ADM["#page-admin<br/>Admin panel"]
        P_SVC["#page-services<br/>Services admin"]
        P_CRM["#page-crm-emc2<br/>CRM view"]
    end
    MAIN --> Pages

    subgraph WidgetContent["Summary Widget"]
        W_CUST["Customer name"]
        W_TOTAL["Running totals"]
        W_BTNS["Save / Export buttons"]
    end
    WIDGET --> WidgetContent
```

---

## 9. Manager Module Dependency Map

```mermaid
graph TD
    subgraph Core["Core Systems"]
        EB["EventBus"]
        SM["StateManager"]
        SCRIPT["script.js<br/>(globals)"]
    end

    subgraph Managers["Manager Modules"]
        DRAFTS["DraftsManager"]
        EXPORT["ExportManager"]
        EMAIL["EmailManager"]
        RESTORE["RestoreManager"]
        DRAWING["DrawingPadManager"]
        SIGNATURE["SignaturePadManager"]
        HASSMANN["HassmannManager"]
        BADOLUX["BadoluxManager"]
        ADMIN["AdminManager"]
        THEME["ThemeManager"]
        INTEG["IntegrationsManager"]
        TODAYS["TodaysCustomers"]
    end

    subgraph APIs["Backend Endpoints"]
        API_DRAFT["/api/drafts"]
        API_OFFER["/api/offers"]
        API_EMAIL["/api/email"]
        API_DOCX["/docx-template"]
        API_PDF["/pdf-template"]
        API_MAGIC["/api/magic"]
        API_PROD["/api/products"]
        API_SVC["/api/services"]
        API_BIT["/api/bitrix"]
        API_TODAY["/api/todayscustomers"]
    end

    EB --> SM
    SM --> SCRIPT

    DRAFTS --> API_DRAFT
    DRAFTS --> RESTORE
    DRAFTS -->|"buildPayload()"| SCRIPT

    EXPORT --> API_DOCX
    EXPORT --> API_PDF
    EXPORT --> API_OFFER
    EXPORT -->|"buildPayload()"| SCRIPT

    EMAIL --> API_EMAIL
    EMAIL -->|"buildPayload()"| SCRIPT

    RESTORE -->|"restoreConfiguratorFromOffer()"| SCRIPT
    RESTORE --> EB

    HASSMANN --> API_MAGIC
    BADOLUX --> API_PROD
    ADMIN --> API_PROD
    ADMIN --> API_SVC
    INTEG --> API_BIT
    TODAYS --> API_TODAY

    DRAWING -.->|"canvas only"| SCRIPT
    SIGNATURE -.->|"canvas only"| SCRIPT
    THEME -.->|"localStorage"| SCRIPT
```

---

## 10. Offer Lifecycle (State Machine)

```mermaid
stateDiagram-v2
    [*] --> Home: App loads

    Home --> Configuring: Select offer type
    Configuring --> Configuring: Navigate steps<br/>Fill forms

    Configuring --> DraftSaved: Save draft
    DraftSaved --> Configuring: Continue editing
    DraftSaved --> Configuring: Load draft

    Configuring --> Priced: POST /api/price
    Priced --> Configuring: Edit fields

    Configuring --> Exported: Export DOCX/PDF
    Exported --> OfferSaved: Auto-save snapshot<br/>POST /api/offers

    Exported --> Emailed: Send email<br/>POST /api/email/send-offer
    Emailed --> BitrixLogged: Timeline comment

    Exported --> Mailed: Postal delivery<br/>POST /api/post/send

    OfferSaved --> Home: Start new offer
    Home --> Configuring: Restore from draft/offer

    state Configuring {
        [*] --> Kundendaten
        Kundendaten --> Arbeitszeit: BU only
        Arbeitszeit --> Duschwanne
        Duschwanne --> Wandverkleidung
        Wandverkleidung --> Duschabtrennung
        Duschabtrennung --> Optional
        Optional --> Rabatt

        Kundendaten --> BWT_Page: BWT
        Kundendaten --> HL_Page: HL
        Kundendaten --> BL_Page: BL
    }
```

---

## 11. Geocoding & Routing Flow

```mermaid
flowchart TD
    ADDR["Customer Address<br/>(street, postalCode, city)"]

    ADDR --> VARIANTS["Build address variants<br/>1. Full: street, PLZ city, Germany<br/>2. Street only: street, PLZ city<br/>3. PLZ + city only<br/>4. City only"]

    VARIANTS --> PHOTON{"Photon (Komoot)<br/>photon.komoot.io"}
    PHOTON -->|"Success + PLZ match"| COORDS["Coordinates (lat, lng)"]
    PHOTON -->|"Fail / no match"| ORS_GEO{"ORS Geocode<br/>(if API key)"}
    ORS_GEO -->|"Success"| COORDS
    ORS_GEO -->|"Fail"| NOMINATIM{"Nominatim (OSM)"}
    NOMINATIM -->|"Success"| COORDS
    NOMINATIM -->|"Fail"| ERROR["Geocoding failed"]

    COMPANY["Company Location<br/>(50.3135, 11.9128)"]

    COORDS --> ORS_ROUTE{"ORS Routing<br/>(if API key)"}
    COMPANY --> ORS_ROUTE
    ORS_ROUTE -->|"Success"| RESULT
    ORS_ROUTE -->|"Fail"| OSRM{"OSRM Fallback<br/>router.project-osrm.org"}
    COMPANY --> OSRM
    OSRM --> RESULT

    RESULT["Distance Result<br/>oneWayKm, roundTripKm<br/>oneWaySeconds, roundTripSeconds"]
```

---

## 12. Email Sending Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant S as Server
    participant SMTP as SMTP Server
    participant B as Bitrix24

    U->>S: POST /api/email/send-offer<br/>(multipart: to, subject, body,<br/>payload, attachments[])

    S->>S: Generate PDF from payload<br/>(docxtemplater + LibreOffice)

    S->>S: Collect preset attachments<br/>(Abtretung, Barrierefreies Wohnen,<br/>Vollmacht)

    S->>S: Merge user attachments<br/>(up to 10 files)

    S->>SMTP: Send email via Nodemailer<br/>(timeout: 8000ms)
    SMTP-->>S: messageId

    S->>S: Log to EmailLog collection

    opt dealId provided
        S->>B: POST crm.timeline.comment.add<br/>(comment + base64 attachments)
        B-->>S: comment ID
    end

    S-->>U: { ok, messageId,<br/>attachmentNames, bitrixComment }
```

---

## 13. BWT Pricing Special Rules

```mermaid
flowchart TD
    BWT_PAYLOAD["BWT Payload"]

    BWT_PAYLOAD --> DOORS["Door Materials<br/>1226 Standard<br/>1225 Budget<br/>1227 Wien<br/>1228 Wien Glas<br/>1320 Variodoor"]

    BWT_PAYLOAD --> GRABS["Grab Bars<br/>CLPESG 30/40/60/80"]

    BWT_PAYLOAD --> QA["Quick-Add Items<br/>Custom entries"]

    DOORS --> MARKUP_0{"Markup = 0%<br/>(forced for BWT)"}
    QA --> MARKUP_0

    GRABS --> MARKUP_GRAB{"Grab bar markup<br/>= configured %<br/>applied to lineTotal only"}

    MARKUP_0 --> NET["Nettobetrag"]
    MARKUP_GRAB --> NET

    BWT_PAYLOAD --> INCLUDED["Enthalt je Einheit<br/>(included per unit)"]

    INCLUDED --> INC_LINES["Lieferkosten<br/>Kleinmaterial<br/>Km-Pauschale<br/>Reisezeit<br/>Door variant breakdown"]

    BWT_PAYLOAD --> EXTRA["Extra Hours<br/>extraHoursTotal x 2 x laborRate"]
    EXTRA --> NET
```

---

## 14. Theme System

```mermaid
graph LR
    subgraph Themes["Available Themes"]
        BASE["base<br/>#6d28d9 purple"]
        WOHNEN["wohnen<br/>#75C19F green"]
        PFLEGE["pflege<br/>#AC84BC purple"]
        GESUND["gesundheit<br/>#00C6F6 blue"]
        KFZ["kfz<br/>#DFA029 gold"]
    end

    subgraph Defaults["Offer Type Defaults"]
        BU_D["bu -> wohnen"]
        BWT_D["bwt -> gesundheit"]
        HL_D["hl -> pflege"]
        AH_D["ah -> pflege"]
    end

    subgraph Modes["Color Modes"]
        LIGHT["Light Mode<br/>(default)"]
        DARK["Dark Mode<br/>data-mode=dark"]
    end

    subgraph Storage["Persistence"]
        LS1["localStorage<br/>emc2.theme"]
        LS2["localStorage<br/>emc2.mode"]
    end

    subgraph DOM["DOM Application"]
        HTML_ATTR["html[data-theme=X]<br/>html[data-mode=Y]"]
        CSS_VARS["CSS Variables<br/>--accent, --bg, --text<br/>--panel, --border, etc."]
    end

    Themes --> Storage
    Modes --> Storage
    Defaults --> Themes
    Storage --> HTML_ATTR --> CSS_VARS
```

---

## 15. Deployment Architecture

```mermaid
graph TD
    subgraph Fly["Fly.io (Frankfurt)"]
        subgraph Docker["Docker Container"]
            NODE["Node.js 23.11"]
            EXPRESS["Express.js 5.1"]
            LIBRE["LibreOffice 25.8"]
            LATEX["LaTeX (texlive)"]
            PUPPETEER["Puppeteer"]
        end
    end

    subgraph Cloud["Cloud Services"]
        MONGO[(MongoDB Atlas)]
        BITRIX_C[Bitrix24 CRM]
        ADOBE_C[Adobe PDF Services]
        N8N_C[n8n Webhooks]
    end

    subgraph Geo["Geocoding / Routing"]
        PHOTON_C[Photon API]
        ORS_C[OpenRouteService]
        OSRM_C[OSRM]
        NOM_C[Nominatim]
    end

    subgraph Clients["Clients"]
        BROWSER[Web Browser]
        IFRAME["Iframe Embeds<br/>gconlineplus.de<br/>bitrix24.de<br/>bau-formular.fly.dev"]
    end

    BROWSER -->|"HTTPS"| Fly
    IFRAME -->|"HTTPS + CSP"| Fly

    Docker --> MONGO
    Docker --> BITRIX_C
    Docker --> ADOBE_C
    Docker --> N8N_C
    Docker --> PHOTON_C
    Docker --> ORS_C
    Docker --> OSRM_C
    Docker --> NOM_C

    Docker -->|"SMTP"| SMTP_C[SMTP Server]
    Docker -->|"HTTPS"| BINECT_C[Binect Postal]
    Docker -->|"HTTPS"| HASS_C[Hassmann API]
    Docker -->|"SSE proxy"| PLAN_C[Planning API]
```

---

## 16. API Route Map

```mermaid
graph LR
    ROOT["/"]

    ROOT --> API["/api"]
    ROOT --> DOC_GEN["Document Gen"]

    API --> HEALTH["/health"]
    API --> PRODUCTS["/products<br/>GET list | GET :id<br/>POST bulk | GET sla"]
    API --> SERVICES["/services<br/>GET list | GET :id<br/>POST bulk"]
    API --> PRICE["/price<br/>POST compute"]
    API --> OFFERS_R["/offers<br/>GET list | GET :num<br/>POST upsert<br/>GET search-all<br/>GET external/*"]
    API --> DRAFTS_R["/drafts<br/>POST create<br/>GET search<br/>GET :id"]
    API --> CUSTOMERS["/customers<br/>POST upsert<br/>GET search<br/>GET :id"]
    API --> EMAIL_R["/email<br/>POST send-offer<br/>GET smtp-test"]
    API --> BITRIX_R["/bitrix<br/>GET contact/:id<br/>POST timeline/comment<br/>GET kundendaten"]
    API --> ROUTING["/routing<br/>POST suggest-distance<br/>GET health"]
    API --> TRAYS["/trays<br/>GET suggest"]
    API --> BATHTUBS["/bathtubs<br/>GET suggest<br/>GET screens/suggest<br/>GET recommend-screen"]
    API --> MAGIC["/magic<br/>GET health<br/>GET products<br/>POST search"]
    API --> PLANNING["/planning<br/>GET current<br/>GET stream (SSE)"]
    API --> POST_R["/post<br/>POST send"]
    API --> ADOBE_R["/adobe-pdf<br/>POST docx | pdf<br/>POST document-merge<br/>POST batch<br/>GET status"]
    API --> LATEX["/latex-template<br/>POST generate"]

    DOC_GEN --> PDF["/pdf<br/>POST generate"]
    DOC_GEN --> PDF_TPL["/pdf-template<br/>POST generate"]
    DOC_GEN --> DOCX["/docx-template<br/>POST generate"]
    DOC_GEN --> ARB["/arbeitsbericht<br/>POST generate"]
    DOC_GEN --> KALK["/kalkulation<br/>POST generate"]
    DOC_GEN --> MAT["/material-overview<br/>POST generate"]
```

---

## 17. Data Flow: Offer Creation to Email

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (SPA)
    participant SM as StateManager
    participant API as Express Server
    participant DB as MongoDB
    participant PRICE as pricing.js
    participant DOCX as docxtemplater
    participant LO as LibreOffice
    participant MAIL as Nodemailer
    participant CRM as Bitrix24

    User->>FE: Select offer type (bu)
    FE->>SM: applyWizardState({offerType: 'bu'})

    loop Each wizard step
        User->>FE: Fill form fields
        FE->>SM: setField(formKey, field, value)
        SM->>SM: Persist to sessionStorage
    end

    User->>FE: Click pricing update
    FE->>FE: buildPayload()
    FE->>API: POST /api/price
    API->>PRICE: computePrices(payload)
    PRICE->>DB: Product.find({productId: {$in: [...]}})
    DB-->>PRICE: Product documents
    PRICE-->>API: Pricing result
    API-->>FE: { materials, services, total, ... }
    FE->>SM: Store pricing

    User->>FE: Click Export DOCX
    FE->>FE: buildPayload() + sanitize labels
    FE->>API: POST /docx-template
    API->>PRICE: computePrices(payload)
    API->>DOCX: Merge template + data
    DOCX-->>API: DOCX buffer
    API->>LO: Convert DOCX -> PDF
    LO-->>API: PDF buffer
    API-->>FE: PDF file download

    FE->>API: POST /api/offers (save snapshot)
    API->>DB: Offer.findOneAndUpdate()

    User->>FE: Click Send Email
    FE->>API: POST /api/email/send-offer
    API->>DOCX: Generate PDF attachment
    API->>MAIL: Send email + attachments
    MAIL-->>API: messageId
    API->>DB: EmailLog.create()
    API->>CRM: POST timeline comment
    API-->>FE: { ok, messageId }
```

---

## 18. View Class Hierarchy

```mermaid
classDiagram
    class ViewBase {
        +container: HTMLElement
        +_listeners: Array
        +_subscriptions: Array
        +render(data)
        +addListener(el, event, handler)
        +subscribe(event, handler)
        +$(selector) HTMLElement
        +$$(selector) NodeList
        +show()
        +hide()
        +destroy()
    }

    class FormViewBase {
        +_fields: Map
        +_validationRules: Map
        +registerFormField(name, selector)
        +registerAllFields(container)
        +getFieldValue(element)
        +setFieldValue(name, value)
        +getFormData() Object
        +setFormData(data)
        +setupStateSync()
        +validate() Object
        +displayErrors(errors)
        +clearErrors()
    }

    class KundendatenView {
        +render()
        +loadBitrixContact(id)
        +suggestDistance()
        +updateBudgetPanel()
    }

    ViewBase <|-- FormViewBase
    FormViewBase <|-- KundendatenView

    class EventBus {
        -_events: Map
        +on(event, handler, ctx)
        +off(event, handler)
        +emit(event, data)
        +once(event, handler, ctx)
        +clear()
        +setDebugMode(bool)
    }

    class StateManager {
        -_state: Object
        -_eventBus: EventBus
        +setField(formKey, field, value)
        +getField(formKey, field)
        +setFormData(formKey, data)
        +getFormData(formKey)
        +getAllFormData()
        +resetForms()
        +restore()
        +persist()
        +toJSON()
        +fromJSON(data)
    }

    FormViewBase ..> EventBus : subscribes
    FormViewBase ..> StateManager : syncs state
    StateManager --> EventBus : emits events
```
