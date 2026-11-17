#!/usr/bin/env bash
# Gives a fresh worktree its node_modules in seconds instead of a full install (run by the
# SessionStart hook in .claude/settings.json; safe to run by hand any time).
# For the repo root and v2/: if node_modules is missing, clone it (APFS copy-on-write, `cp -c`)
# from another worktree whose package-lock.json is identical; workspace links in node_modules
# are relative, so the clone points at this worktree's own packages. Otherwise `npm ci`.
set -u
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0
others() { git worktree list --porcelain | sed -n 's/^worktree //p' | grep -vxF "$ROOT"; }

for dir in . v2; do
  [ -f "$dir/package-lock.json" ] || continue
  [ -d "$dir/node_modules" ] && continue
  src=""
  while IFS= read -r wt; do
    if [ -d "$wt/$dir/node_modules" ] && cmp -s "$wt/$dir/package-lock.json" "$dir/package-lock.json"; then src="$wt/$dir/node_modules"; break; fi
  done < <(others)
  if [ -n "$src" ] && cp -Rc "$src" "$dir/node_modules" 2>/dev/null; then
    echo "ensure-deps: $dir/node_modules cloned from $src"
  else
    rm -rf "$dir/node_modules"
    echo "ensure-deps: $dir — no matching worktree, running npm ci"
    (cd "$dir" && npm ci --prefer-offline --no-audit --no-fund --silent) || echo "ensure-deps: npm ci failed in $dir"
  fi
done
exit 0
