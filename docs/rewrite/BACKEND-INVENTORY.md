# Backend Inventory (parity checklist) — baseline `main@4b6002a` (2026-11-04)

Paths relative to `src/`. Source: code reading; `docs1/03-API-REFERENCE.md` and `08-INTEGRATIONS.md` are **stale** (see end).

## Auth legend (`middleware/authGate.js`, global from `app.js:269`)
| Code | Meaning |
|---|---|
| P | Public: asset regex (`.js .css .png .pdf …` on ANY path), `/pdfjs /vendor /signpage /assets /configurator/ /login /api/auth* /api/health /health /api/version /api/da-config/model/*` (`/logic/*` explicitly NOT public) |
| T | Public token surface: `/sign/*`, `/api/signing/*` except prefix `/api/signing/status` |
| K | `X-API-Key` or `?apiKey` = `EXTERNAL_API_KEY` for `/api/offers/external*`, `/api/arbeitsbericht/external*` — **fail-open if unset** |
| G | `/admin*` passed by gate, guards itself |
| A | `requireAdmin`: session + `users.role=admin` |
| S | HMAC session token (Bearer or cookie `net_session`, 7 d, sliding refresh). No token: HTML GET → 302 `/login`, else 401 |

W = writes DB · Bx = Bitrix24 REST · LO = soffice · PP = Puppeteer

