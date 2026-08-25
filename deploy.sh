#!/bin/bash
# oresund.live deploy: build web, wrangler pages deploy, GSC inspection of changed URLs.
set -e
export PATH="$HOME/.bun/bin:$PATH"

echo "── Building web ──"
cd "$(dirname "$0")/packages/web"
bun run build

echo ""
echo "── Prerendering static pages ──"
bun run scripts/prerender.ts
bun run scripts/generate-llms.ts

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
