#!/usr/bin/env bash
# RLS tests against the linked DEV project (no Docker needed):
#   bash supabase/tests/run.sh            # all *.test.sql
#   bash supabase/tests/run.sh 030        # files matching a prefix
# Each file runs as: begin; _setup.sql; <file>; rollback; via the Management API, so nothing
# is committed. The last statement of each file must be `select * from runtests(...)`.
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(cat ../.temp/project-ref 2>/dev/null)" != "fzwsrsihofffzhkjymut" ]; then
  echo "Refusing to run: linked project is not knotly-dev." >&2
  exit 2
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failed=0
total=0

for f in ${1:-}*.test.sql; do
  { echo "begin;"; cat _setup.sql; cat "$f"; echo "rollback;"; } > "$tmp/run.sql"
  if ! out="$(pnpm exec supabase db query --linked -o json -f "$tmp/run.sql" 2>&1)"; then
    echo "✗ $f: $(echo "$out" | grep -v 'new version\|recommend\|Initialising' | head -5)"
    failed=$((failed + 1))
    continue
  fi
  lines="$(echo "$out" | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
      for (const r of j.rows) console.log(Object.values(r)[0]);
    });')"
  echo "# $f"
  # runtests() nests each test's assertions as indented subtests; count those.
  echo "$lines" | grep -E '^ +(not ok|#)' || true
  n_ok="$(echo "$lines" | grep -cE '^ +ok' || true)"
  n_bad="$(echo "$lines" | grep -cE '^ +not ok|^ +# Test died' || true)"
  echo "  $n_ok passed, $n_bad failed"
  total=$((total + n_ok + n_bad))
  failed=$((failed + n_bad))
done

echo "== $total assertions, $failed failed"
[ "$failed" -eq 0 ]
