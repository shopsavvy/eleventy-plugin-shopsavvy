#!/bin/bash
set -e

if [ ! -f package.json ] || ! grep -q '"name": "eleventy-plugin-shopsavvy"' package.json; then
  echo "WARNING: run test.sh from the eleventy-plugin-shopsavvy directory"
  exit 1
fi

REQUIRED=(
  src/index.ts
  package.json
  tsconfig.json
  examples/basic/.eleventy.js
  examples/basic/index.njk
  README.md
  LICENSE
  .gitignore
)

echo "==> Checking required files"
for f in "${REQUIRED[@]}"; do
  [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
done
echo "  all files present"

if command -v bun >/dev/null 2>&1; then
  echo "==> bun install"
  bun install --silent
  echo "==> typecheck"
  bun run typecheck
  echo "==> build"
  bun run build
  if [ ! -f dist/index.js ] || [ ! -f dist/index.mjs ]; then
    echo "ERROR: dual ESM/CJS build missing"
    exit 1
  fi
  echo "  ESM + CJS dist artifacts present"
  echo "==> tests (real Eleventy build of examples/basic against a local API stand-in)"
  bun test tests
else
  echo "==> bun not installed; skipping build smoke test"
fi

echo "==> All checks passed"
