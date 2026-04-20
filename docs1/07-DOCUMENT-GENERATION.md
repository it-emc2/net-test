# Document Generation System

## Overview

The application generates professional documents in multiple formats:
- **DOCX** (Word) - Primary customer-facing format
- **PDF** - Converted from DOCX or generated directly
- **LaTeX** - Alternative PDF generation pipeline

## Document Types

| Document | Route | Template | Purpose |
|----------|-------|----------|---------|
| Customer Offer (Angebot) | `POST /docx-template` | `Angebot.docx`, `Angebot-BWT.docx`, `Angebot-HL.docx`, `Angebot-BL.docx` | Customer-facing quotation |
| Work Report (Arbeitsbericht) | `POST /arbeitsbericht` | `Arbeitsbericht.docx` | Completed work documentation |
| Cost Calculation (Kalkulation) | `POST /kalkulation` | `Kalkulation.docx` | Internal cost breakdown |
| Material Overview | `POST /material-overview` | Generated via PDFKit | Aggregated material list |
| PDF from DOCX | `POST /pdf-template` | Any DOCX template | DOCX -> PDF conversion |
| LaTeX Document | `POST /api/latex-template` | `.tex` template | LaTeX -> PDF compilation |

## Template System

### DOCX Templates (`src/templates/`)

Templates use **docxtemplater** with PizZip for DOCX manipulation. Template variables are enclosed in `{curly_braces}`.

#### Template Selection Logic

```javascript
// In docx-template.js route
const templateMap = {
  bu:  'Angebot.docx',      // Badumbau (bathroom renovation)
  bwt: 'Angebot-BWT.docx',  // Badewannentuer (bathtub door)
  hl:  'Angebot-HL.docx',   // Haltegriffe (grab bars)
  bl:  'Angebot-BL.docx'    // Badelift (bath lift)
};

const template = templateMap[payload.activeOffer] || 'Angebot.docx';
```

### Offer Mapping (`src/logic/offerMapping.js`)

Converts the raw pricing output into DOCX template variables:

```javascript
const docxData = mapOfferToDocxData(body, computed);
```

**Key Output Variables**:

| Variable | Example | Description |
|----------|---------|-------------|
| `{Anrede}` | "Herr" | Salutation |
| `{Vorname}` | "Max" | First name |
| `{Nachname}` | "Mustermann" | Last name |
| `{Strasse}` | "Musterstr. 1" | Street |
| `{PLZ}` | "12345" | Postal code |
| `{Stadt}` | "Musterstadt" | City |
| `{Datum}` | "20.04.2026" | Date (DD.MM.YYYY) |
| `{Angebotsnummer}` | "ANG2026-0420-143022" | Offer number |
| `{Nettobetrag}` | "4.025,00" | Net amount |
| `{MwSt}` | "764,75" | VAT amount |
| `{Gesamtsumme}` | "4.789,75" | Grand total |
| `{Selbstkostenanteil}` | "609,75" | Customer copay |
| `{Zuschuss}` | "4.180,00" | Subsidy amount |
| `{materials}` | Array | Material line items |
| `{services}` | Array | Service line items |
| `{included}` | Array | Included items (BWT) |

### Material Label Sanitization

The `ExportManager.js` sanitizes material descriptions for customer-facing documents:

```javascript
// Known overrides
const overrides = {
  'TRWDB': 'Wannenabdichtband-Set',
  'KM02': 'Kleinmaterial',
  'AGD9060': 'Ablaufgarnitur',
  'PLA5282': 'Stelzlager',
  // ... more
};

// Rules applied:
// 1. Remove text in brackets: "[CODE123]" -> ""
// 2. Remove DIN references: "DIN 18040" -> ""
// 3. Shorten to first meaningful phrase
// 4. Apply known overrides by productId
```

### Word Blocklist (Backend)

The DOCX template route enforces a **content blocklist** that removes sensitive/unwanted words:

