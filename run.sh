#!/usr/bin/env bash
# Start the CampusHub API with one command, request log visible in the terminal and appended to server/requests.log.
#
#   ./run.sh              starts on http://localhost:5000/api
#   PORT=5001 ./run.sh    a different port
#
# Needs MySQL running (XAMPP is fine) and server/.env, copied from
# server/.env.example. Works in Git Bash on Windows, and on macOS/Linux.
set -euo pipefail

cd "$(dirname "$0")/server"

if [ ! -f .env ]; then
  echo "Missing server/.env — copy server/.env.example to server/.env and fill it in." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing server dependencies (first run only)…"
  npm install
fi

export PORT="${PORT:-5000}"
echo "CampusHub API on http://localhost:${PORT}/api"
echo "Request log: one JSON line per request, also appended to server/requests.log"
echo

node server.js 2>&1 | tee -a requests.log
