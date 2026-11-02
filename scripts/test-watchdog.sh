#!/usr/bin/env bash
# test-watchdog.sh — end-to-end test for scripts/tunnel-watchdog.sh.
#
# Runs the REAL watchdog against a stub (scripts/test-fake-ngrok.mjs) that
# stands in for BOTH halves it polls — ngrok's web UI (NGROK_UI_URL) and the
# API's health endpoint (API_HEALTH_URL). Nothing real is touched: no live
# tunnel, no real API process, no real server/.env.
#
# Covers the four decision paths a watchdog change can break:
#   1. healthy     — both halves up => cycles log no recovery action
#   2. dry run     — WATCHDOG_DRY_RUN=1, both halves down => announces what it
#                    *would* do (tunnel + API) but never kills/relaunches
#   3. recover     — tunnel down, not dry => "no ngrok.exe in tasklist — process
#                    is gone, starting fresh" branch, relaunch of the fake
#                    NGROK_EXE observable in its console log, and once the stub
#                    comes back: "tunnel recovered" + mirror_url rewrites
#                    PUBLIC_URL in the test's ENV_FILE copy
#   4. API dry run — API half down under DRY_RUN=1 => announces, doesn't kill
#
# Safety: recover() does `taskkill //IM ngrok.exe //F`, which would take down a
# REAL tunnel too. If any real ngrok.exe is in the tasklist, case 3 is skipped
# (reported as SKIP) instead of risking the live tunnel.
#
# Usage:  bash scripts/test-watchdog.sh    (exit 0 = pass, 1 = fail)
# With KEEP=1 the artifacts below ngrok-tests/ are preserved for inspection.
set -u
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ART_DIR="$ROOT_DIR/ngrok-tests"
WATCHDOG="$ROOT_DIR/scripts/tunnel-watchdog.sh"
STUB="$ROOT_DIR/scripts/test-fake-ngrok.mjs"
KEEP="${KEEP:-0}"
INTERVAL=1  # fast cycles; the watchdog's built-in 10s re-check sleep is unavoidable

mkdir -p "$ART_DIR"
STUB_READY="$ART_DIR/stub-ready.txt"
STUB_CONTROL="$ART_DIR/stub-control.json"
FAKE_EXE="$ART_DIR/fake-ngrok.sh"
FAKE_CONSOLE="$ART_DIR/fake-ngrok-console.log"
KEEPER_PIDS=()

stub_set() { printf '{"tunnelsUp":%s,"healthUp":%s}\n' "$1" "$2" > "$STUB_CONTROL"; }
stub_up()     { stub_set true true; }
tunnel_down() { stub_set false true; }
api_down()    { stub_set true false; }
both_down()   { stub_set false false; }

failures=0
checks=0
pass() { checks=$((checks+1)); echo "  ok:  $1"; }
fail() { checks=$((checks+1)); failures=$((failures+1)); echo "  FAIL: $1"; }
assert_has() {
  if grep -qF -- "$2" "$1"; then pass "$3"; else fail "$3 (missing: '$2')"; fi
}
assert_not_has() {
  if [ ! -f "$1" ]; then pass "$3 (no log to grep — treated as absent)"; return; fi
  if grep -qF -- "$2" "$1"; then fail "$3 (unexpected: '$2')"; else pass "$3"; fi
}
assert_match() {
  if grep -qE -- "$2" "$1"; then pass "$3"; else fail "$3 (no match for: $2)"; fi
}
assert_equals() {
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got: '$2', want: '$3')"; fi
}

FAKE_PID_FILE="$ART_DIR/fake-ngrok-pids.txt"
rm -f "$FAKE_CONSOLE" "$FAKE_PID_FILE"
trap '
  for pid in "${KEEPER_PIDS[@]}"; do kill "$pid" >/dev/null 2>&1; done
  for pid in $(cat "$FAKE_PID_FILE" 2>/dev/null); do kill "$pid" >/dev/null 2>&1; done
' EXIT

