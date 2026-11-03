# 3D-Ansicht — handover (status 2026-11-03)

Branch `claude/3d-bad-visualisierung` (based on `claude/bu-konfigurator-ui-redesign-af5abf`, not on main).
Research and decisions: `docs/research-3d-bad-visualisierung.md`.

## Idea in one paragraph
After "Optionale Produkte" the customer sees their **own bathroom from the magicplan scan** with the
**products from the offer**. Everything comes from measured data (walls, height, doors, windows with
sill height, existing objects) and catalogue dimensions — no AI image generation, nothing guessed.
magicplan only holds the bathroom **as it is**; the after-state comes from the offer, and the user can
correct the position (drag / rotate / hide objects).

## Files
| File | What |
|---|---|
| `src/logic/room-plan.js` | pure: magicplan plan XML → room model; `showerSpots()` finds bathtub/shower and which sides touch a wall (Nische / Ecke / one wall) |
| `src/routes/room3d.js` | `GET /api/room3d/:dealId` — finds the plan by deal ID (`external_reference_id` or name `"<deal>-Name"`), geometry only, 10-min cache. Needs `MAGICPLAN_KEY` + `MAGICPLAN_CUSTOMER_ID` in `.env` |
| `src/public/raum3d/raum3d.js` | `createViewer(root, { products, onChange })` — three.js scene (from unpkg, CSP allows it): walls with openings, objects, rimless sloped tray, glass on open sides, wall cladding with cut-outs for windows/doors, drag/snap/rotate, show/hide objects, views (oben / Dusche / Tür), `snapshot(view)`, `getState()` |
| `src/public/raum3d/raum3d-test.js` + `src/public/raum3d.html` | stand-alone test page: `/raum3d.html?deal=66784` |
| `src/public/raum3d/raum3d-page.js` | BU step "3D-Ansicht": loads the plan for `#auftragId` when the page opens; tray size from `#traySize` (or tray_w/l inputs); decor from Wandverkleidung (winwall panel photo / VIGOUR colour tile); `window.__raum3dPage` = { getState, restore, reset, snapshot } |
| `src/public/index.html` | section `#page-Raum3D` (after `#page-Optional`) + scoped styles |
| `src/public/script.js` | step `"Raum3D"` in the BU page list after `"Optional"`, label "3D-Ansicht"; `payload.raum3d` in `buildPayload`; reset in `resetAllForms` |
| `src/public/RestoreManager.js` | restores `payload.raum3d` (applied when the page opens; a re-scanned plan starts fresh) |
| `src/logic/pricing-core.js` | `computeFingerprint` ignores `raum3d` (display only — never reprices) |
| `tests/unit/room-plan.test.js` | 5 tests (synthetic plan, no customer data) |

## Verified
- Parser vs magicplan's own room sizes: 44 of 45 rooms identical (43 real plans, 2026-11-02).
- Bathtub/shower found in all plans that have one (Ecke 34, Nische 9, one wall 13); none → notice.
- Test page on iPad landscape: drag stops at walls (glass can't pass through), cladding leaves windows open, overlap notice.

## NOT verified yet (last step before the session ended — browser login had expired)
The BU step itself (`#page-Raum3D`) has **not been clicked through in the browser**:
1. open a BU offer with an Auftrag ID (e.g. 66784, 66554) → "3D-Ansicht" → plan loads automatically?
2. tray size + decor taken from the offer?
3. move the tray → Schnellspeichern → reopen the draft → same position?
4. iPad 834×1194 and 1194×834, light/dark.
Unit tests: room-plan 5/5, winwall, vorhang-plan, angebotscheck pass; sidebarGroups updated for the new step
(its HL case fails since before this branch).

## Next (stage 1, agreed)
- Glass / door type from Duschabtrennung (neu) (`window.__daConfigurator.getState()`), notice when its
  Einbausituation differs from the scan (`spot.situation`).
- Grab bars, shower curtain from the offer.
- PDF: 3 images via `__raum3dPage.snapshot("vorn" | "tuer" | "oben")` into the offer folder, with the note
  "Visualisierung auf Basis des Aufmaßes; Farben/Oberflächen können abweichen; verbindlich ist das Angebot".
- Without a plan: simple room from width × depth × height.
- Before go-live: bundle three.js locally instead of unpkg (offline iOS shell).
Later (stage 2): Blender renders on the office iMac (pull queue, no open ports), real decor scans.

## Rules agreed with the user
- Reliable over pretty: dimensions only from scan + catalogue; ambiguous → notice, never guess.
- Tray is a "Duschwanne ohne Rand" (flat, sloped to the drain), not a box with a centre drain.
- No PR / no merge to main without the user's go. DB writes: user runs scripts himself.

## Related open todos (other topics)
winwall: minimum markup (parked), team questions 8–11, Bitrix field "Material-Kürzel" (`BITRIX_FIELD_MATERIAL_CODES`),
NW order numbers; e-mail drafts to magicplan / VIGOUR / winwall (in the chat, German, signed with Kürzel).
