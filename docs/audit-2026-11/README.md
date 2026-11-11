# Full audit of the OC (main@815288c0 + PR #330) — 2026-11-11

Five read-only code reviews (Fable 5.2), one per area. Critical claims were spot-checked in code by the lead session.
Nothing was executed against production. Timings are not iPad measurements unless stated.
Background on the 10 Nov data loss and load-time measurements: branch `claude/ipad-offline-report-9dac53`, `docs/research/2026-11-ipad-offline.md`.

| File | Area | Findings | critical / high / medium / low |
|---|---|---|---|
| [1-create-save.md](1-create-save.md) | Create and save an offer | 24 | 1 / 6 / 10 / 7 |
| [2-send.md](2-send.md) | Send to customer, post, Bitrix | 30 | 3 / 8 / 15 / 4 |
| [3-signing.md](3-signing.md) | Signing on site and by link | 30 | 2 / 8 / 12 / 8 |
| [4-frontend.md](4-frontend.md) | Frontend speed and maintainability | 23 | 3 / 9 / 8 / 3 |
| [5-server.md](5-server.md) | Server, data, operations | 35 | 1 / 16 / 12 / 6 |
| **Total** | | **142** | **10 / 47 / 57 / 28** |

## The four root problems

| # | Root problem | Shows up as | Findings |
|---|---|---|---|
| 1 | **"Sent", "locked" and the price are not recorded facts.** Any save sets `locked: true`; the offer number is minted on the device; the price is recomputed or pinned depending on the path. | Customer can sign new positions at the old total; PDF total differs from the screen; offer shown as sent after a mere download; different numbers in PDF and database | create F01 F02 F06 F08 F13 · send S-02 S-03 · signing S-04 |
| 2 | **Multi-step actions run in one request with no record of each step.** Send and sign do e-mail, PDF, Bitrix and stage move in sequence; the result is saved last or best-effort. | Mail sent but nothing recorded (60 s client abort); signature lost when a later step fails; duplicate mails on retry; Bitrix failure invisible | send S-01 S-05 S-12 · signing S-01 S-06 S-09 · server S13 |
| 3 | **Three renderers for one offer** (DOCX, signing HTML, hand-edited DOCX). | The customer signs a document that differs from the one mailed; signed PDF is rebuilt later from current code | signing S-02 S-03 S-05 · send S-04 |
| 4 | **Everything runs for everything, all the time.** No pricing scheduler, all 32 pages and 7 offer types initialised, loops and listeners that never stop. | ~200 price calls per customer; slower the longer it is used; 395 MB decoded images; 3–10 DB round trips per price call | frontend F-01…F-12 · server S08–S11 |

## Order of work

| Step | Where | Content |
|---|---|---|
| 0 | owner | Merge PR #311 (login bypass + secrets out of code, open since 4 Nov), rotate the Bitrix webhook and the DB password; merge PR #330 (data loss) |
| 1 | `main`, small PRs | Quick fixes that need no design decision (list in the PR "Audit quick fixes 1") |
| 2 | v2 | One offer record with server-issued number, real sent state and frozen price + stored PDF (root 1 + 3); send/sign as recorded steps with retry (root 2); local-first autosave |
| 3 | v2 / main | Build step, image pipeline, pricing scheduler, offer-type registry and lazy init (root 4) |