# Fake ngrok.exe: relaunch target for the recover path. The watchdog redirects
# its output to CONSOLE_LOG, so the marker line there proves the relaunch. The
# fake writes its own pid so the trap can reap it — the watchdog kills only the
# ngrok.exe image, and its bash child would otherwise sleep 999999 forever.
cat > "$FAKE_EXE" <<'EOF'
#!/usr/bin/env bash
echo "FAKE-NGROK-STARTED $1 $2 at $(date +%s)"
[ -n "${FAKE_PID_FILE:-}" ] && printf '%s\n' "$BASHPID" >> "$FAKE_PID_FILE"
sleep 999999
EOF
chmod +x "$FAKE_EXE"

echo "== stub =="
rm -f "$STUB_READY"
STUB_READY_FILE="$STUB_READY" STUB_CONTROL_FILE="$STUB_CONTROL" node "$STUB" >"$ART_DIR/stub.log" 2>&1 &
STUB_PID=$!
KEEPER_PIDS+=("$STUB_PID")
for _ in $(seq 1 50); do
  [ -s "$STUB_READY" ] && break
  sleep 0.1
done
STUB_BASE="$(head -1 "$STUB_READY" 2>/dev/null)"
[ -n "$STUB_BASE" ] || { echo "stub failed to start (see $ART_DIR/stub.log)"; exit 1; }
stub_up
echo "  stub on $STUB_BASE (artifacts in $ART_DIR/)"

start_watchdog() { # start_watchdog <name> [ENV=VAL ...] -> logs under ART_DIR/<name>.log
  local name="$1"; shift
  rm -f "$ART_DIR/$name.log" "$ART_DIR/$name.console"
  env WATCHDOG_INTERVAL=$INTERVAL \
    NGROK_UI_URL="http://$STUB_BASE/api/tunnels" \
    API_HEALTH_URL="http://$STUB_BASE/api/health" \
    API_PORT=19999 \
    LOG_FILE="$ART_DIR/$name.log" "$@" \
    bash "$WATCHDOG" >"$ART_DIR/$name.console" 2>&1 &
  WD_PID=$!
  KEEPER_PIDS+=("$WD_PID")
}

stop_watchdog() {
  kill "$WD_PID" >/dev/null 2>&1
  wait "$WD_PID" 2>/dev/null
}

# --- case 1: healthy — no recovery decisions -------------------------------
echo "== 1. healthy => no recovery actions =="
start_watchdog healthy WATCHDOG_DRY_RUN=0
sleep 2.5
stop_watchdog
assert_has     "$ART_DIR/healthy.log" "watchdog starting" "healthy: watchdog started"
assert_not_has "$ART_DIR/healthy.log" "unhealthy" "healthy: nothing decided unhealthy"
assert_not_has "$ART_DIR/healthy.log" "recovery" "healthy: no recovery attempted"

# --- case 2: dry run — both halves down, announced but untouched -----------
echo "== 2. dry run = announce both halves, no kills/relaunches =="
both_down
start_watchdog dryrun WATCHDOG_DRY_RUN=1
sleep 2.5
stop_watchdog
assert_match "$ART_DIR/dryrun.log" "api unhealthy.*\(dry-run=1\)" "dry run: API announced"
assert_has "$ART_DIR/dryrun.log" "tunnel unhealthy — beginning recovery (dry-run=1)" "dry run: tunnel announced"
assert_has "$ART_DIR/dryrun.log" "dry-run: would taskkill ngrok.exe" "dry run: would kill ngrok"
assert_has "$ART_DIR/dryrun.log" "dry-run: would kill any stale listener" "dry run: would kill stale listener"
assert_not_has "$ART_DIR/dryrun.log" "killing" "dry run: nothing actually killed"
assert_not_has "$ART_DIR/dryrun.log" "tunnel is back" "dry run: no fake success reported"
assert_not_has "$FAKE_CONSOLE" "FAKE-NGROK-STARTED" "dry run: fake ngrok.exe never relaunched"

