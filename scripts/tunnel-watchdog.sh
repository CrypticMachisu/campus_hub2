#!/usr/bin/env bash
# tunnel-watchdog.sh — keep the CampusHub ngrok tunnel alive.
#
# Automates OPERATIONS.md "Restarting the stack" steps 1-3 so an ngrok death
# is recovered in seconds instead of "when someone next looks at the log":
#
#   1. every interval, ask ngrok's web UI (127.0.0.1:4040/api/tunnels) if the
#      tunnel is actually up — a nodding tasklist entry with a dead :4040 is
#      the known ngrok zombie state, and "up but zero tunnels" counts as down;
#   2. when it is unhealthy: kill every ngrok.exe (a zombie must go before a
#      fresh instance or the new one fails silently), relaunch using the
#      Microsoft Store alias (plain `ngrok` is NOT on the Git Bash PATH);
#   3. after recovery, mirror any rotated public URL into PUBLIC_URL in
#      server/.env so the startup log stops lying. The README base URL stays
#      a manual mirror — per the runbook, step 3.
#
# Deliberately does NOT restart the API half (:5000): tunnel-death usually
# shares a root cause with API-death (sleep/reboot kill both), but the node
# half has the PORT=0 judgment call — see the runbook before automating it.
# Also cannot prevent a machine sleep or reboot; at demo time keep the lid
# open / disable sleep so both halves stay alive. 😅

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/server/.env}"
LOG_FILE="${LOG_FILE:-$ROOT_DIR/ngrok-watchdog.log}"
CONSOLE_LOG="${CONSOLE_LOG:-/tmp/ngrok-console.log}"
INTERVAL="${WATCHDOG_INTERVAL:-20}"
# Where ngrok's web UI lives; only overridden for testing.
UI_URL="${NGROK_UI_URL:-http://127.0.0.1:4040/api/tunnels}"
# Dry run: diagnose and decide, but never kill or relaunch.
DRY_RUN="${WATCHDOG_DRY_RUN:-0}"
NGROK_EXE="${NGROK_EXE:-$LOCALAPPDATA/Microsoft/WindowsApps/ngrok.exe}"
ADDR="${NGROK_ADDR:-5000}"

stamp() { date +"%Y-%m-%d %H:%M:%S"; }
say() { echo "[$(stamp)] $*" >> "$LOG_FILE"; }

# 1 if ngrok's web UI answers with a non-empty tunnels list.
tunnel_up() {
  curl -s --max-time 5 "$UI_URL" \
    | grep -q '"public_url":"[^"]'
}

recover() {
  say "tunnel unhealthy — beginning recovery (dry-run=$DRY_RUN)"
  if [ "$DRY_RUN" = "1" ]; then
    say "dry-run: would taskkill ngrok.exe, relaunch '$NGROK_EXE http $ADDR', re-check in 10s"
    return
  fi
  if tasklist //FI "IMAGENAME eq ngrok.exe" 2>/dev/null | grep -q ngrok.exe; then
    say "killing zombie ngrok process(es): $(tasklist //FI "IMAGENAME eq ngrok.exe" | tail -1 | awk '{print $2}')"
    taskkill //IM ngrok.exe //F >/dev/null
  else
    say "no ngrok.exe in tasklist — process is gone, starting fresh"
  fi
  if [ ! -x "$(cygpath -u "$NGROK_EXE" 2>/dev/null || echo "$NGROK_EXE")" ] && ! command -v "$NGROK_EXE" >/dev/null; then
    say "cannot find ngrok executable at '$NGROK_EXE' — fix NGROK_EXE, giving up this cycle"
    return
  fi
  ("$NGROK_EXE" http "$ADDR" >> "$CONSOLE_LOG" 2>&1 &)
  sleep 10
  if tunnel_up; then
    say "tunnel is back"
    mirror_url
  else
    say "tunnel still not answering after relaunch — will retry next cycle"
  fi
}

# Mirror the freshly rotated URL into server/.env (cosmetic; README manual).
mirror_url() {
  local url
  url="$(curl -s --max-time 5 "$UI_URL" | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)"
  [ -z "$url" ] && return
  if [ -f "$ENV_FILE" ] && grep -q '^PUBLIC_URL=' "$ENV_FILE"; then
    local current
    current="$(grep '^PUBLIC_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')"
    base_url="${url%/}"
    if [ "$current" != "$base_url" ]; then
      sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=$base_url|" "$ENV_FILE"
      say "mirrored new URL into server/.env: $base_url (README needs the manual mirror, runbook step 3)"
    fi
  else
    say "server/.env has no PUBLIC_URL line — skipping mirror (path: $ENV_FILE)"
  fi
}

say "watchdog starting: ui=$UI_URL interval=${INTERVAL}s addr=:$ADDR dry-run=$DRY_RUN"
while true; do
  if tunnel_up; then
    if [ -n "${WATCHDOG_WAS_DOWN:-}" ]; then
      say "tunnel recovered (was down in a previous check)"; unset WATCHDOG_WAS_DOWN
    fi
  else
    export WATCHDOG_WAS_DOWN=1
    recover
  fi
  sleep "$INTERVAL"
done
