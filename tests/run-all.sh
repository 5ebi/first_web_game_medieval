#!/bin/sh
# Runs every browser test against a local static server and prints a summary.
# Needs Node and Playwright: pre-installed in Claude Code cloud sessions;
# locally: npm i -g playwright && npx playwright install chromium
# Usage: sh tests/run-all.sh            (PORT=8123 by default)
set -u
cd "$(dirname "$0")/.." || exit 1
PORT=${PORT:-8123}
export GAME_URL="http://127.0.0.1:$PORT/index.html"
mkdir -p tests/out

if ! curl -s -o /dev/null "$GAME_URL"; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  sleep 1
fi

fail=0
for t in save touch mouse placement feedback e2e-phone perf screenshots; do
  if node "tests/$t.js" > "tests/out/$t.log" 2>&1; then
    echo "pass  $t ($(grep -c '^ok' "tests/out/$t.log") checks)"
  else
    echo "FAIL  $t (log: tests/out/$t.log)"
    grep -E '^FAIL|Error' "tests/out/$t.log" | head -5
    fail=1
  fi
done
exit $fail
