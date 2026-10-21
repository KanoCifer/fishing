#!/usr/bin/env bash
#
# 生成钓点 marker 图标 —— scripts/markers/*.svg 烧成 80×80 透明底 PNG，输出到 src/static/markers/。
#
# 为什么是脚本而不是手搓图片：marker 是跟着水体类型走的 —— 每新增一种 kind
# 就要多一张图（见 src/composables/useMapMarkers.ts 的 ICON_BY_KIND）。
# 手搓的话，「改了 SVG 忘了重出 PNG」和「新加了 kind 忘了画图」两种错都得靠人眼发现，
# 而后一种在小程序里表现为「地图上那一片点全是同一个图标」，很难一眼看出是缺图。
#
# 与 scripts/gen-icons.mjs 同一个思路：脚本是资产的唯一出处。
# SVG 是源，PNG 是产物，产物不手改 —— 要改形状就改 SVG 再重跑本脚本。
#
# 依赖：rsvg-convert（librsvg 的命令行版）。
#   brew install librsvg
#
# 用法：bash scripts/gen-markers.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT/scripts/markers"
OUT_DIR="$ROOT/src/static/markers"

# 尺寸跟着现有资产走。src/static 下的小程序按原图尺寸算密度，
# 80px 的源在 2x 屏上按 40px 显示（见 useMapMarkers.ts 的 MARKER_SIZE）。
SIZE=80

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "[error] 需要 rsvg-convert。安装：brew install librsvg" >&2
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "[error] 找不到源目录：$SRC_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

count=0
for svg in "$SRC_DIR"/*.svg; do
  [ -e "$svg" ] || continue
  name="$(basename "$svg" .svg)"
  rsvg-convert -w "$SIZE" -h "$SIZE" "$svg" -o "$OUT_DIR/$name.png"
  echo "  · $name.svg → src/static/markers/$name.png"
  count=$((count + 1))
done

echo "生成 $count 个 marker（${SIZE}×${SIZE}）→ src/static/markers/"
