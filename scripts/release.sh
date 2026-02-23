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

# 2. Git commit and tag
echo ""
echo "📦 Creating git commit and tag..."
git add -A
git commit -m "release: v${VERSION}"
git tag "v${VERSION}"

# 3. Push (GitHub Actions will build, generate manifest, and create the release)
echo ""
echo "⬆️  Pushing to remote..."
git push && git push --tags

echo ""
echo "✅ Tag v${VERSION} pushed! GitHub Actions will handle the release."
echo "   ${REPO_URL}/actions"
