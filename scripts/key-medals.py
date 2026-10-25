#!/usr/bin/env python3
"""
把绿幕勋章原图抠成透明母版。

为什么单独一个脚本，而不是塞进 optimize-assets.py：
两者是**两步**，不是一步。抠图是「减法」——决定哪块像素属于勋章；
压缩是「编码」——决定同样的像素怎么存更小。抠图要的是容差和溢色抑制，
压缩要的是格式和包体，混在一张 JOBS 表里会让这两个决策互相牵制。
抠完的母版进 scripts/assets/medals/master/，那才是 optimize-assets.py 的源。

为什么用「绿超出量」而不是「HSV 落在绿色区间」：
HSV 的色相被明度牵着走。深一点的绿背景（V 低）色相会漂，
压低饱和度时又把金色和蓝色一起卷进来 —— 金色是高饱和的暖色，
正是绿色区间最容易误伤的那个。`绿通道 - max(红,蓝)` 是通道间的比较，
不受明度影响：纯绿是 +255，金是 -37，蓝是 -61，三者分得开。

为什么溢色抑制只压边缘那一层：
金色金属会把绿幕反光吃到表面上，那部分像素是真的金，不该被改。
全图统一去绿会把金色抽成褐色（金的 G=175 而 (R+B)/2=133，一压就掉两成）。
所以修正量按 (1-α) 缩放：越透明的地方修得越狠，实心处基本不动。

为什么母版缩到 1024 而不是留 2048：
勋章在 App 里最大也就 200pt 宽（@3x 是 600px）。留 2048 只是让仓库多背一倍体积，
抠图时那些像素已经没有任何信息量了。缩到 1024 是「比任何实际用途都大一档」。

用法：
    uv run --with pillow --with numpy python3 scripts/key-medals.py
    # 或本机 python3 已装好 Pillow + numpy 时：python3 scripts/key-medals.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MEDALS_DIR = ROOT / "scripts" / "assets" / "medals"
RAW_DIR = MEDALS_DIR / "raw"
MASTER_DIR = MEDALS_DIR / "master"

# ── 抠像参数 ──
#
# 绿超出量的两个阈值：低于 LOW 判为实心，高于 HIGH 判为全透。
# 两档之间线性过渡 —— 这一段就是抗锯齿边缘，绿幕与金属的混色像素落在里面，
# alpha 给成半透明才不会切出锯齿。
LOW = 26
HIGH = 88

# 边缘内缩多少像素。抗锯齿的最外一圈还混着绿，收掉它才没有一圈绿边。
ERODE_PX = 1

# 溢色抑制的上限。绿幕反光在金属边缘最强，全量压会把金色压褐，
# 所以给个上限，只削掉「绿」那一部分。
DESPILL_MAX = 210

# 母版边长。
MASTER_SIZE = 768


def key(img: Image.Image) -> Image.Image:
    """按绿超出量抠掉背景，输出带 alpha 的 RGBA。"""
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    # 绿超出量：绿通道高出另外两通道的最大值越多，越像背景。
    excess = g - np.maximum(r, b)

    # 超出量 → alpha 的反向映射。低于 LOW 是 255（实心），高于 HIGH 是 0（全透）。
    span = HIGH - LOW
    alpha = np.clip((HIGH - excess) * (255.0 / span), 0, 255)

    # 抗锯齿最外一圈混着绿，收掉它。
    if ERODE_PX > 0:
        alpha_img = Image.fromarray(alpha.astype(np.uint8)).filter(
            ImageFilter.MinFilter(ERODE_PX * 2 + 1)
        )
        alpha = np.asarray(alpha_img).astype(np.float32)

    # 溢色抑制：把绿往 (红+蓝)/2 拉，绿被削掉后颜色向金属本色靠拢。
    # 修正量随不透明度衰减：越透明（越靠边）修得越狠，实心处基本不动。
    avg = (r + b) / 2.0
    spill = np.clip(g - avg, 0, None)
    strength = np.minimum(spill, DESPILL_MAX * (1.0 - alpha / 255.0) + 8.0)
    g2 = g - strength

    out = np.dstack([r, g2, b, alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    if not RAW_DIR.exists():
        raise SystemExit(f"[error] 找不到绿幕原图目录：{RAW_DIR}")

    sets = sorted(p for p in RAW_DIR.iterdir() if p.is_dir())
    if not sets:
        raise SystemExit(f"[error] {RAW_DIR} 下面没有方向子目录")

    print("绿幕 → 透明母版：")
    for sdir in sets:
        print(f"  [{sdir.name}]")
        # 生图服务有时回 png（无损，绿幕更干净），有时回 jpg，两种都要收。
        raws = sorted([*sdir.glob("*.jpg"), *sdir.glob("*.png")])
        for src in raws:
            with Image.open(src) as im:
                out = key(im)
            if max(out.size) > MASTER_SIZE:
                out = out.resize(
                    (round(out.width * MASTER_SIZE / max(out.size)),) * 2,
                    Image.LANCZOS,
                )
            dst_dir = MASTER_DIR / sdir.name
            dst_dir.mkdir(parents=True, exist_ok=True)
            # 母版名去掉方向前缀（A-）和 -green 后缀：母版已经抠干净了，
            # 留着 "green" 会骗人；方向前缀在目录名里，不必再进文件名。
            stem = src.stem
            if stem.startswith(f"{sdir.name}-"):
                stem = stem[len(sdir.name) + 1 :]
            if stem.endswith("-green"):
                stem = stem[: -len("-green")]
            dst = dst_dir / f"{stem}.png"
            out.save(dst, "PNG", optimize=True)
            kb = dst.stat().st_size / 1024
            print(f"    · {src.name} → master/{sdir.name}/{dst.name}  {kb:.0f} KB  {out.size[0]}x{out.size[1]}")

    print()
    print("母版在 scripts/assets/medals/master/，产物由 pnpm assets 出到 src/static/medals/。")


if __name__ == "__main__":
    sys.exit(main())
