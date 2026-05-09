#!/bin/bash
set -e

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
else
  echo "==> bun not installed; skipping build smoke test"
fi

echo "==> All checks passed"
