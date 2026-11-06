# UX changes vs. the current app (owner sign-off required)

Everything not listed here must behave exactly like today (ADR 004). Each entry: what changes, why, status.

| # | Change in v2 | Reason | Source | Status |
|---|---|---|---|---|
| U-001 | HMS (Hausmeister) and WD (Winterdienst) offer types removed — no tiles, pages or pricing | Unpriced copies of AH pages, never used in production | ADR 011 | ✅ accepted 2026-11-04 |
| U-002 | One draft per deal with automatic saving and a version history ("Version wiederherstellen") — 6c done 2026-11-06; removal of the old save buttons pending (quick save also moves the deal to "Zuteilen"); "Schnellspeichern" and "Speichern unter" removed; no more cryptic draft names | Today every click creates a new draft; confusing for non-technical users | ADR 007 | ✅ accepted 2026-11-04 (model); screen design to be shown before release |
| U-004 | Re-opened AH offers keep their saved travel zone; AH drafts in the older format open with their services instead of 0 € | Two legacy bugs (FINDINGS-AH.md) | ADR 014 | ✅ accepted 2026-11-04 |
| U-003 | Deals open by URL `/deal/<id>` (6b done 2026-11-06: link → "Deal laden" flow; address keeps `?deal=` + step); the step is part of the URL; reload/back never loses work | Today `/`, `#home` or the main menu reset everything; no deep link to a deal | ADR 006 | ✅ requirement |
| U-005 | Catalog editor (products/services, prices) only visible and usable for admins | Prices affect every offer; today any logged-in user can change them | ADR 018 | ✅ accepted 2026-11-05 |
| U-006 | Export buttons "Adobe DOCX/PDF/beides", "LaTeX-PDF" and "PDF (Vorlage)" removed; offer PDF and Word stay | Duplicate export paths; Adobe sends data to an external service; the template PDF never worked | ADR 020 | ✅ accepted 2026-11-06 |
| P7-1 | One „Öffnen“ field instead of „Angebot laden“, „Bitrix Deal-ID“ and the quick search (detects deal number / ANG number / text) | Users must pick the right of three fields today | `docs/rewrite/ux-proposals.html` | ✅ accepted 2026-11-06 |
| P7-2 | Min. 16 px text, 48 px buttons, plain German words, „Sie“ throughout | Small controls (12–13 px, ~30 px buttons) on tablets | same | ✅ accepted 2026-11-06 |
| P7-3 | Dokumentenstudio: only everyday documents; Adobe card gone (ADR 020); developer tools only for admins; Kalkulation keeps all four variants (no pick made) | Technical buttons visible to everyone | same | ✅ accepted 2026-11-06 |
| P7-4 | 55 browser pop-ups (46 alert, 9 confirm) → in-page dialogs/notices with buttons that say what happens; technical texts go to the error log | Pop-ups block the page, some texts are technical | same | ✅ accepted 2026-11-06 |
| P7-5 | Remove „Schnellspeichern“/„Speichern unter“ (autosave since 6c); Bitrix stage „Zuteilen“ via A) button „An Planung übergeben“ (recommended) or B) automatically on the first save | Duplicate saving; quick save's stage move needs a new home | same | ✅ accepted 2026-11-06 — option A |

Proposed next (not yet approved — will be shown as screens first): larger controls/text, one "Öffnen" search instead of four, hiding developer/legacy export buttons, German-only wording with "Sie", clear dialogs instead of browser pop-ups.
