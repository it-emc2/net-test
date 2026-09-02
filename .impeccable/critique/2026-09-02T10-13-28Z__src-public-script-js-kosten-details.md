---
target: Kosten-Details tab (BU Konfigurator)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-09-02T10-13-28Z
slug: src-public-script-js-kosten-details
---
Method: dual-agent (A: a5fe738cc294d839e · B: af46042a45ae6a50c)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No "last recomputed at HH:MM"; button only disables, no progress text |
| 2 | Match Between System and Real World | 3 | Correct German business vocabulary (Nettobetrag, Aufschlag, MwSt.) |
| 3 | User Control and Freedom | 2 | No undo on recompute; unclear if it should run on a "gesperrt" (locked) offer |
| 4 | Consistency and Standards | 2 | `.kosten-recompute-btn` clones `.sw-save-btn`'s exact green — two different-risk actions, one look |
| 5 | Error Prevention | 3 | Explicitly states "Angebotspreise bleiben unverändert" before any commit |
| 6 | Recognition Rather Than Recall | 2 | Drift note and its resolving button sit ~340px apart across two card sections |
| 7 | Flexibility and Efficiency | 1 | No shortcut/anchor linking drift → recompute for daily repeat users |
| 8 | Aesthetic and Minimalist Design | 3 | Flat, low-chrome, dense — appropriate for an ops tool |
| 9 | Error Recovery | 2 | Failure path is a raw `alert()`, no inline guidance |
| 10 | Help and Documentation | 3 | The "ℹ" Berechnungsregel panel genuinely documents the formula |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**LLM assessment**: The core ladder — roman-numeral badges (I/II/III) mirroring the sidebar groups, "ohne Aufschlag" exemption tags, the Aufschlag line naming its own base amount — is genuinely built for this product's pricing model, not generic admin furniture. The two most recent additions break that pattern: the "Preis neu berechnen" button is an unlabeled green pill indistinguishable from the app's everyday "Schnellspeichern" button, and the drift warning is a plain red paragraph with no link back to the one action that resolves it. Both read as bolted on rather than designed for this specific Vigor-drift scenario.

**Deterministic scan**: The CLI detector ran in **degraded mode** (`htmlparser2`/`css-select`/`css-tree`/`domutils` unavailable in this environment → regex fallback; an environment gap, not a codebase issue). It found 4 findings total, none inside the Kosten-Details render region itself: a `side-tab` border-color flag and a `dark-glow` box-shadow flag elsewhere in `index.html`, plus two `broken-image` flags that are very likely false positives — both are named debug/preview `<img>` placeholders (`hlSketchDebugImage` and one unlabeled) almost certainly populated by JS at runtime, not shipped broken. `script.js` itself produced zero findings — the detector doesn't parse the HTML-in-JS template strings that actually build this tab, so it materially undercounts here.

**Visual overlays**: This version of the skill has no browser-injection/overlay mode (`detect.mjs --help` confirms three modes: static scan, regex scan, Puppeteer URL scan — no served/injectable script). No `[Human]`-tab overlay is available; the findings below instead come from manual screenshots, computed-style extraction, and DOM inspection.

## Overall Impression

The page is honest and information-dense in a way that suits an internal ops tool — nothing here is decorative filler. But the newest layer (recompute button, drift warning) was dropped into the existing structure without its own visual language, and two independent, measured defects — a real mobile layout break and text that fails WCAG AA contrast — went unnoticed because nothing in the current workflow checks for them. The single biggest opportunity: treat the drift warning and the recompute button as one unit, not two unrelated paragraphs 340px apart.

## What's Working

- **Roman-numeral badges** (`side-num`) tie every Kosten card back to the sidebar's I/II/III groups — real wayfinding, not decoration.
- **The Summen ladder names its own base** ("Aufschlag (55,31% auf 3.680,49 €)") — auditable rather than opaque, which matters when staff have to defend a total to a customer.
- **"ohne Aufschlag" inline tags** remove the need to cross-reference a separate exemption list while scanning line items.

## Priority Issues

Two independent passes surfaced 8 distinct, non-overlapping issues (more than the usual 3-5) — grouping by what actually blocks or measurably breaks the page first.

- **[P1] Mobile layout overflows by 100px.** *Measured*: at 375px width, `.app`'s `scrollWidth` (475px) exceeds `clientWidth` (375px) — the item table and header controls clip off the right edge. **Why it matters**: any staff member checking a quote on a phone/tablet in the field can't read prices or reach the header. **Fix**: make the Kosten table horizontally scrollable within its own container (`overflow-x: auto`) rather than letting the page itself overflow. **Command**: `/impeccable adapt`

