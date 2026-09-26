#!/bin/bash
# oresund.live deploy: build web (vite + prerender + llms.txt), wrangler pages
# deploy, GSC inspection of changed URLs.
set -e
export PATH="$HOME/.bun/bin:$PATH"

# `bun run build` in packages/web ALREADY runs scripts/prerender.ts and
# scripts/generate-llms.ts after vite build. Do not run them again here
# (2026-09-26): a second prerender pass reads the already-prerendered
# dist/index.html as its shell, and since the board frame landed in #app (R1
# C1/H1) that shell no longer carries the empty '<div id="app"></div>' marker
# the body injection matches — the page bodies were silently dropped and every
# static page shipped as the home frame with swapped meta (live 2026-09-26).
# scripts/prerender.ts now refuses a non-pristine shell, so the old double run
# fails loudly instead of deploying corrupted pages.
echo "── Building web (vite + prerender + llms.txt) ──"
cd "$(dirname "$0")/packages/web"
bun run build

echo ""
echo "── Deploying to Cloudflare Pages ──"
npx wrangler pages deploy dist --project-name=oresund-live --branch=main

cd ../..
echo ""
echo "── GSC Indexing ───────────────────────────────────────"
if command -v uv >/dev/null 2>&1 && [ -f gsc_inspect.py ]; then
    uv run gsc_inspect.py --changed 2>&1 || echo "⚠ GSC inspection failed (non-fatal)"
else
    echo "Skipped (uv or gsc_inspect.py not found)"
fi