## Endpoints
### app.js inline
| M | Path | Auth | Purpose | DB |
|---|---|---|---|---|
| GET | /api/health, /health, /api/version | P | health / buildId | – |
| POST | /api/products/bulk :338, /api/services/bulk :374 | S (no admin check!) | upsert catalog | W Products/Services |
| GET | /api/services[/:id], /api/products[/:id], /api/products/sla | S | catalog (`?q` unescaped regex) | R |
| GET | /api/vigor-prices :512 | S | net-price map / `?full=1` | R vigor.products |
| POST | /api/price :560 | S | `computePrices` stateless | R |
| GET | /logic/pricing-core.js, /logic/tray-search-core.js | S | source for offline pricing | – |
| GET | /api/price/inputs :604 | S | buildId + config + all products (offline snapshot) | R |
| POST | /api/submissions :630 | S | legacy price+save | W Submissions |
| GET | /sign/:token :322 | T | signing HTML | – |
| * | /api/* → 404 JSON; GET /* → SPA index.html | | | |

### Routers
| Router | Endpoints (method path :line) | Auth | DB writes | External |
|---|---|---|---|---|
| auth | POST /api/auth/login :26, /confirm-password :63, /logout :81; GET /me :87 | P | users.lastLoginAt | – |
| users | GET /api/users :14 | S | – | – |
| offers | GET /search-all :168, /by-deal/:dealId :249, /:offerNumber :453, / :581; POST /:n/recompute :476 (≈always 409), POST / :513 (upsert, server pricing, `locked:true`, fingerprint) | S | offers | – |
| offers external | GET /external/search :293, /external/drafts/:id :372, /external/offers/:n :407 | K | – | – |
| drafts | POST / :78 (unique offerType+name, idempotent `clientSaveId`, new ANG no. if number belongs to locked offer, server re-resolves Ansprechpartner, pricing); POST /recompute :42; GET /search :188, /:id :225 | S | drafts | – |
| customers | POST / :94 (upsert by customerNumber or name/company/email); GET /search, /:id | S | Kundendaten | – |
| bitrix | GET /contact/:id, /contact/:id/deals, /deal/:id, /activities/today, /calendar/week; POST /timeline/comment, /deal/:id/upload/:type (kasse/vermieter UF fields), /deal/:id/move-ang-verschickt (C38:UC_2ZDNEZ / AH C52:UC_SNAVG8), /move-zuteilen (C72:PREPARATION), /move-besichtigung (C72:UC_MXCAGT + planner notify), /log-action, /deal/:id/log-dialog-event | S | useractionlogs; every Bx error → bitrixlogs | Bx (4× retry 700 ms) |
| bitrix helpers | `setDealOfferLink` (UF_CRM_1790772236055 = `OFFER_LINK_BASE/?offer=`), `ensurePartnerContact`, `updateDealAfterSigning` (C38:UC_ON3GS1 / C52:UC_7NLTX7), `retryBitrixLog` | | | Bx |
| todayscustomers (mounted `/api`) | GET /api/bitrix/kundendaten :580 (stage C72:UC_YOESDE), POST /api/calendar/today :594 | S | – | Bx (5× retry, conc. 3) |
| signing | POST /api/signing :457 (create/reuse; 409 needsConfirm); GET /status/:n :530 (**returns tokens**), /status/:n/signed :562 | S | signingrequests | SMTP, PP |
| signing token | GET /:token :606 (sets openedAt + Bx comment), /:token/documents/:key/html, /pdf; POST /:token/documents/:key :695 (submit; on completion: mail customer BCC `SIGNING_OFFICE_EMAIL`, Bx timeline+PDFs, partner filing, stage move). Expiry 56 d, lazy `expired` | T | signingrequests | SMTP, Bx, PP, LO |
| email | GET /smtp-test; POST /product-image-list, /preview-product-image-pdf, /send-offer :480 (lock per deal 24 h → always creates SigningRequest unless bitrixOnly → LO PDF → SMTP → IMAP sent-append → logs → Bx offer link + timeline) | S | emailsends, signingrequests, emaillogs, useractionlogs | SMTP, IMAP, Bx, PP, LO |
| post | POST /send :370 (onlinebrief24 printjobs, lock 24 h/2 min), GET /config, /balance | S | postalsends | OB24, Bx |
| docx-template | POST /docx-template :2515, /material-overview :2582, /pdf :2672 | S | – | LO |
| material-overview | POST / :220, /pdf :239, /hassmann-cart :257 (CSV), /online-orders :329 | S | – | LO |
| kalkulation | POST /preview :726, /debug :921, /docx :976, /pdf :1016, /pdf-v2 :1058 | S | calc_ids (every render) | LO / PP |
| arbeitsbericht (mounted twice: `/api/arbeitsbericht` + `/arbeitsbericht`) | POST /docx :321, /pdf :356, /external/pdf :373 | S / K | arb_ids | LO |
| other docs | POST /api/docx/pdf-preview, /pdf (pdfkit), /pdf-template (**always 500**), /latex-template/pdf; /api/adobe-pdf/{status GET, docx, pdf, document-merge, batch} | S | – | LO, pdflatex, Adobe |
| catalog | GET /api/trays/suggest, /api/vorhang/products (writes images to disk), /api/bathtubs/catalog, /api/da-config/model/:supplier (P); POST /api/hl/parse-flexofit-offer | S | – | vigor |
| proxies | /api/magic/{health,products,search}; /api/routing/suggest-distance (Photon→ORS→Nominatim, ORS→OSRM); /api/planning/current, /stream (SSE) | S | – | Magic API, geo, Planning API |
| admin | POST /admin/api/login (public, admin role); GET /admin/api/config/public (**effectively public**); config GET/PUT/reset; signing list (lazy-expire updateMany), send-bitrix, pdf; bitrix-logs + retry; user-action-logs; users list/upsert/signature | G/A | appconfigs, users, signingrequests, bitrixlogs | Bx |

## Collections (`KonfiguratorDB`)
| Model | Collection | Indexes | Written by |
|---|---|---|---|
| Product | Products | productId unique | products/bulk, seed scripts |
| Service | Services | serviceId unique | services/bulk |
| Submission | Submissions | – | /api/submissions |
| Customer | Kundendaten | customerNumber unique sparse + 9 | POST /api/customers |
| Offer | offers | offerNumber unique, offerType | POST /api/offers, recompute |
| Draft | drafts | (offerType,name) unique, offerNumber | POST /api/drafts, recompute |
| SigningRequest | signingrequests | token unique, offerNumber, status | signing, send-offer, admin |
| User | users | email unique | login, admin |
| AppConfig | appconfigs | key unique | admin config |
| BitrixLog | bitrixlogs | TTL 30 d | Bx errors |
| UserActionLog | useractionlogs | TTL 180 d | boot, bitrix, email |
| EmailLog / EmailSend | emaillogs / emailsends | – / dealId unique | send-offer |
| PostalSend | postalsends | dealId unique | post/send |
| CalcId / ArbId (inline) | calc_ids / arb_ids | id unique | every Kalkulation / Arbeitsbericht render |
| (raw) vigor | products, models | – | read-only (external scraper writes) |

Collections in prod **without a model in code**: `ProductsHassman` (70k docs), `PriceHistory`, `ProductHistory`, `TodaysCustomers`, `customers`, `optionalcategories`, `net_*` (5) — likely written by other tools/scripts or legacy. Must be kept, not dropped.

## Startup / implicit writes
- Boot: INSERT `useractionlogs` `server_started`; Mongoose autoIndex creates all indexes incl. TTL; `configService` 60 s refresh timer; `execSync git rev-parse` for buildId; soffice warm-up spawn on import.
- No cron/queues/workers. No boot seeding.
- Implicit writes: GET /api/signing/:token, expired-token flips, admin signing list, Bx errors, calc_ids/arb_ids per render, send-offer (4 collections), vorhang images to disk.

## Env vars actually read
PORT, NODE_ENV, FLY_IMAGE_REF · MONGODB_URI, MONGODB_DB, VIGOR_MONGODB_URI · AUTH_SECRET (fallback ADMIN_SECRET → ADMIN_PASSWORD → `"insecure-fallback"`), EXTERNAL_API_KEY · AP_DEFAULT_EMAIL · BITRIX_WEBHOOK_BASE, OFFER_LINK_BASE · SMTP_HOST/PORT/SECURE/USER/EMAIL/PASS/REPLY_TO · IMAP_HOST/PORT/PASS/SENT_FOLDER · PUBLIC_BASE_URL, SIGNING_OFFICE_EMAIL · OB24_BASE_URL/API_KEY/API_SECRET/MODE · ORS_API_KEY, COMPANY_ADDRESS/LAT/LNG · PLANNING_API_BASE_URL/KEY · EXTERNAL_API_BASE/USER/PASSWORD · PDF_SERVICES_CLIENT_ID/SECRET · PUPPETEER_EXECUTABLE_PATH, DEBUG_KALK

## Dead code
`src/server.js` (CJS in ESM package, contains hard-coded Mongo creds), `services/bitrixClient.js`, `services/todaysCustomersService.js`, `configService.seed()`, frontend modules living in `src/` (`controllers/ views/ events/ models/StateManager.js services/ApiService.js`), `/pdf-template` (broken), LaTeX route (template `Angebot-BWT.tex` missing).

## Doc drift
`docs1/03`: claims "no auth" (false), wrong admin login, lists non-existent bathtub/screen endpoints, wrong methods/paths for adobe status, latex, arbeitsbericht, kalkulation; omits auth, users, signing, vorhang, da-config, hl, vigor-prices, drafts/offers recompute, post, bitrix deal/*, admin. `docs1/08`: names dead `bitrixClient.js`, wrong defaults (EXTERNAL_API_BASE, SMTP_PORT), omits Vigor DB, IMAP, Puppeteer, LibreOffice, pdflatex.
