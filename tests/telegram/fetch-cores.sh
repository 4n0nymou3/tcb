#!/usr/bin/env bash
set -euo pipefail

OUT="${1:?usage: fetch-cores.sh <target-dir> [pinned|latest]}"
MODE="${2:-pinned}"

XRAY_VERSION="v26.11.9"
XRAY_SHA256="b651f7e1d9966ee2c1b1ee1bf8b52c72771824d3065dce96bbc8bcc19ed95f82"
SINGBOX_VERSION="1.14.6"
SINGBOX_SHA256="273e16c1c7881bee94d71e2e38f5bbb5e14971995fd8dd4e145394bf6d23311b"
MIHOMO_VERSION="v1.19.34"
MIHOMO_SHA256="223fab877e5795ce780ba39902e5f0b1113c1256ae244a7160f1165e017e9ccc"
GEO_TAG="202611271415"
GEOIP_SHA256="2c8b3f92780e6d7409bd5b5ec9fd049cf3965c5c474ee8caed50715050b17bd4"
GEOSITE_SHA256="1ea5255b0b110aca3da839367b19d14a1c6c9ef257d4e26606e492e3062b67a5"

latest_tag() {
  curl -fsSI "https://github.com/$1/releases/latest" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | sed 's|.*/tag/||'
}

if [ "$MODE" = "latest" ]; then
  XRAY_VERSION="$(latest_tag XTLS/Xray-core)"
  SINGBOX_VERSION="$(latest_tag SagerNet/sing-box)"
  SINGBOX_VERSION="${SINGBOX_VERSION#v}"
  MIHOMO_VERSION="$(latest_tag MetaCubeX/mihomo)"
elif [ "$MODE" != "pinned" ]; then
  echo "mode must be pinned or latest" >&2
  exit 2
fi

case "$XRAY_VERSION$SINGBOX_VERSION$MIHOMO_VERSION" in
  *alpha*|*beta*|*rc*|*-pre*) echo "refusing a pre-release core: $XRAY_VERSION $SINGBOX_VERSION $MIHOMO_VERSION" >&2; exit 3 ;;
esac

mkdir -p "$OUT"
cd "$OUT"

fetch() {
  curl -fsSL --retry 4 --retry-delay 3 -o "$1" "$2"
}

check() {
  local file="$1" expected="$2" got
  got="$(sha256sum "$file" | cut -d' ' -f1)"
  if [ "$MODE" = "pinned" ] && [ "$got" != "$expected" ]; then
    echo "checksum mismatch for $file: expected $expected got $got" >&2
    exit 1
  fi
  echo "$file sha256=$got"
}

fetch xray.zip "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-64.zip"
fetch xray.zip.dgst "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-64.zip.dgst"
official="$(awk '/^SHA2-256/{print $2}' xray.zip.dgst)"
got_xray="$(sha256sum xray.zip | cut -d' ' -f1)"
if [ -z "$official" ] || [ "$official" != "$got_xray" ]; then
  echo "xray.zip does not match the checksum published by Xray-core" >&2
  exit 1
fi
check xray.zip "$XRAY_SHA256"

fetch sing-box.tar.gz "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-amd64.tar.gz"
check sing-box.tar.gz "$SINGBOX_SHA256"

fetch mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-amd64-${MIHOMO_VERSION}.gz"
check mihomo.gz "$MIHOMO_SHA256"

fetch geoip.dat "https://github.com/Chocolate4U/Iran-v2ray-rules/releases/download/${GEO_TAG}/geoip.dat"
check geoip.dat "$GEOIP_SHA256"
fetch geosite.dat "https://github.com/Chocolate4U/Iran-v2ray-rules/releases/download/${GEO_TAG}/geosite.dat"
check geosite.dat "$GEOSITE_SHA256"

rm -rf xray sing-box-extract
mkdir xray sing-box-extract
unzip -q xray.zip -d xray
tar xzf sing-box.tar.gz -C sing-box-extract
cp sing-box-extract/sing-box-*/sing-box ./sing-box
gunzip -c mihomo.gz > mihomo
chmod +x xray/xray sing-box mihomo

echo "xray:     $(./xray/xray version | head -n 1)"
echo "sing-box: $(./sing-box version | head -n 1)"
echo "mihomo:   $(./mihomo -v | head -n 1)"
