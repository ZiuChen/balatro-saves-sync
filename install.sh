#!/bin/bash
set -e

REPO="ZiuChen/balatro-saves-sync"
APP_NAME="balatro-saves-sync"
DOWNLOAD_URL="https://github.com/${REPO}/releases"

# ─── Parse arguments ─────────────────────────────────────
VERSION="${1:-}"

if [[ -n "$VERSION" ]] && [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?$ ]]; then
  echo "Usage: $0 [VERSION]" >&2
  echo "Example: $0 0.2.0" >&2
  exit 1
fi

# ─── Check dependencies ──────────────────────────────────
DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
  DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
  DOWNLOADER="wget"
else
  echo "Error: Either curl or wget is required but neither is installed" >&2
  exit 1
fi

HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=true
fi

# ─── Download helper ─────────────────────────────────────
download_file() {
  local url="$1"
  local output="$2"

  if [ "$DOWNLOADER" = "curl" ]; then
    if [ -n "$output" ]; then
      curl -fsSL -o "$output" "$url"
    else
      curl -fsSL "$url"
    fi
  elif [ "$DOWNLOADER" = "wget" ]; then
    if [ -n "$output" ]; then
      wget -q -O "$output" "$url"
    else
      wget -q -O - "$url"
    fi
  else
    return 1
  fi
}

# Download with progress percentage
download_file_progress() {
  local url="$1"
  local output="$2"

  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fL -# -o "$output" "$url"
  elif [ "$DOWNLOADER" = "wget" ]; then
    wget --show-progress --progress=bar:force -q -O "$output" "$url"
  else
    return 1
  fi
}

# ─── JSON parser fallback ────────────────────────────────
get_checksum_from_manifest() {
  local json="$1"
  local platform_key="$2"

  json=$(echo "$json" | tr -d '\n\r\t' | sed 's/ \+/ /g')

  if [[ $json =~ \"$platform_key\"[^}]*\"checksum\"[[:space:]]*:[[:space:]]*\"([a-f0-9]{64})\" ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

# ─── Detect platform ─────────────────────────────────────
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)
    echo "Error: Unsupported OS. Use the Windows installer instead." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

# Detect Rosetta 2 on macOS
if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
    arch="arm64"
  fi
fi

PLATFORM="${os}-${arch}"
BINARY_NAME="${APP_NAME}-${PLATFORM}"

echo ""
echo "Installing ${APP_NAME} for ${PLATFORM}..."
echo ""

# ─── Determine version ───────────────────────────────────
if [ -n "$VERSION" ]; then
  TAG="v${VERSION}"
else
  echo "Fetching latest version..."
  LATEST_JSON=$(download_file "https://api.github.com/repos/${REPO}/releases/latest" "")
  if [ "$HAS_JQ" = true ]; then
    TAG=$(echo "$LATEST_JSON" | jq -r '.tag_name')
  else
    TAG=$(echo "$LATEST_JSON" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  fi

  if [ -z "$TAG" ] || [ "$TAG" = "null" ]; then
    echo "Error: Failed to get latest version" >&2
    exit 1
  fi
fi

VERSION_NUM="${TAG#v}"
BASE_URL="${DOWNLOAD_URL}/download/${TAG}"
echo "Version: ${VERSION_NUM}"

# ─── Create temp directory ────────────────────────────────
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# ─── Download manifest ───────────────────────────────────
echo "Downloading manifest..."
download_file "${BASE_URL}/manifest.json" "${TMPDIR}/manifest.json"

# ─── Extract checksum ────────────────────────────────────
if [ "$HAS_JQ" = true ]; then
  CHECKSUM=$(jq -r ".platforms[\"${PLATFORM}\"].checksum // empty" "${TMPDIR}/manifest.json")
else
  MANIFEST_CONTENT=$(cat "${TMPDIR}/manifest.json")
  CHECKSUM=$(get_checksum_from_manifest "$MANIFEST_CONTENT" "$PLATFORM")
fi

if [ -z "$CHECKSUM" ] || [ ${#CHECKSUM} -ne 64 ]; then
  echo "Error: Platform ${PLATFORM} not found in manifest" >&2
  exit 1
fi

# ─── Download binary ─────────────────────────────────────
echo "Downloading binary..."
download_file_progress "${BASE_URL}/${BINARY_NAME}" "${TMPDIR}/${BINARY_NAME}"

# ─── Verify checksum ─────────────────────────────────────
echo "Verifying checksum..."
if [ "$os" = "darwin" ]; then
  ACTUAL=$(shasum -a 256 "${TMPDIR}/${BINARY_NAME}" | cut -d' ' -f1)
else
  ACTUAL=$(sha256sum "${TMPDIR}/${BINARY_NAME}" | cut -d' ' -f1)
fi

if [ "$ACTUAL" != "$CHECKSUM" ]; then
  echo "Error: Checksum verification failed!" >&2
  echo "  Expected: ${CHECKSUM}" >&2
  echo "  Actual:   ${ACTUAL}" >&2
  exit 1
fi

echo "Checksum verified ✓"

# ─── Install ─────────────────────────────────────────────
chmod +x "${TMPDIR}/${BINARY_NAME}"
"${TMPDIR}/${BINARY_NAME}" install

# ─── Done ─────────────────────────────────────────────────
echo ""
echo "✅ Installation complete!"
echo ""
echo "Get started:"
echo "  ${APP_NAME} setup     # Configure sync paths"
echo "  ${APP_NAME} watch     # Start auto-sync"
echo ""