# --- case 3: recover — fresh-start branch, fake relaunch, URL mirrored ------
echo "== 3. recover (tunnel) = fresh start, fake relaunch, URL mirrored =="
if tasklist //FI "IMAGENAME eq ngrok.exe" 2>/dev/null | grep -q ngrok.exe; then
  echo "  SKIP: a real ngrok.exe is running and recover() would taskkill it; stop ngrok to run this case."
else
  rm -f "$FAKE_CONSOLE"
  printf 'PUBLIC_URL=https://stale-copies.test\n' > "$ART_DIR/recover.env"
  tunnel_down
  # ENV_FILE points the mirror at the test's copy — without it mirror_url's
  # default rewrites the REAL server/.env's PUBLIC_URL to the stub URL.
  start_watchdog recover WATCHDOG_DRY_RUN=0 NGROK_EXE="$FAKE_EXE" NGROK_ADDR=0 \
    CONSOLE_LOG="$FAKE_CONSOLE" ENV_FILE="$ART_DIR/recover.env" FAKE_PID_FILE="$FAKE_PID_FILE"
  # First cycle relaunches the fake (tunnel still down => "still not answering");
  # halfway through, bring the stub back up: next cycle reports recovery + mirror.
  sleep 12.5
  stub_up
  # Attempt 2 relaunches inside the next cycle (~T0+12.5) and recover() then
  # sleeps 10s before its re-check, so "tunnel is back" + the mirror land
  # ~T0+23 and "tunnel recovered" ~T0+24. Stop with several seconds of margin;
  # a knife-edge wait races the single golden line and flakes randomly.
  sleep 16
  stop_watchdog
  assert_has "$ART_DIR/recover.log" "tunnel unhealthy — beginning recovery (dry-run=0)" "recover: decided, not dry"
  assert_has "$ART_DIR/recover.log" "no ngrok.exe in tasklist — process is gone, starting fresh" "recover: no-zombie branch"
  assert_has "$FAKE_CONSOLE" "FAKE-NGROK-STARTED http 0" "recover: relaunched fake ngrok.exe"
  assert_has "$ART_DIR/recover.log" "tunnel still not answering after relaunch" "recover: stub still down right after relaunch (catch: fake relaunch meters nowhere)"
  assert_has "$ART_DIR/recover.log" "tunnel recovered (was down in a previous check)" "recover: recovered next cycle"
  assert_has "$ART_DIR/recover.log" "mirrored new URL into server/.env: https://stub-watchdog.test" "recover: mirrored rotated URL"
  assert_equals "recover: ENV_FILE copy kept the new PUBLIC_URL" \
    "$(grep '^PUBLIC_URL=' "$ART_DIR/recover.env" | cut -d= -f2- | tr -d '[:space:]')" \
    "https://stub-watchdog.test"
fi

# --- case 4: API dry run — API half down, announced, no kill ----------------
echo "== 4. API dry run = announced, nothing killed =="
api_down
start_watchdog apidry WATCHDOG_DRY_RUN=1
sleep 2.5
stop_watchdog
assert_match "$ART_DIR/apidry.log" "api unhealthy.*\(dry-run=1\)" "api dry run: announced"
assert_has     "$ART_DIR/apidry.log" "dry-run: would kill any stale listener" "api dry run: would kill stale listener"
assert_not_has "$ART_DIR/apidry.log" "killing stale listener" "api dry run: no real kill"
assert_not_has "$ART_DIR/apidry.log" "api is back" "api dry run: no fake success reported"

echo
if [ "$failures" -gt 0 ]; then
  echo "watchdog test: $failures FAILED of $checks checks (artifacts in $ART_DIR/)"
  exit 1
fi
echo "watchdog test: all $checks checks passed (artifacts in $ART_DIR/)"
if [ "$KEEP" != "1" ]; then
  rm -rf "$ART_DIR"
  echo "artifacts removed (KEEP=1 to keep them)"
fi
exit 0
