#!/usr/bin/env bash
# Build the gyl-bookings plugin zip from source.
#
# Usage: scripts/build-plugin-zip.sh [output-dir]
#   Default output dir: ~/Desktop
#
# Reads the plugin version from gyl-bookings.php and writes:
#   <output-dir>/gyl-bookings-vX.Y.Z.zip
#
# Echoes the resulting absolute path to stdout (other scripts capture it).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_SRC="$REPO_ROOT/wp-plugin/gyl-bookings"
OUTPUT_DIR="${1:-$HOME/Desktop}"

if [[ ! -f "$PLUGIN_SRC/gyl-bookings.php" ]]; then
  echo "[build-plugin-zip] missing $PLUGIN_SRC/gyl-bookings.php" >&2
  exit 1
fi

VERSION="$(grep -E '^\s*\*\s*Version:\s*' "$PLUGIN_SRC/gyl-bookings.php" | head -1 | awk '{print $3}')"
if [[ -z "$VERSION" ]]; then
  echo "[build-plugin-zip] could not parse Version: from gyl-bookings.php" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_ZIP="$OUTPUT_DIR/gyl-bookings-v${VERSION}.zip"

# Build a clean zip without dev artifacts.
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
cp -R "$PLUGIN_SRC" "$TMPDIR/gyl-bookings"
# Strip dev / QA / build-output directories that shouldn't ship.
find "$TMPDIR/gyl-bookings" -type d \( -name qa -o -name design-judge-out -o -name node_modules -o -name .git \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$TMPDIR/gyl-bookings" -name '.DS_Store' -delete 2>/dev/null || true

# Remove any pre-existing zip at the target path so we always emit a fresh one.
rm -f "$OUTPUT_ZIP"
( cd "$TMPDIR" && zip -qr "$OUTPUT_ZIP" "gyl-bookings" )

echo "$OUTPUT_ZIP"
