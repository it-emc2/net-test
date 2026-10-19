# Release test checklist (Konfigurator)

Run before every merge to `main` that touches `index.html`, `script.js`,
`EmailManager.js` or any offer type. Use a **local** server (port 3001) — note
that PDF/DOCX export auto-saves the offer (`POST /api/offers`) into the DB the
server is connected to.

## 1. Cross-offer-type state (most common regression)

The app is one page for all types; fields of other types are only hidden
(`data-offer` → `display:none`), not removed. State from type A leaks into B.

| # | Step | Expected |
|---|------|----------|
| 1.1 | Open **BU** → Hauptmenü → load an **AH** offer → PDF | PDF generates, no "Pflichtfelder" toast |
| 1.2 | Same for BU → HMS, BU → WD, BWT → AH, HL → BL | same |
| 1.3 | Open **AH** → load a **BU** offer → PDF | Vermieter-Genehmigung required again (if empty) |
| 1.4 | In the browser console after 1.1: `[...document.querySelectorAll('#form-Kundendaten :invalid')].filter(e=>!e.closest('[data-offer][style*="display: none"]'))` | `[]` |
| 1.5 | Fresh start (no previous type) for each of BU, BWT, HL, BL, AH, HMS, WD → fill Kundendaten → PDF | works |

## 2. Validation messages

| # | Step | Expected |
|---|------|----------|
| 2.1 | Leave a required Kundendaten field empty → PDF | Toast **names the field(s)**, page jumps to Kundendaten, field is red |
| 2.2 | Every field named in a toast is visible on screen | never a name the user can't see |
| 2.3 | New `required` field added? | It sits inside the right `data-offer` container, has a `<label for>` or `aria-label` |

## 3. Documents per offer type

| Doc | BU | BWT | HL | BL | AH | HMS | WD |
|-----|----|-----|----|----|----|-----|----|
| Angebot DOCX/PDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kalkulation PDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hassmann-Warenkorb CSV (card + Bitrix timeline) | ✓ | ✓ | ✓ | ✓ | – | – | – |

Check: Zusammenfassung → Dokumentenstudio shows only the ✓ cards; "Angebots-PDF
an Bitrix senden" status log lists only the ✓ documents (send to a **test deal**).

## 4. Saved / sent offers

| # | Step | Expected |
|---|------|----------|
| 4.1 | Load a sent (locked) offer of every type | All fields restored, banner "Versendet" |
| 4.2 | "Neue Version erstellen" | New number, prices live again |

## 5. Before go-live

- Service worker: hard-reload once (`sw.js` caches `script.js`), confirm new code runs.
- Console: no errors on load and while switching offer types.
- Delete any test offers created in prod DB during testing.
