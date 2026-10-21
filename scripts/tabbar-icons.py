#!/usr/bin/env python3
"""
生成 tabBar 图标 —— 钓点（地图钉）/ 数据（趋势线）/ 我的（人形），各含未选中与选中两态。

为什么是脚本而不是手搓图片：图标是要跟着主题走的（选中态用主色蓝），
改一次令牌层 _color.scss 的 $fish-blue 就得重出一套 PNG。留成脚本，改色值只改这里一处，
和 scripts/subset-qweather-icons.py 一样当作资产的唯一出处。

尺寸按微信的官方建议：81×81 px，正方形透明底，图标本身留出四周安全边距
（微信会按 tabBar 实际高度等比缩放，图形顶到边会被切掉一截）。

抗锯齿：先在 4 倍画布上画，再 LANCZOS 缩回 81×81。
直接用 Pillow 的 ellipse/polygon 画再缩放，比逐个手算抗锯齿像素简单得多，
放大 4 倍后锯齿在缩小过程中被自然抹平。
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

# 输出边长（微信建议 81px），以及超采样倍数
SIZE = 81
SS = 4  # 超采样倍数

# 未选中 / 选中两态的色值，必须与令牌层 _color.scss 的 $fish-muted / $fish-blue 对齐，
# 也必须与 pages.json 里 tabBar 的 color / selectedColor 对齐 ——
# 三个地方是同一件事的三个出处，漏改一处，选中时的图标和文字就会一个蓝一个旧蓝。
COLOR_IDLE = (60, 60, 67, 255)  # #3c3c43 = $fish-muted（secondaryLabel）
COLOR_ACTIVE = (0, 122, 255, 255)  # #007aff = $fish-blue（systemBlue）

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "static" / "tabbar"


def new_canvas() -> Image.Image:
    """开一块 SS 倍大的透明画布，并返回配套的 ImageDraw。"""
    img = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def s(v: float) -> float:
    """把 81 单位设计稿里的坐标放大到当前画布。"""
    return v * SS


def save(img: Image.Image, name: str) -> None:
    """缩小回目标尺寸并落盘。"""
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    path = OUT_DIR / name
    out.save(path)
    print(f"  {path.relative_to(OUT_DIR.parent.parent.parent)}  {out.size[0]}×{out.size[1]}  {path.stat().st_size} B")


def draw_spots(color: tuple[int, int, int, int]) -> Image.Image:
    """
    钓点：地图钉。

    轮廓 = 圆（钉头）+ 三角形（钉尖）取并集，两块重叠所以看不出接缝。
    三角形顶点不是随手取的：从钉尖往圆作切线，切点由 acos(r/d) 推出，
    钉身才不会在圆和尖之间鼓出一块多余的肚子。
    """
    img, draw = new_canvas()

    cx, cy = 40.5, 33.0  # 钉头圆心
    r = 21.0  # 钉头半径
    tip_y = 69.0  # 钉尖
    hole_r = 8.0  # 中间的空心

    # 切线切点：圆心到钉尖的方向上，半径与该方向的夹角 β 满足 cos β = r / d
    d = tip_y - cy
    beta = math.acos(r / d)
    tangent_x = r * math.sin(beta)
    tangent_y = cy + r * math.cos(beta)

    draw.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=color)
    draw.polygon(
        [
            (s(cx - tangent_x), s(tangent_y)),
            (s(cx), s(tip_y)),
            (s(cx + tangent_x), s(tangent_y)),
        ],
        fill=color,
    )
    # 空心：填透明而不是白色，图标压在 tabBar 浅色底上才不会露出一个白点
    draw.ellipse(
        [s(cx - hole_r), s(cy - hole_r), s(cx + hole_r), s(cy + hole_r)],
        fill=(0, 0, 0, 0),
    )
    return img


def draw_data(color: tuple[int, int, int, int]) -> Image.Image:
    """
    数据：上升趋势线 + 顶点圆点。

    选趋势线而不是柱状图：这一页全是「随时间变化」的曲线（气温、降水、指数构成），
    柱状图会让人预期这里是分类对比。折线的斜率本身就是「涨/跌」的语义。
    """
    img, draw = new_canvas()

    points = [(12.0, 54.0), (30.0, 42.0), (48.0, 46.0), (69.0, 23.0)]

    draw.line(
        [(s(x), s(y)) for x, y in points],
        fill=color,
        width=int(round(7 * SS)),
        joint="curve",
    )
    # 端点同样要圆角，否则折线起点是平的，视觉上像被切了一刀。
    # 节点半径要小于线宽的一半：节点一大就变成「一串珠子」，缩到 tabBar 实际尺寸后
    # 整条线看着是抖的，不像趋势。
    dot_r = 5.0
    for x, y in points:
        draw.ellipse(
            [s(x - dot_r), s(y - dot_r), s(x + dot_r), s(y + dot_r)],
            fill=color,
        )
    return img


def draw_mine(color: tuple[int, int, int, int]) -> Image.Image:
    """
    我的：头 + 肩。

    头是正圆，肩是**半个椭圆**而不是半圆：正圆加半圆看着像图钉，
    头身一宽一窄才对得上人的肩宽比。肩的横向半径 27、纵向半径 21，
    宽高比 27:21 接近 iOS tabbar person 图标惯用的 1.3:1。

    只画上半：pieslice 从 180° 起画到 360°（PIL 角度自 3 点方向顺时针计），
    取的就是贴着水平中线的那半个椭圆，下缘刚好是直线，正好当肩的底。
    """
    img, draw = new_canvas()

    cx = 40.5

    # 头
    head_cy = 30.0
    head_r = 12.5
    draw.ellipse(
        [s(cx - head_r), s(head_cy - head_r), s(cx + head_r), s(head_cy + head_r)],
        fill=color,
    )

    # 肩：椭圆顶边落在头的下方一点，中间留出一道颈部的空隙
    shoulder_rx = 27.0
    shoulder_ry = 21.0
    shoulder_top = 49.0
    draw.pieslice(
        [
            s(cx - shoulder_rx),
            s(shoulder_top),
            s(cx + shoulder_rx),
            s(shoulder_top + shoulder_ry * 2),
        ],
        start=180,
        end=360,
        fill=color,
    )
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"生成 tabBar 图标（{SIZE}×{SIZE}）→ {OUT_DIR}")
    save(draw_spots(COLOR_IDLE), "spots.png")
    save(draw_spots(COLOR_ACTIVE), "spots-active.png")
    save(draw_data(COLOR_IDLE), "data.png")
    save(draw_data(COLOR_ACTIVE), "data-active.png")
    save(draw_mine(COLOR_IDLE), "mine.png")
    save(draw_mine(COLOR_ACTIVE), "mine-active.png")


if __name__ == "__main__":
    main()
