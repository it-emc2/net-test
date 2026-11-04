#!/bin/bash
# Prod (READ-ONLY, rewriteUser) -> mongodump -> local replica container (127.0.0.1:27018).
# Data flows ONE way. Restore target is hard-wired to the local container.
set -euo pipefail
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
HERE="$(cd "$(dirname "$0")" && pwd)"
ENVF="$HOME/.config/emc2/prod-readonly.env"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${DUMP_DIR:-$HOME/emc2-local/dumps}/$STAMP"   # outside the repo, never committed

URI="$(grep -E '^[[:space:]]*MONGODB_URI[[:space:]]*=' "$ENVF" | grep '//rewriteUser:' | head -1 | sed -E 's/^[^=]+=[[:space:]]*//; s/^"//; s/"[[:space:]]*$//')"
[ -n "$URI" ] || { echo "no rewriteUser URI found"; exit 1; }
export URI

# 1) Guard: abort unless strictly read-only
node "$HERE/guard-readonly.mjs"

# 2) Dump (reads only)
mkdir -p "$OUT"
for DB in KonfiguratorDB vigor; do
  docker run --rm -e URI -v "$OUT:/dump" mongo:8.0 \
    sh -c "mongodump --uri \"\$URI\" --readPreference=secondaryPreferred --db $DB --out /dump --quiet"
  echo "dumped $DB"
done
du -sh "$OUT"/*

# 3) Restore into LOCAL container only
docker cp "$OUT" emc2-mongo-replica:/restore-$STAMP
docker exec emc2-mongo-replica mongorestore --host 127.0.0.1 --port 27017 --drop --quiet /restore-$STAMP
docker exec emc2-mongo-replica rm -rf /restore-$STAMP
echo "restored into local replica from $OUT"
