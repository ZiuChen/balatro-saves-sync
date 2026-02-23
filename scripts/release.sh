#!/bin/bash
set -e

APP_NAME="balatro-saves-sync"
VERSION="${1}"

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.2.0"
  exit 1
fi

REPO_URL="https://github.com/ZiuChen/balatro-saves-sync"

echo "🚀 Releasing v${VERSION}..."
echo ""

# 1. Update version in package.json (constants.ts reads from package.json at build time)
echo "📝 Updating version..."
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" package.json
echo "  ✓ package.json"

# 2. Build all platforms
echo ""
echo "🔨 Building..."
bash scripts/build-all.sh

# 3. Generate manifest
echo ""
echo "📋 Generating manifest..."
bun run scripts/generate-manifest.ts "${VERSION}"

# 4. Git commit and tag
echo ""
echo "📦 Creating git commit and tag..."
git add -A
git commit -m "release: v${VERSION}"
git tag "v${VERSION}"

# 5. Push
echo ""
echo "⬆️  Pushing to remote..."
git push && git push --tags

# 6. Create GitHub Release (if gh CLI is available)
echo ""
if command -v gh >/dev/null 2>&1; then
  echo "🎉 Creating GitHub Release..."
  gh release create "v${VERSION}" \
    --title "v${VERSION}" \
    --generate-notes \
    dist/*
  echo ""
  echo "✅ Release v${VERSION} published!"
  echo "   ${REPO_URL}/releases/tag/v${VERSION}"
else
  echo "⚠️  GitHub CLI (gh) not found. Please create the release manually:"
  echo "   1. Go to ${REPO_URL}/releases/new?tag=v${VERSION}"
  echo "   2. Upload all files from dist/"
  echo "   3. Publish the release"
fi

echo ""
echo "✅ Done!"
