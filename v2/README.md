# OC v2 — TypeScript rewrite

Independent npm workspace inside the repo. The current app (repo root) is untouched; `v2/` is excluded from its Docker image (`.dockerignore`). Plan & rules: `../docs/rewrite/README.md`.

| Package | What | Status |
|---|---|---|
| `packages/config` | Env schema (zod) + **guard: non-production refuses any non-local MongoDB** | ✅ |
| `packages/domain` | Lenient payload schemas from real data; legacy offer-type & payer rules reproduced 1:1 | ✅ basics |
| `apps/server` | Fastify 5: pino JSON logs (secrets redacted), request ids, one error format, Mongoose with `autoIndex`/`autoCreate` off, optional `DB_READONLY` write lock, `/api/health`, `/api/version` | ✅ skeleton |
| `apps/web` | Vite + React 19 + React Router: `/`, `/deal/:dealId[/:step]`, `/offer/:offerNumber`, legacy `/?offer=` redirect; large-type base styles | ✅ shell |
| `packages/pricing` | TS port of `pricing-core.js` against the golden master | Phase 3 |

## Commands (run in `v2/`)
| Command | Does |
|---|---|
| `npm ci` | install |
| `npx tsc -b` | typecheck/build server + packages |
| `npx vitest run` | all tests (163) |
| `npm run build` | build everything incl. web |
| `npx tsc -b && DB_READONLY=1 node apps/server/dist/server.js` | run server against local replica (`127.0.0.1:27018`), writes blocked |
| `npm run dev:web` | web dev server on :5180 (proxies `/api` → :4000) |

## Safety properties (tested)
- `loadConfig()` throws `UnsafeDatabaseError` when `NODE_ENV≠production` and the URI is remote (incl. any `mongodb+srv`); passwords are redacted in the message.
- Mongoose never builds indexes or collections implicitly.
- `DB_READONLY=1` rejects save, insertMany, update*, delete*, findOneAnd*, bulkWrite; reads work.
- 5xx responses never contain internals; every 5xx is logged with request id and passed to the error reporter hook.
