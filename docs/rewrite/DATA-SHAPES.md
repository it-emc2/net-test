# Data shapes — summary (replica of 2026-11-04)

Full generated report (key paths, types, presence %, first/last quarter, no values): `DATA-SHAPES.generated.md` — regenerate with `node scripts/replica/infer-shapes.mjs > docs/rewrite/DATA-SHAPES.generated.md`.

## Volumes by type × quarter
| Collection | Types present | Notes |
|---|---|---|
| `offers` (1,222) | bu 872 · bwt 233 · ah 63 · hl 13 · bl 4 · **no type 37** (2025-Q4) | **No hms/wd offers ever** |
| `drafts` (2,578) | bu 2,137 · bwt 234 · ah 143 · hl 47 · bl 17 | No hms/wd |
| `offers.pricing` | 148 early offers (2025-Q4) have **no type key in pricing** | treat as legacy |
| `signingrequests.payloadSnapshot` (311) | bu 234 · bwt 47 · ah 25 · bl 2 · hl 2 · ∅ 1 | |
| `Kundendaten` (35) | – | small, mostly 2025-Q4/2026-Q1 |

## Rules the TS types must respect
| Finding | Consequence |
|---|---|
| One wizard object holds **all sections** (`ah`, `bwt`, `hl`, `hms`, `wd`, … present at 76–99 % even in BU offers) | Section presence ≠ offer type; type comes from `activeOffer` → `currentOfferKey` → `offerType` → default `bu` |
| Most scalars are strings: `string(num)`, `string(bool)` ("on"/"ja"), `string(empty)` | Zod with coercion; never strict numbers/booleans on read |
| Dynamic keys `optional.qty_<id>`, `opt_<id>`, `qty_alias_<id>__pair_<wc>`, `wcalias_*` | `z.record` with key patterns |
| Fields appear over time (e.g. `auftragId` 2026-Q2+, `Finanzierung` 2026-Q2+, `pricingRules` 2026-Q2+, `docSelection` 2026-Q2+, `wvEnabled` 2026-Q2+, `offerOverrides` 2026-Q4) | All optional; absence must keep old behaviour (pricing-core has read-time fallbacks) |
| Fields disappear (e.g. `wandverkleidung.consumables` last 2026-Q1, `frozen`/`frozenPricing`/`locked` inside payload 2026-Q2–Q3 only) | Keep readable, never required |
| Arrays sometimes stored as string (`wvPanels[]: array, string`, `optGrab[]: array, string`) | Accept both |
| Sketch/signature data URLs inside payload | Large; never needed for pricing |

## HMS / WD
- Pages exist in the UI but reuse **AH field names/ids** (`ahEinsatzUmfang`, `ahMonatUmfang`, … duplicated ids in `index.html` ~10387–10736).
- **No pricing logic** exists for them (server returns an empty shell, no client function), and **no HMS/WD offer or draft exists in production**.
- Rewrite: keep the pages (UI parity) but flag as "unpriced" → owner decision whether to drop or properly implement (`DECISIONS.md` 011).
