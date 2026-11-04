# Frontend Inventory (UI parity checklist) — baseline `main@4b6002a` (2026-11-04)

SP = `src/public/script.js` (30.6k LOC), IX = `src/public/index.html` (11.2k LOC). Page order source of truth: `OFFERS` in SP:221-292 (`src/config/offers.js` is stale/unused). State lives **in the DOM**; StateManager/EventBus/Views in `src/` are not loaded. `docs1/05-FRONTEND-ARCHITECTURE.md` is stale.

## 1. Offer types → steps
| Type | Steps |
|---|---|
| bu Badumbau | Kundendaten, Arbeitszeit, Arbeiten, Duschwanne, Fussboden, Wandverkleidung, Duschabtrennung (Hassmann), DuschabtrennungNeu, Duschvorhang, Optional, Rabatt, Kosten, Angebotscheck, Zusammenfassung ("Angebotsversand"), Checkliste (+ admin, services, crm-emc2) |
| bwt Badewannentür | Kundendaten, Arbeitszeit, bwtArbeiten, bwt, Rabatt, Kosten, Zusammenfassung |
| hl Handlauf | Kundendaten, Arbeitszeit, hlArbeiten, hlk (Flexofit wizard), hl, Rabatt, Kosten, Zusammenfassung |
| bl Badelift | Kundendaten, Arbeitszeit, bl, Kosten, Zusammenfassung |
| ah Alltagshilfe | Kundendaten, Arbeitszeit, ah, Finanzierung, Kosten, Zusammenfassung |
| hms Hausmeister / wd Winterdienst | Kundendaten, Arbeitszeit, hms\|wd, Kosten, Zusammenfassung — **not in v2 (ADR 011)** |

Navigation: sidebar with progress dots (`updateSidebarForOffer` SP:2929), grouped I/II/III for bu/bwt/hl; Next/Back with per-page validation (SP:~6545).

## 2. Pages → inputs (IX line)
| Page | Inputs |
|---|---|
| Kundendaten (2855) | draft load (current type), customer search; Bitrix contact ID, date, salutation, name, phone, email, address/state/PLZ, alt. site, new/existing; Ansprechpartner; payer SZ/KK (+ birth date, insurance no., Kasse, Pflegegrad since, invoice copy); budget/subsidy panel (markup 35–60 %, 4,180 / 8,360 €, Pflegegrad 1–5); 2nd person; Kasse/application flags; living situation, landlord approval, access, floor, parking, notes; AH-only care questions. Visibility per `data-offer` |
| Arbeitszeit (3766) | routing suggestion, zones 1–5, km, nights, work time ±5/±15, travel time, 2nd fitter rate, BWT allowance toggle (AH: km + travel only) |
| Arbeiten / bwtArbeiten / hlArbeiten | conversion type (5 options), work list, "+ Weitere Stelle", auto works (`arbeitenAuto.js`) |
| Duschwanne (4386) | floor-level toggle, Low-Budget (Badolux, sessionStorage `dw_budget_mode`), W×L tray suggestions, free item, colour, accessories ± |
| Fussboden (4599) | m², covering, row calculator, V5FB02, Badolux floor, panels, sealing, WV-3.0 colour |
| Wandverkleidung (4959) | type, sketch, notes, panel sizes+colour, decor, config no., Badolux panels, sealing/adhesive/silicone/profiles/corners |
| Duschabtrennung (5850) | Hassmann accordion, gconlineplus iframe, sketch, best-finder (`/api/magic/search`) |
| DuschabtrennungNeu (5683) | Vigour/Badolux configurator cards (`configurator/boot.js`) |
| Duschvorhang (5836) | catalog (`/api/vorhang/products`) |
| Optional (6526) | large checkbox+qty catalog; shower mounting type mandatory |
| Rabatt (7908) | markup, discount, material discount |
| Kosten (8956) | cost details toggle; AH/HMS/WD priced client-side (`computeAHGesamt` SP:12433) |
| Angebotscheck (8299, bu) | rule check traffic-light, click jumps to page |
| Checkliste (8915, bu) | offer (auto), measurement sketch/photos (manual) |
| bwt (9072) | tub shape, material, door type (5) ×qty, colour, dimensions, hinge, grab bars 30–80, sketch |
| hl / hlk | Flexofit catalog, free lines, freight, Flexofit offer PDF import (`/api/hl/parse-flexofit-offer`) |
| bl (8036) | main product, accessories, free lines, notes, sketch |
| ah (10250) / Finanzierung (10315) | service cards (HnD / Alltagsbegleitung), time rows (duration, rhythm, weekdays, time); Verhinderungspflege, Kombileistung, KV, monthly amount |
| hms / wd | service type, h/visit, h/month, rhythm, flat fee, notes, sketch |
| Sketch pads | pen, eraser, line, ruler, colour, width, undo, clear |

