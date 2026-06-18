# Domain Glossary - German Business Terms

This project is a German-language application for bathroom renovation and accessibility equipment. This glossary maps German domain terms to their English meanings and explains their role in the system.

## Offer Types

| German | English | Code | Description |
|--------|---------|------|-------------|
| Badumbau | Bathroom Renovation | `bu` | Complete bathroom conversion for accessibility (7 wizard steps) |
| Badewannentuer (BWT) | Bathtub Door | `bwt` | Retrofit a door into an existing bathtub wall |
| Haltegriffe | Grab Bars | `hl` | Install support handles for accessibility |
| Lifter / Badelift | Bath Lift | `bl` | Powered lift for bathtub entry/exit |
| Alltagshilfen | Everyday Aids | `ah` | Everyday care services (Alltagsbegleitung + Haushaltsnahe Dienstleistungen). Client-side pricing, zone-based travel time. |

## Product Categories

| German | English | Context |
|--------|---------|---------|
| Duschwanne | Shower Tray | The flat basin replacing a bathtub for barrier-free entry |
| Wandverkleidung | Wall Cladding | Moisture-resistant wall panels replacing tiles |
| Duschabtrennung | Shower Enclosure | Glass/plastic partition around shower area |
| Haltegriff | Grab Bar | Wall-mounted support handle (CLPESG30/40/60/80 = 30-80cm) |
| Einstiegshilfe | Entry Aid | Assistance device for getting into bathtub/shower |
| Wannenaufsatz | Bathtub Surround | Protective screen mounted on bathtub edge |
| Fußboden | Floor / Flooring | Floor material (vinyl panels, tiles) |
| Kleinmaterial | Small Materials | Kit of fasteners, sealants, screws (product KM02) |
| Ablaufgarnitur | Drain Set | Shower drain assembly (product AGD9060) |
| Wannenabdichtband | Tub Sealing Tape | Waterproofing tape for tub/tray junction (product TRWDB) |
| Stelzlager / Plattenlager | Floor Support / Pedestal | Height-adjustable floor supports (product PLA5282) |
| Silikon | Silicone | Silicone sealant for waterproofing joints |
| Armatur | Faucet/Fixture | Plumbing fixtures (taps, showerheads) |

## BWT Door Variants

| German | English | Product Code |
|--------|---------|-------------|
| Standard Tuer | Standard Door | 1226 |
| Budget Tuer (Verona) | Budget Door | 1225 |
| Individual Tuer Wien | Custom Wien Door | 1227 |
| Individual Tuer Wien Glas | Custom Wien Glass Door | 1228 |
| Variodoor | Variable Door | 1320 |
| Anschlag | Hinge Side | Links (left) / Rechts (right) |

## Customer & Payment Terms

| German | English | Context |
|--------|---------|---------|
| Kundendaten | Customer Data | Contact info, address, insurance details |
| Kassenkunde (KK) | Insurance Customer | Patient covered by statutory health insurance (Pflegekasse) |
| Selbstzahler (SZ) | Self-Pay Customer | Customer paying out of pocket |
| Pflegegrad | Care Level | German care dependency grade (1-5) |
| Pflegekasse | Care Insurance Fund | Statutory long-term care insurance provider |
| Zuschuss | Subsidy / Grant | Insurance contribution toward renovation costs |
| Zuzahlung | Copayment | Customer's out-of-pocket share |
| Wohnumfeld | Home Environment | Prior home modification subsidies received |
| Selbstkostenanteil | Self-Pay Amount | Amount customer must pay after insurance subsidy |
| Abtretungserklarung | Assignment Declaration | Legal document assigning insurance payment to contractor |
| Vollmacht | Power of Attorney | Legal authorization document |
| Barrierefreies Wohnen | Barrier-Free Living | Brochure about accessible home modifications |
| Anrede | Salutation | Herr (Mr.) / Frau (Mrs.) |
| Vorname | First Name | |
| Nachname | Last Name | |
| Straße | Street | |
| Postleitzahl (PLZ) | Postal Code | 5-digit German postal code |
| Angebotsnummer | Offer Number | Unique quote identifier (ANG-...) |

## Work & Pricing Terms

| German | English | Context |
|--------|---------|---------|
| Arbeitszeit | Work Hours/Time | Labor hours for the job |
| Reisezeit | Travel Time | Time spent traveling to customer |
| Arbeitstage | Work Days | Number of on-site days |
| Reisetage | Travel Days | Number of travel days |
| Fahrzeugbereitstellung | Vehicle Readiness | Daily vehicle charge (80 EUR) |
| Werkzeuge/Maschinen | Tools/Machines | Daily tool charge (7.50 EUR) |
| Beraumung | Clearance/Cleanup | Daily cleanup charge (4.50 EUR) |
| Kilometerpauschale | Mileage Allowance | Per-km travel charge (0.35 EUR/km) |
| Aufschlag | Markup/Surcharge | Percentage markup on materials (default 35%) |
| Rabatt | Discount | Percentage discount on materials |
| Nettobetrag | Net Amount | Total before VAT |
| Mehrwertsteuer (MwSt) | VAT | Value Added Tax (19% in Germany) |
| Gesamtsumme | Grand Total | Final amount including VAT |
| Kalkulation | Calculation | Internal cost breakdown document |
| Handwerker | Craftsman | Worker performing the installation (always x2) |

