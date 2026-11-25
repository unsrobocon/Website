#!/usr/bin/env bash
# Menyalin bagian simulator yang dibutuhkan website dari repo SimulatorABU ke folder simulator/,
# lalu memasang tambalan kecil untuk Perakit (tools/tambal-simulator.cjs).
#
#   bash tools/sinkron-simulator.sh ../SimulatorABU
#
# Jalankan ulang setiap kali SimulatorABU di-update, lalu commit folder simulator/.
set -euo pipefail
SRC="${1:?pakai: bash tools/sinkron-simulator.sh <folder SimulatorABU>}"
DST="$(cd "$(dirname "$0")/.." && pwd)/simulator"
[ -f "$SRC/js/profiles.js" ] || { echo "Bukan folder SimulatorABU: $SRC" >&2; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
cp "$SRC"/*.html "$DST/"
[ -f "$SRC/versi.json" ] && cp "$SRC/versi.json" "$DST/"
for p in css js assets vendor; do cp -r "$SRC/$p" "$DST/"; done
REV="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "$REV" > "$DST/VERSI-SIMULATOR.txt"
node "$(dirname "$0")/tambal-simulator.cjs" "$DST"
echo "Simulator disalin dari SimulatorABU $REV ke $DST"
