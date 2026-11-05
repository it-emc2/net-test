# Backend — legacy bugs found during the port

Reproduced in v2 for parity unless noted; a fix changes behaviour → owner decision.

| # | Bug | Effect | Evidence | Where |
|---|---|---|---|---|
| B-1 | `Kundendaten.customerNumber` is stored as `""` when missing, but the collection has a **unique sparse** index (sparse skips only *missing* fields) | Once one customer without number exists, **every further customer without number fails with HTTP 500**. Production already has exactly 1 such document; newest customer saved 2026-05-26 | contract test "LEGACY BUG kept: a 2nd customer without customer number fails"; replica index list | `src/routes/customers.js` normalizeCustomerPayload; v2 `routes/group3.ts` |
| B-2 | Customer search queries `emc2_contact`, `cp_name`, `kassenkundeName`, but the strict schema never stores them | Search on those fields never finds anything | code reading | same |

**B-1: fixed in v2 (owner OK 2026-11-05, ADR 016)** — missing number stored as absent; migration 002 cleans the one existing `""` at cut-over. The current app on `main` still has the bug.