- **[P1] Text fails WCAG AA contrast.** *Measured*: `.kosten-recompute-btn` white-on-`#3B8A68` ≈ 4.2:1; the drift warning's `#ef4444`-on-white ≈ 3.8:1 — both under the 4.5:1 AA threshold for normal-size text. **Why it matters**: the drift warning is the single most consequential line on the page (it's telling staff their quoted material price is now wrong), and it's also the hardest to read. **Fix**: darken both toward `#c0392b`/a deeper green, or bump weight/size. **Command**: `/impeccable harden`

- **[P1] Drift warning has no adjacent resolution path.** The warning renders under the Material card; the button that resolves it sits under Optionale Produkte, ~340px and two card headings away. **Why it matters**: this is a genuine "anxiety without resolution" moment — a confirmed cognitive-load failure (working memory: user must hold the warning in mind across two sections) and the same gap Sam (accessibility persona) and Riley (stress-tester) would both trip on. **Fix**: put a small inline "→ Preis neu berechnen" affordance inside the drift note itself, or move the drift line to sit directly above the button. **Command**: `/impeccable layout`

- **[P1] Recompute button has no visible focus state.** *Measured*: native `<button>`, reachable via Tab, but computed `outline: none` with only an 8%-opacity sub-pixel box-shadow — effectively invisible. **Why it matters**: keyboard-only staff (Sam) can't tell the button is focused before pressing Enter, next to an action that hits a live external price source. **Fix**: restore a visible `:focus-visible` outline. **Command**: `/impeccable harden`

- **[P2] Button color collides with a different-risk action.** `.kosten-recompute-btn` reuses `.sw-save-btn`'s exact green. **Why it matters**: staff pattern-match by color; conflating "reprice against live supplier data" with "save draft" risks an accidental click on the wrong green button. **Fix**: give recompute its own accent (or an icon), reserve this green for persistence actions only. **Command**: `/impeccable colorize`

- **[P2] Recompute row is a structural orphan.** Unlike every other block on this tab, it has no `.kosten-section` wrapper, heading, or numeral — it floats between two footers on 4px/12px margins alone. **Fix**: fold it into the Summen card as a footer action, or give it a light card treatment consistent with the rest of the page. **Command**: `/impeccable layout`

- **[P2] Feedback channels are mixed.** Missing-offer-number and recompute-failure both go through a raw `alert()`, while success goes through `showToast`. **Why it matters**: inconsistent feedback is its own heuristic failure (#1, #9) and `alert()` blocks the thread and looks like a browser crash dialog inside an otherwise polished app. **Fix**: route all three outcomes through the toast pattern. **Command**: `/impeccable clarify`

- **[P3] Duplicate red drift signals.** A per-line drift note and the aggregate footer drift both fire for the same event; with several drifted lines this stacks repeated red text with no single collapsible summary. **Command**: `/impeccable distill`

## Persona Red Flags

**Sam (Accessibility-Dependent User)**: The drift warning conveys its urgency by color alone at ~3.8:1 contrast — a double violation (color-only signaling *and* under AA). The recompute button's invisible focus ring means Sam can Tab to it and have no on-screen confirmation before pressing Enter on an action that calls a live external price source. Both are measured, not hypothetical (see Priority Issues above).

**Riley (Deliberate Stress Tester)**: Riley would recompute, refresh, and reopen the same draft — and previously (before the frozen-snapshot fix earlier in this session) would have found the price *silently reverting* to the stale one, a "feature that appears to work but produces wrong results" red flag. That specific path is now fixed, but Riley would still find the drift warning disappearing entirely after one recompute with no record that a drift was ever caught and resolved — worth deciding if that's intended (audit trail) or acceptable (drift is transient by design).

## Minor Observations

- Optional card footer says "Summe:" while sibling cards say "Summe Material:" / "Summe Leistungen:" — inconsistent footer naming.
- The "ℹ Berechnungsregel" info panel is built entirely from inline styles, diverging from the class-based styling of the rest of the page.
- An empty Optional section still renders a "Summe: 0,00 €" footer under "Keine Positionen" — mildly redundant.
- The demo draft's drift warning is no longer visible as of this audit — recompute (tested earlier in this session) correctly adopted the live price and cleared the gap it was warning about. That's expected behavior, not a defect; a fresh drift would need a new artificially-low quoted price to demo again.

## Questions to Consider

- If the drift warning and the recompute button are meant to work as a pair, why do they currently live in two unrelated cards instead of one unit?
- Should a full-page reprice really fail via a browser `alert()`, or does this deserve the same toast treatment as a successful recompute?
- Given staff may check quotes from a phone on-site, should the whole Kosten-Details table get a mobile-first pass, or just enough to stop the 100px overflow?
