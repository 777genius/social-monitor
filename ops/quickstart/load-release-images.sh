#!/usr/bin/env bash
# Download only compiled images for this immutable preview, never executable scripts.
set -euo pipefail
umask 077
STATE=${1:?State directory required}
command -v curl >/dev/null || { printf 'curl is required to download prebuilt images.\n' >&2; exit 1; }
case "$(docker info --format '{{.Architecture}}')" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) printf 'Prebuilt images support amd64 and arm64.\n' >&2; exit 1 ;;
esac
URL=https://github.com/777genius/social-monitor/releases/download/selfhost-preview-20261018
CACHE=$(mktemp -d "$STATE/images.XXXXXXXX")
trap 'rm -f "$CACHE/SHA256SUMS" "$CACHE/backend-$ARCH.tar.gz" "$CACHE/web-$ARCH.tar.gz"; rmdir "$CACHE"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 "$URL/SHA256SUMS" -o "$CACHE/SHA256SUMS"
for COMPONENT in backend web; do
  FILE="$COMPONENT-$ARCH.tar.gz"
  EXPECTED=$(awk -v file="$FILE" '$2 == file {print $1}' "$CACHE/SHA256SUMS")
  [[ "$EXPECTED" =~ ^[0-9a-f]{64}$ ]] || { printf 'Invalid image checksum manifest.\n' >&2; exit 1; }
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 "$URL/$FILE" -o "$CACHE/$FILE"
  if command -v sha256sum >/dev/null; then ACTUAL=$(sha256sum "$CACHE/$FILE" | awk '{print $1}')
  else ACTUAL=$(shasum -a 256 "$CACHE/$FILE" | awk '{print $1}'); fi
  [[ "$ACTUAL" == "$EXPECTED" ]] || { printf 'Image checksum mismatch.\n' >&2; exit 1; }
  docker load -i "$CACHE/$FILE"
done
