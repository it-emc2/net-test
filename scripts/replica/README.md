# Local production replica (read-only)

Production MongoDB is **never written**. All development and testing runs against a local copy.

| File | Purpose |
|---|---|
| `docker-compose.replica.yml` | Local `mongo:8.0` on `127.0.0.1:27018` only |
| `guard-readonly.mjs` | Aborts unless the prod user's only role is `readAnyDatabase` with 0 write actions |
| `dump-and-restore.sh` | Guard → `mongodump` prod → `mongorestore --drop` into the **local** container |
| `compare-counts.mjs` | Exact document counts per collection, prod vs local |

## Setup (once)

1. Docker Desktop running.
2. Atlas user with role **Only read any database** (currently `rewriteUser`).
3. `~/.config/emc2/prod-readonly.env` (outside the repo, `chmod 600`) containing
   `MONGODB_URI=mongodb+srv://rewriteUser:<pw>@emc2cluster.nzox91s.mongodb.net/`
4. `cd scripts/replica && npm i --no-save mongodb@6` (driver for guard/compare)
5. `docker compose -f scripts/replica/docker-compose.replica.yml up -d`

## Refresh

```bash
scripts/replica/dump-and-restore.sh
```

Dumps go to `~/emc2-local/dumps/<timestamp>/` (override with `DUMP_DIR`).
The app's local `.env` must point at `mongodb://127.0.0.1:27018` — never at Atlas.
