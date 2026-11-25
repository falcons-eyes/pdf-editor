#!/usr/bin/env bash
# Re-creates the README images in docs/images/ from the real app UI.
#   docs/tools/render.sh            # everything
#   docs/tools/render.sh compose    # only re-compose PNGs from existing raw shots
# Runs web/dev_server.py against a throwaway "home" folder filled with made-up documents,
# so no real files are ever opened. Needs Node 18+, python3 and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-4320}"
[ -d node_modules ] || npm ci
if [ "${1:-all}" = compose ]; then node compose.cjs; exit 0; fi
FAKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/pdfe-readme-home.XXXXXX")"
touch "$FAKE_HOME/.pdfe-fake-home"
export FAKE_HOME PDFE_URL="http://localhost:$PORT/?desktop=1" FFMPEG="${FFMPEG:-ffmpeg}"
PDFE_DEV_HOME="$FAKE_HOME" python3 ../../web/dev_server.py "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$FAKE_HOME"' EXIT
for _ in $(seq 50); do curl -fs "http://localhost:$PORT/" >/dev/null && break; sleep 0.2; done
node shoot.cjs
node compose.cjs
node demo.cjs
