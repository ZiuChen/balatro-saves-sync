#!/bin/bash
set -e

APP_NAME="balatro-saves-sync"
OUTDIR="dist"

TARGETS=(
  "bun-darwin-arm64:darwin-arm64"
  "bun-darwin-x64:darwin-x64"
  "bun-linux-arm64:linux-arm64"
  "bun-linux-x64:linux-x64"
  "bun-windows-x64:win32-x64"
)

echo "🔨 Building ${APP_NAME} for all platforms..."
echo ""

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

for entry in "${TARGETS[@]}"; do
  IFS=':' read -r target platform <<< "$entry"

  ext=""
  if [[ "$platform" == win32-* ]]; then
    ext=".exe"
  fi

  outfile="${OUTDIR}/${APP_NAME}-${platform}${ext}"
  echo "  Building for ${platform} (target: ${target})..."
  bun build src/index.ts --compile --target="${target}" --outfile "${outfile}" 2>&1 | tail -1
done

echo ""
echo "✅ All builds complete!"
echo ""
ls -lh "$OUTDIR"/
