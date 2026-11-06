#!/usr/bin/env bash
# Local preview of v2 on http://localhost:3001 — against the LOCAL preview database "oc_preview"
# (a copy of the local data copy), never production. Every integration points at a dead local
# port, so nothing (Bitrix, mail, letters, planning) can leave this computer. PDFs: local Gotenberg.
set -euo pipefail
cd "$(dirname "$0")/../.."
export NODE_ENV=development HOST=127.0.0.1 PORT=3001 LOG_LEVEL=info
export MONGODB_URI="mongodb://127.0.0.1:27018/?directConnection=true" MONGODB_DB=oc_preview
export GOTENBERG_URL=http://127.0.0.1:3000
DEAD=http://127.0.0.1:9
export BITRIX_WEBHOOK_BASE="$DEAD/rest/0/blocked" PLANNING_API_BASE_URL=$DEAD OB24_BASE_URL=$DEAD EXTERNAL_API_BASE=$DEAD
export SMTP_HOST=127.0.0.1 SMTP_PORT=9 SMTP_SEND_PORT=9 IMAP_HOST=127.0.0.1 IMAP_PORT=9
export OFFER_LINK_BASE=http://localhost:3001 PUBLIC_BASE_URL=http://localhost:3001
# Node 25.9 on this Mac corrupts request text (docs/rewrite/TESTING.md) → prefer a stable Node
NODE_BIN="${NODE_BIN:-}"
for c in /usr/local/opt/node@24/bin/node /opt/homebrew/opt/node@24/bin/node /usr/local/opt/node@22/bin/node /opt/homebrew/opt/node@22/bin/node; do
  [ -z "$NODE_BIN" ] && [ -x "$c" ] && NODE_BIN="$c"
done
exec "${NODE_BIN:-node}" v2/apps/server/dist/server.js