```javascript
const blocklist = ['TRINNITY', 'Plattenlager', 'fuer Terrassenplatten', 'Ramsauer'];
// Case-insensitive regex replacement on all string values in template data
```

## PDF Generation Pipelines

### Pipeline 1: DOCX -> LibreOffice -> PDF

```
1. Generate DOCX from template (docxtemplater)
2. Write DOCX to temp file
3. Convert via LibreOffice CLI:
   soffice --headless --convert-to pdf --outdir /tmp /tmp/offer.docx
4. Read resulting PDF
5. Stream to client
```

**Requires**: LibreOffice installed (included in Docker image)

### Pipeline 2: Direct PDFKit

```
1. Build PDF document programmatically using PDFKit
2. Add text, tables, images
3. Stream to client
```

Used for: Material overview, basic offers

### Pipeline 3: Adobe PDF Services

```
1. Upload DOCX/template to Adobe API
2. Merge JSON data via Adobe Document Generation
3. Optionally convert to PDF
4. Download result
```

**Requires**: `PDF_SERVICES_CLIENT_ID` and `PDF_SERVICES_CLIENT_SECRET`

Endpoints:
- `POST /api/adobe-pdf/docx` - DOCX generation
- `POST /api/adobe-pdf/pdf` - PDF generation
- `POST /api/adobe-pdf/document-merge` - Template merge
- `POST /api/adobe-pdf/batch` - DOCX + PDF in one call

### Pipeline 4: LaTeX -> PDF

```
1. Render LaTeX template with variables
2. Compile via pdflatex
3. Stream resulting PDF
```

**Requires**: texlive packages (included in Docker image)

## Work Report (Arbeitsbericht) Generation

### ID Generation
```
Format: ARB-XXXXXX (e.g., ARB-000142)
Storage: data/arb-seq.json (sequential counter)
Collision retry: Up to 3 attempts with incremented counter
```

### Content
- Customer info (name, address)
- Work performed (task descriptions)
- Materials used (from pricing)
- Labor hours and costs
- Signature placeholder
- Date and location

## Cost Calculation (Kalkulation) Generation

### ID Generation
```
Format: CALC-XXXX (e.g., CALC-0042)
Storage: DB-backed counter with collision retry
```

### Content
- Internal cost breakdown
- Material costs with markup
- Labor costs
- Overhead
- Profit margin

## Material Overview Generation

### Content
- Aggregated material list from pricing
- Quantities and unit prices
- Special items (e.g., Silikon-Duschabzieher gift item)
- Total material cost

## Email Attachments

When sending an offer via email (`POST /api/email/send-offer`):

1. **Auto-generated PDF**: Offer document generated on-the-fly
2. **Preset attachments** (unless excluded):
   - `Abtretungserklaerung.pdf` - Assignment declaration
   - `emc2_Barrierefreies_Wohnen.pdf` - Barrier-free living brochure
   - `Vollmacht.pdf` - Power of attorney form
3. **User-uploaded attachments**: Up to 10 additional files

## Postal Delivery (Binect)

For physical mail delivery via `POST /api/post/send`:

1. Upload document to Binect API
2. Add cover page (optional)
3. Upload and link static attachments
4. Submit for printing and delivery
5. Track via document ID

## Signature Embedding

Internal staff signatures are embedded in generated documents:
- Signature images stored in `src/templates/` or `src/public/assets/`
- Mapped by user/staff ID to signature file
- Embedded as image in DOCX template via docxtemplater image module

## Docker Dependencies

The Docker image includes all necessary tools for document generation:

```dockerfile
# LibreOffice for DOCX -> PDF conversion
RUN apt-get install -y libreoffice-25.8.4

# LaTeX for .tex -> PDF compilation
RUN apt-get install -y texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-lang-german

# Fonts for proper German text rendering
RUN apt-get install -y fonts-dejavu fonts-liberation
```
