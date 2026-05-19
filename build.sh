#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$SCRIPT_DIR/packages/coding-agent"
BUILT_BINARY="$PACKAGE_DIR/dist/pi"
OUTPUT_BINARY="$SCRIPT_DIR/pi"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	cat <<EOF
Usage: ./build.sh

Build the standalone pi binary from source and copy it to:
  $OUTPUT_BINARY
EOF
	exit 0
fi

if ! command -v node >/dev/null 2>&1; then
	echo "node is required. Install Node 22.19.0 or newer first." >&2
	exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
	echo "npm is required. Install Node 22.19.0 or newer first." >&2
	exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
	echo "bun is required to compile the standalone binary. Install bun first." >&2
	exit 1
fi

node <<'NODE'
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
	console.error(`Node ${process.versions.node} detected. Use Node 22.19.0 or newer.`);
	process.exit(1);
}
NODE

if [[ ! -x "$SCRIPT_DIR/node_modules/.bin/tsx" ]]; then
	echo "Repo dependencies are missing. Run 'npm install' from $SCRIPT_DIR first." >&2
	exit 1
fi

echo "Building standalone pi binary..."
(
	cd "$PACKAGE_DIR"
	npm run build:binary
)

if [[ ! -f "$BUILT_BINARY" ]]; then
	echo "Expected binary was not created at $BUILT_BINARY" >&2
	exit 1
fi

copy_runtime_dir() {
	local name="$1"
	local source="$PACKAGE_DIR/dist/$name"
	local target="$SCRIPT_DIR/$name"

	if [[ ! -d "$source" ]]; then
		echo "Expected runtime asset directory was not created at $source" >&2
		exit 1
	fi

	rm -rf "$target"
	cp -R "$source" "$target"
}

copy_runtime_file() {
	local name="$1"
	local source="$PACKAGE_DIR/dist/$name"
	local target="$SCRIPT_DIR/$name"

	if [[ ! -f "$source" ]]; then
		echo "Expected runtime asset file was not created at $source" >&2
		exit 1
	fi

	cp "$source" "$target"
}

cp "$BUILT_BINARY" "$OUTPUT_BINARY"
chmod +x "$OUTPUT_BINARY"

if [[ "$(uname -s)" == "Darwin" ]] && command -v codesign >/dev/null 2>&1; then
	echo "Re-signing standalone binary for macOS..."
	codesign --force --sign - "$OUTPUT_BINARY"
fi

copy_runtime_dir "theme"
copy_runtime_dir "assets"
copy_runtime_dir "export-html"
copy_runtime_dir "docs"
copy_runtime_dir "examples"
copy_runtime_file "CHANGELOG.md"
copy_runtime_file "photon_rs_bg.wasm"

echo "Copied standalone binary and runtime assets to $SCRIPT_DIR"
