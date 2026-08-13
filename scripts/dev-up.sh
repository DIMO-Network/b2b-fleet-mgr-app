#!/usr/bin/env bash
#
# Runtime half of `make dev`: start the Vite frontend (which generates the
# mkcert dev certificates under web/.mkcert), wait for those certs to appear,
# then start the Go backend in the foreground. The backend serves TLS using
# the same certs (see api/.../main.go runFiber), so the frontend's
# https://localdev.dimo.org:3007 API calls work. Both run together; Ctrl-C
# tears the whole tree down cleanly.
#
# Prerequisites (host check, settings, web deps) are handled by the Makefile
# targets that run before this script.

set -euo pipefail

# Run from the repo root regardless of where the script was invoked from.
cd "$(dirname "$0")/.."

CERT="web/.mkcert/cert.pem"
KEY="web/.mkcert/dev.pem"   # vite-plugin-mkcert emits the key as dev.pem
DEV_HOST="localdev.dimo.org"
WEB_PORT="3008"
API_PORT="3007"

# Recursively kill a process and all of its descendants (npm -> vite -> esbuild).
# pgrep -P is available on both macOS and Linux.
killtree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    killtree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

WEB_PID=""
API_PID=""
cleanup() {
  if [ -n "$API_PID" ]; then
    echo
    echo "▶ shutting down backend…"
    killtree "$API_PID"
  fi
  if [ -n "$WEB_PID" ]; then
    echo "▶ shutting down frontend…"
    killtree "$WEB_PID"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "▶ starting frontend (Vite + mkcert) on https://$DEV_HOST:$WEB_PORT …"
( cd web && npm run dev ) &
WEB_PID=$!

echo "▶ waiting for dev TLS certs ($CERT)…"
until [ -f "$CERT" ] && [ -f "$KEY" ]; do
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "✗ frontend exited before generating certs — see its output above." >&2
    exit 1
  fi
  sleep 0.5
done
echo "✓ dev certs present"

echo "▶ starting backend (api on https://$DEV_HOST:$API_PORT)…"
# Backgrounded and killtree'd on the way out, exactly like the frontend.
#
# It used to run in the foreground, which looked simpler and did not work:
# `go run` compiles to a temp binary and runs it as a child, and on Ctrl-C the
# `go run` wrapper goes away while the compiled server keeps running and keeps
# port 3007. The next `make dev` then died on "address already in use", or
# worse, quietly talked to yesterday's build. killtree walks the descendants,
# so the actual server is what gets signalled.
( cd api && go run ./cmd/fleet-onboard-app ) &
API_PID=$!

# Block until either side exits, then let the EXIT trap take the other down.
# Deliberately a poll rather than `wait -n`: this script runs under whatever
# bash is on the PATH, and macOS still ships 3.2, where `wait -n` does not
# exist.
while kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$API_PID" 2>/dev/null; do
  sleep 0.5
done
