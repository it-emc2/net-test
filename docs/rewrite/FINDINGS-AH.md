# AH pricing — legacy bugs found during extraction (2026-11-04)

Found by restoring 143 real AH offers/drafts (local replica, anonymised) in the legacy UI and comparing with the extracted TS function. v2 reproduces them **for parity**; fixing them is an owner decision (each fix changes prices of existing offers on reload).

| # | Bug | Effect | Affected (sample of 63 offers + 80 newest drafts) | Where |
|---|---|---|---|---|
| 1 | On reload, an offer **without a saved travel time** loses its saved travel zone (`Arbeitszeit.ahTravelZone` is not restored) | Reloaded offer is priced **without travel time / Anfahrt** → lower price than when it was created | 1 offer, 2 drafts | `script.js` getAHZoneData / restore path; v2 `ahInputFromPayload` |
| 2 | Older AH format (schedules nested inside task objects) cannot be read by the service cards | Reloaded draft shows an **empty service, 0 €** | 1 draft | `restoreAhServices` card build; v2 `ahInputFromPayload` |

Also noted (not bugs, but rules to know):
- Missing payer restores as **Kassenkunde** (radio default).
- No `Finanzierung` block → Entlastungsbetrag is **not** applied, even though the empty form has the box ticked.
- AH rates (7.96 €/Anfahrt, 40.56 €/h HnD, 53.04 €/h AB, 1.20 € Servicepauschale) are hard-coded in the browser — not admin-configurable, unlike the other offer types.

**Proposed fixes for v2 (need OK):** #1 fall back to the saved zone; #2 read the nested format. Both = golden-master rebuild + UX-CHANGES entry.
