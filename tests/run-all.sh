#!/bin/sh
# Runs the browser smoke test. Starts a local server on port 8123 if none is running.
# Usage: sh tests/run-all.sh   (screenshots and logs go to tests/out/)
cd "$(dirname "$0")/.." || exit 1
mkdir -p tests/out
PORT=${PORT:-8123}
STARTED=""
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
    python3 -m http.server "$PORT" >/dev/null 2>&1 &
    STARTED=$!
    sleep 1
fi
GAME_URL="http://127.0.0.1:$PORT/index.html" node tests/smoke.js
STATUS=$?
[ -n "$STARTED" ] && kill "$STARTED"
exit $STATUS
