# UX changes vs. the current app (owner sign-off required)

Everything not listed here must behave exactly like today (ADR 004). Each entry: what changes, why, status.

| # | Change in v2 | Reason | Source | Status |
|---|---|---|---|---|
| U-001 | HMS (Hausmeister) and WD (Winterdienst) offer types removed — no tiles, pages or pricing | Unpriced copies of AH pages, never used in production | ADR 011 | ✅ accepted 2026-11-04 |
| U-002 | One draft per deal with automatic saving and a version history ("Version wiederherstellen"); "Schnellspeichern" and "Speichern unter" removed; no more cryptic draft names | Today every click creates a new draft; confusing for non-technical users | ADR 007 | ✅ accepted 2026-11-04 (model); screen design to be shown before release |
| U-004 | Re-opened AH offers keep their saved travel zone; AH drafts in the older format open with their services instead of 0 € | Two legacy bugs (FINDINGS-AH.md) | ADR 014 | ✅ accepted 2026-11-04 |
| U-003 | Deals open by URL `/deal/<id>`; the step is part of the URL; reload/back never loses work | Today `/`, `#home` or the main menu reset everything; no deep link to a deal | ADR 006 | ✅ requirement |

Proposed next (not yet approved — will be shown as screens first): larger controls/text, one "Öffnen" search instead of four, hiding developer/legacy export buttons, German-only wording with "Sie", clear dialogs instead of browser pop-ups.