## 3. Global features
| Feature | Entry | Backend |
|---|---|---|
| Login/logout, header user | login.js, header-auth.js | /api/auth/* |
| Header: sidebar toggle, theme (5) + light/dark, connection dot, reload, update banner | IX:2603, ThemeManager, OfflineSaveQueue:397, SP:652 | /api/version |
| Main menu: Ansprechpartner select, admin, 7 offer tiles | IX:2674, SP:6675 → `startOfferFlow` SP:3232 | /api/users |
| Load offer by ANG no. → read-only "Versendet" | SP:17186, SP:14651, SentOfferBar.js | GET /api/offers/:nr |
| Load Bitrix deal → choose type or open existing | SP:6787 | /api/bitrix/deal/:id, /api/offers/by-deal/:id |
| Quick search drafts+offers | SP:14773 | /api/offers/search-all |
| Draft load (type-scoped, max 10, incl. local) | DraftsManager:857 | /api/drafts/search, /:id |
| Draft save: Quick save / Save as (modal, duplicate hints) | DraftsManager:550 | POST /api/drafts |
| Summary widget (customer, deal, total, self-pay, stale-price badge + recompute) | IX:11089 | recompute endpoints |
| Live price (offline fallback) | `updatePricing`, pricing-client.js | /api/price, /api/price/inputs |
| Price freeze / New version | IX:8576, SentOfferBar:136 → SP:14731 | POST /api/drafts (`freshNumberIfSent`) |
| Offer overrides (wording, price adjust, notes) | OfferOverrides.js | payload |
| Document studio (~25 variants) | IX:8356 | docx-template, material-overview, arbeitsbericht, kalkulation, adobe, pdf-preview |
| Enclosures (Abtretung, Vollmacht §40, flyer) | IX:8550, SP:29621 | – |
| Email tab (to/cc/subject/body preview, edited DOCX upload, attachments, product image PDF, magicplan paste; send / Bitrix-only; confirm + silent quick-save) | IX:8619, EmailManager.js | /api/email/*, bitrix move/log/timeline |
| Post tab (address, PDFs, password unlock w/o deal) | IX:8749, SP:29714 | /api/post/*, /api/auth/confirm-password |
| On-site signing (iPad) + status | SP:23782, SP:30522 | /api/signing* |
| Public sign page (doc paging, checkboxes, signature, 2nd signer, copy signature, thanks) | signpage/ | /api/signing/:token/* |
| Ansprechpartner signature (admin) | SignaturePadManager | /admin/api/users/:email/signature |
| Today's planning (search, route, open, call, done / not-done dialog) | SP:29271 | /api/planning/*, bitrix move-zuteilen/besichtigung, /api/bitrix/kundendaten |
| Sales week calendar, today's activities | SP:28240, SP:27624 | /api/calendar/today, /api/bitrix/activities/today |
| Quick save moves deal to "Zuteilen" if appointment today | DraftsManager:357 | move-zuteilen |
| Bitrix upload, lead IDs | SP:9850, SP:27028 | bitrix upload/contact |
| Admin panel (iframe /admin/: general, travel, BU, times, BWT, HL, AH, subsidies, signing links, Bitrix errors, activity log, users) | admin-modal.js | /admin/api/* |
| In-app admin: products/services editor, pricing playground, crm-emc2 | AdminManager.js, IX:10750 | products/services bulk, offers?pflegekasseEmc2Antrag |
| Dev tools visible in summary (legacy PDF, LaTeX, JSON, health, sample data, payload) | IX:8842 | – |

## 4. Drafts / versions / URLs today (precise)
- `POST /api/drafts` **always inserts**; no PUT/DELETE. Unique `{offerType,name}` → 409; same `clientSaveId` → 200 (idempotent replay).
- Name: `ANG-{TYPE}-{First}-{Last}-{DDMMYYYY}-{HHMMSS}` → **every quick save creates a new draft**; every email send silently saves one more.
- Draft has **no `dealId` field**; deal link via `payload.auftragId` + variants (routes/offers.js:90-101).
- Offer number `ANG{YYYY}-{MMDD}-{HHMMSS}` re-stamped on **every export click** (SP:2428, ExportManager:257); hidden field.
- `POST /api/offers` upsert by offerNumber, sets `locked:true`; triggered by export, email/Adobe, on-site signing. Locked → read-only "Versendet".
- New version = draft save; server swaps locked number for fresh one (`-1…` on collision), date = today.
- URL: hash = step id (`#Kundendaten`), valid only with sessionStorage `konfigurator_state_v1`; `/` or `#home` **resets all forms**. Only deep link: `?offer=<ANG>` (removed via replaceState). **No `?deal=`.**

## 5. Offline
| Area | Behaviour |
|---|---|
| Shell | sw.js caches shell + images, never API responses; build-ID keyed |
| Save | IndexedDB queue `nt-offline-save-queue` for drafts+offers; replay on online/load; draft 409 → rename `-offline-<id6>`; offer 409 → drop with notice |
| Local drafts | LocalDocsStore `local:` ids searchable |
| Session recovery | `buildPayload` snapshot (1.2 s debounce); banner restore/discard |
| Pricing | browser `pricing-core.js` + cached `/api/price/inputs`, result `_local:true`, never frozen |
| Offline-capable | tray suggestion, WV budget panels, planning cache |
| Auth offline | name from `nt_header_user`; 401 on save → recovery + /login |
| Not offline | documents, email, post, signing, CRM writes, routing, admin, bathtub/optional/vorhang catalogs; 10 MB vigor model only opportunistically cached |

## 6. UX pain points (elderly, non-technical users)
1. 378 buttons; ~25 export variants + dev tools visible in summary.
2. Four different ways to load (ANG no., deal ID, quick search, type-scoped draft load).
3. Save creates a new cryptically named draft on every click; no overwrite/delete; 409 on same name.
4. "Neue Version" means both app update and offer version; "Preis eingefroren" unexplained.
5. Data-loss traps: `/`, `#home`, main menu reset everything.
6. Tiny controls: 9 px status dot, ±5 min buttons, 🗑/× icons, 22 places ≤12 px text.
7. Mixed English/German, placeholders ("Hello …"), Du/Sie mix.
8. Three shower-enclosure pages + accordion — redundant.
9. Optional page: huge checkbox list labelled with article numbers.
10. Very long Kundendaten page with many conditional blocks.
11. 40× `alert()`, 7× `confirm/prompt`.
12. HMS/WD show copied AH texts.
13. Offer number hidden and changes per export.
14. Post without deal asks password without explanation.
15. Technical toast texts ("Prüfen Sie /api/offers/search-all").