## Document Types

| German | English | Context |
|--------|---------|---------|
| Angebot | Offer/Quote | Customer-facing quotation document |
| Arbeitsbericht | Work Report | Document of completed work |
| Materialubersicht | Material Overview | List of all materials for a job |
| Entwurf / Draft | Draft | Unsaved work-in-progress offer |

## Work Tasks (Duschwanne)

| Key | German | English |
|-----|--------|---------|
| `remove_tub` | Ausbau der vorhandenen Badewanne | Removal of existing bathtub |
| `install_tray` | Einbau der neuen Duschwanne | Installation of new shower tray |
| `relocate_faucet` | Umsetzen der Armatur | Relocation of faucet |
| `wall_repair` | Wandreparatur | Wall repair |
| `install_panels` | Montage der Wandverkleidung | Wall panel installation |
| `install_enclosure` | Montage der Duschabtrennung | Shower enclosure installation |
| `flooring` | Bodenarbeiten | Floor work |
| `sealing` | Abdichtungsarbeiten | Waterproofing work |
| `plumbing` | Sanitararbeiten | Plumbing work |

## Wall Cladding Descriptions

| German | English |
|--------|---------|
| Fehlstellen schließen | Fill gaps/voids |
| Deckenhoch | Ceiling height |
| Teilhoch | Partial height |

## UI Elements

| German | English | Context |
|--------|---------|---------|
| Farbe | Color | Material color selection |
| Breite | Width | Dimension in cm |
| Hohe | Height | Dimension in cm |
| Lange | Length | Dimension in cm |
| Tiefe | Depth | Dimension in cm |
| Menge / Anzahl | Quantity | Number of units |
| Stuck (Stk) | Piece(s) | Unit of measurement |
| Laufende Meter (lfm) | Linear meters | For pipe pricing |
| Ebenerdig | Floor-level / Barrier-free | Zero-step shower entry |
| Bereich | Area / Domain | Offer category |
| Zusammenfassung | Summary | Final review page |
| Kosten | Costs | Cost overview page |
| Speichern | Save | Save button |
| Laden | Load | Load button |
| Exportieren | Export | Export button |
| Vorschau | Preview | Preview button |
| Drucken | Print | Print button |
| Senden | Send | Send button |

## External Systems

| Term | System | Purpose |
|------|--------|---------|
| Bitrix | Bitrix24 CRM | Customer relationship management |
| Hassmann | External API | Shower enclosure product catalog |
| Binect | Postal Service | Physical mail delivery API |
| Flexofit | Product Line | Flexible fitting products |
| Badolux | Product Line | Budget-friendly floor/tray products |
| REHA | Rehabilitation | Healthcare/rehabilitation products (special VAT handling) |
| GC Online Plus | GC Online Plus | Parent platform for iframe embedding |
| n8n | Workflow Tool | Automation for today's customers webhook |
| OpenRouteService (ORS) | Routing API | Distance/direction calculation |
| Photon | Geocoding | Address-to-coordinates (Komoot) |
| Nominatim | Geocoding | OpenStreetMap geocoding (fallback) |
| OSRM | Routing | Open Source Routing Machine (fallback) |

## AH (Alltagshilfe) Specific Terms

| Term | English / Explanation |
|------|-----------------------|
| Alltagsbegleitung | Companionship / daily escort services (doctor visits, walks, grocery shopping together) |
| Haushaltsnahedienstleistungen (HnD) | Household assistance services (cleaning, laundry, cooking, errands) |
| Zone | Travel time bucket (Zone 1=10 min, Zone 2=15 min, Zone 3=20 min…) determined by routing, 5-min ceiling steps |
| Reisezeit | One-way travel time to customer. Doubled (H&R = Hin & Rückfahrt) for billing in HnD hours |
| Anfahrtspauschale | Flat travel fee per visit (7.96 € for AH), covers vehicle costs for round trip |
| Stundensatz HnD | Hourly rate for Haushaltsnahedienstleistungen (40.56 €/h) |
| Servicepauschale Reinigungsutensilien | Monthly cleaning utensils flat fee (1.20 €/Monat), added to total for Selbstzahler only, shown as separate note for Kassenkunde |
| Regelmäßigkeit | Visit frequency (Wöchentlich=weekly, 14-tägig=bi-weekly, Monatlich=monthly, etc.) |
| FREQ_PER_MONTH | Monthly occurrence multiplier (Wöchentlich=52/12≈4.33, 14-tägig=26/12≈2.17, etc.) |
| Monatlicher Stundenumfang | Total billed hours per month = (Dauer + 2×Reisezeit) × FREQ_PER_MONTH |
| Zeitzeile | A single schedule row within one Leistung card (supports multiple per card) |
| Einsatz | One visit/appointment at the customer's home |
