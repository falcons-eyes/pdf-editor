#!/usr/bin/env bash
# Re-creates the README images in docs/images/ from the real app UI, in English and Korean.
#   docs/tools/render.sh              # everything, both languages
#   docs/tools/render.sh compose      # only re-compose the PNGs from existing raw shots
#   docs/tools/render.sh appstore     # only the Mac App Store screenshots -> docs/appstore/screenshots/<l>/ (2880x1800, no alpha)
#   docs/tools/render.sh play         # only the Google Play graphics -> mobile/store/play/ (phone 1080x1920, tablet 1440x2560,
#                                     #   feature 1024x500; the page in its Android mode, framed with captions; play-shots.cjs)
#   LANGS=en docs/tools/render.sh     # one language
# Output per language (<l> = en | ko): docs/images/ demo-<l>.gif, seal-<l>.gif, hero-<l>.png, steps-<l>.png, features-<l>.png,
# before-after-<l>.png, social-<l>.png, seal-states-<l>.png; and for the website, site/assets/ app-<l>-{1600,960}.webp
# (hero screenshot), demo-<l>.mp4 + demo-<l>-poster.webp, seal-<l>.mp4 + seal-<l>-poster.webp (1200x750 H.264, 25 fps)
# and social-<l>.png (og:image, same picture as docs/images/social-<l>.png).
# Runs web/dev_server.py (standalone mode, with its stand-in seal) against a throwaway "home" folder. The documents in it
# are the app's own examples (window.__pdfe.loadExample, docs/design/scenarios.md) saved under a person's file names,
# so no real files are ever opened. Needs Node 18+, python3 and ffmpeg (with libx264).
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-4320}"
LANGS="${LANGS:-en ko}"
[ -d node_modules ] || npm ci
if [ "${1:-all}" = compose ]; then node compose.cjs $LANGS; exit 0; fi
FAKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/pdfe-readme-home.XXXXXX")"
touch "$FAKE_HOME/.pdfe-fake-home"
export FAKE_HOME PDFE_URL="http://localhost:$PORT/?desktop=1&standalone=1" FFMPEG="${FFMPEG:-ffmpeg}"
PDFE_DEV_HOME="$FAKE_HOME" python3 ../../web/dev_server.py "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$FAKE_HOME"' EXIT
for _ in $(seq 50); do curl -fs "http://localhost:$PORT/" >/dev/null && break; sleep 0.2; done
if [ "${1:-all}" = appstore ]; then for l in $LANGS; do node appstore-shots.cjs "$l"; done; exit 0; fi
if [ "${1:-all}" = play ]; then for l in $LANGS; do node play-shots.cjs "$l"; done; exit 0; fi
for l in $LANGS; do node shoot.cjs "$l"; done
node compose.cjs $LANGS
for l in $LANGS; do node demo.cjs "$l"; node seal.cjs "$l"; done
